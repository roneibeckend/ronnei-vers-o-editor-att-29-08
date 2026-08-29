import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productSchema = z.object({
  productId: z.string().min(1),
  productType: z.enum(["course", "ebook", "fidelize"]),
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
        product: productSchema,
        method: z.enum(["PIX", "CREDIT_CARD", "BOLETO"]),
        recurring: z.boolean().optional(),
        affiliateRef: z.string().optional().nullable(),
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
    const product = await priceProduct(data.product.productId, data.product.productType);
    const recurring = data.recurring === true || product.productType === "fidelize";

    if (data.method === "CREDIT_CARD" && !data.card) {
      throw new Error("Dados do cartão são obrigatórios.");
    }

    const charge = await createNativeCharge({
      product,
      method: data.method,
      recurring,
      userId: context.userId,
      affiliateRef: data.affiliateRef || null,
      payer: data.payer,
      card: data.card ?? null,
    });

    if (charge.confirmed) {
      await fulfill(product.productType, product.productId, context, charge.paymentId);
    }

    return { ...charge, product: { ...product, recurring } };
  });

/** Polling: consulta o status e libera o acesso assim que o pagamento é aprovado. */
export const getNativeCheckoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ paymentId: z.string().min(3), product: productSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { fetchChargeStatus } = await import("./checkout-native.server");
    try {
      const status = await fetchChargeStatus(data.paymentId);
      if (!status.confirmed) return { confirmed: false, status: status.status };
      const granted = await fulfill(
        data.product.productType,
        data.product.productId,
        context,
        data.paymentId,
      );
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
      plan: productId,
      name: (profile as any)?.name || "Cliente",
      email,
      phone: (profile as any)?.phone || null,
    });
    return result.success;
  }

  const { grantAccess } = await import("./asaas.server");
  return grantAccess(productType, productId, context.userId);
}
