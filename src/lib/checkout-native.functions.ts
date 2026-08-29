import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productSchema = z.object({
  productId: z.string().min(1),
  productType: z.enum(["course", "ebook", "fidelize"]),
  /** Desconto percentual de order bump/upsell aplicado sobre o preço do catálogo. */
  discountPercent: z.number().min(0).max(90).optional(),
});

/** Dados do pagador pré-preenchidos a partir do perfil do aluno. */
export const getCheckoutProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone, cpf")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      name: (data as any)?.name ?? "",
      email: (data as any)?.email ?? (context.claims as any)?.email ?? "",
      phone: (data as any)?.phone ?? "",
      cpf: (data as any)?.cpf ?? "",
    };
  });

export const createNativeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        products: z.array(productSchema).min(1).max(6),
        method: z.enum(["PIX", "CREDIT_CARD", "BOLETO"]),
        recurring: z.boolean().optional(),
        affiliateRef: z.string().optional().nullable(),
        couponCode: z.string().trim().max(40).optional().nullable(),
        checkoutContext: z.enum(["main", "upsell", "downsell", "order_bump"]).optional(),
        payer: z.object({
          name: z.string().trim().min(3).max(120),
          email: z.string().trim().email().max(180),
          cpfCnpj: z.string().trim().min(11).max(20),
          phone: z.string().trim().max(20).optional().nullable(),
        }),
        card: z
          .object({
            holderName: z.string().trim().min(3).max(120),
            number: z.string().trim().min(12).max(25),
            expiryMonth: z.string().trim().min(1).max(2),
            expiryYear: z.string().trim().min(2).max(4),
            ccv: z.string().trim().min(3).max(4),
            postalCode: z.string().trim().max(12).optional().nullable(),
            addressNumber: z.string().trim().max(10).optional().nullable(),
          })
          .optional()
          .nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { priceProduct, createNativeCharge } = await import("./checkout-native.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const priced = [] as { productId: string; productType: "course" | "ebook" | "fidelize"; title: string; value: number }[];
    for (const p of data.products) {
      const item = await priceProduct(p.productId, p.productType);
      const discount = p.discountPercent ? 1 - p.discountPercent / 100 : 1;
      priced.push({ ...item, value: Math.round(item.value * discount * 100) / 100 });
    }

    const main = priced[0]!;
    const recurring = data.recurring === true || priced.some((p) => p.productType === "fidelize");

    // Cupom: validação/resgate atômicos no banco, sempre sobre o preço autoritativo.
    let couponCode: string | null = null;
    if (data.couponCode) {
      const { data: redemption, error } = await (supabaseAdmin as any).rpc("redeem_coupon", {
        p_code: data.couponCode,
        p_product_id: main.productId,
        p_product_type: main.productType,
        p_amount: main.value,
        p_user_id: context.userId,
        p_context: data.checkoutContext ?? "main",
        p_metadata: { products: priced.map((p) => ({ id: p.productId, type: p.productType, value: p.value })) },
      });
      if (error) throw new Error("Não foi possível aplicar o cupom. Tente novamente.");
      if (!redemption?.valid) throw new Error(redemption?.message || "Cupom inválido ou expirado.");
      const discountAmount = Number(redemption.discount_amount) || 0;
      if (discountAmount > 0) {
        priced[0] = { ...main, value: Number(redemption.final_amount) };
        couponCode = redemption.code;
      }
    }

    const totalValue = Math.round(priced.reduce((acc, p) => acc + p.value, 0) * 100) / 100;

    // 100% de desconto: libera na hora, sem cobrança.
    if (totalValue <= 0) {
      if (priced.some((p) => p.productType === "fidelize")) {
        throw new Error("Planos Fidelize não podem ser liberados gratuitamente.");
      }
      for (const p of priced) await fulfill(p.productType, p.productId, context, `free:${p.productId}`);
      return { free: true, confirmed: true, coupon: couponCode, paymentId: null, value: 0 };
    }

    if (data.method === "CREDIT_CARD" && !data.card) {
      throw new Error("Dados do cartão são obrigatórios.");
    }

    const charge = await createNativeCharge({
      product: priced[0]!,
      totalValue,
      orderTitle: priced.map((p) => p.title).join(" + "),
      method: data.method,
      recurring,
      userId: context.userId,
      affiliateRef: data.affiliateRef || null,
      payer: data.payer,
      card: data.card ?? null,
    });

    if (charge.confirmed) {
      for (const p of priced) await fulfill(p.productType, p.productId, context, charge.paymentId);
    }

    return { ...charge, free: false, coupon: couponCode, products: priced, recurring };
  });

/** Polling: consulta o status e libera o acesso assim que o pagamento é aprovado. */
export const getNativeCheckoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().min(3),
        products: z.array(productSchema).min(1).max(6),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { fetchChargeStatus } = await import("./checkout-native.server");
    try {
      const status = await fetchChargeStatus(data.paymentId);
      if (!status.confirmed) return { confirmed: false, status: status.status };
      let granted = true;
      for (const p of data.products) {
        const ok = await fulfill(p.productType, p.productId, context, data.paymentId);
        granted = granted && ok;
      }
      return { confirmed: true, status: status.status, granted };
    } catch (error: any) {
      return { confirmed: false, status: "UNKNOWN", message: error?.message };
    }
  });

/** Libera o produto comprado (curso, e-book ou provisionamento Fidelize). */
async function fulfill(
  productType: "course" | "ebook" | "fidelize",
  productId: string,
  context: any,
  paymentId: string,
): Promise<boolean> {
  if (productType === "fidelize") {
    const { provisionFidelizeAccount } = await import("./fidelize-provisioning.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", context.userId)
      .maybeSingle();
    const email = (profile as any)?.email || (context.claims as any)?.email;
    if (!email) return false;
    const result = await provisionFidelizeAccount({
      orderId: paymentId,
      userId: context.userId,
      plan: productId as any,
      name: (profile as any)?.name || "Cliente",
      email,
      phone: (profile as any)?.phone || null,
    });
    return result.success;
  }

  const { grantAccess } = await import("./asaas.server");
  return grantAccess(productType, productId, context.userId);
}
