import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const productSchema = z.object({
  productId: z.string().min(1),
  productType: z.enum(["course", "ebook", "fidelize", "consultation"]),
  /**
   * Ignorado no servidor: o desconto de order bump/upsell é sempre recalculado
   * a partir de `offer_settings` (admin). Mantido apenas por compatibilidade
   * com chamadas antigas — nunca influencia o preço cobrado.
   */
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

    const priced = [] as {
      productId: string;
      productType: "course" | "ebook" | "fidelize" | "consultation";
      title: string;
      value: number;
    }[];

    // Desconto de order bump/upsell: SEMPRE derivado do admin (`offer_settings`),
    // nunca do cliente. O produto principal jamais recebe desconto automático —
    // só cupom, validado atomicamente no banco mais abaixo.
    let bumpDiscount = 0;
    if (data.products.length > 1) {
      const { data: offerConfig } = await supabaseAdmin
        .from("integrations")
        .select("status, settings")
        .eq("category", "offer_settings")
        .maybeSingle();
      if ((offerConfig as any)?.status) {
        const settings = (offerConfig as any)?.settings;
        const configured = Number(
          settings && typeof settings === "object" ? (settings as any).discountPercentage : 0,
        );
        bumpDiscount = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 90) : 0;
      }
    }

    for (let i = 0; i < data.products.length; i++) {
      const p = data.products[i]!;
      const item = await priceProduct(p.productId, p.productType);
      // Índice 0 = produto principal (sem desconto). Demais = itens adicionais.
      const percent = i === 0 ? 0 : bumpDiscount;
      const factor = percent > 0 ? 1 - percent / 100 : 1;
      priced.push({ ...item, value: Math.round(item.value * factor * 100) / 100 });
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
      const freeCredits: ConsultationCredit[] = [];
      for (const p of priced) {
        const res = await fulfill(p.productType, p.productId, context, `free:${p.productId}`, p.value);
        if (res.credit) freeCredits.push(res.credit);
      }
      return {
        free: true,
        confirmed: true,
        coupon: couponCode,
        paymentId: null,
        value: 0,
        consultationCredits: freeCredits,
      };
    }

    if (data.method === "CREDIT_CARD" && !data.card) {
      throw new Error("Dados do cartão são obrigatórios.");
    }

    /*
     * PASSO DURÁVEL PRÉ-COBRANÇA:
     *
     * Guardamos todos os itens antes de chamar o gateway.
     * Se o banco falhar aqui, é seguro interromper porque
     * nenhuma cobrança ainda foi criada.
     */
    const { rememberCheckoutIntent } = await import(
      "./checkout-payment-snapshot.server"
    );

    await rememberCheckoutIntent({
      userId: context.userId,
      method: data.method,
      totalValue,
      products: priced,
      couponCode,
    });

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

    /*
     * A cobrança já existe no Asaas neste ponto.
     * Antes de devolver PIX/cartão/boleto ao navegador, persistimos
     * no servidor o paymentId + usuário + TODOS os produtos do pedido.
     *
     * O navegador não será mais a fonte de verdade para a liberação.
     */
    const { rememberCheckoutPayment } = await import(
      "./checkout-payment-snapshot.server"
    );

    let checkoutSnapshotSaved = false;
    let checkoutSnapshotError: unknown = null;

    /*
     * Pequenas falhas transitórias de banco não podem fazer perder
     * o vínculo da cobrança. Tentamos 3 vezes antes de gerar alerta.
     */
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await rememberCheckoutPayment({
          paymentId: charge.paymentId,
          userId: context.userId,
          status: charge.status,
          method: charge.method,
          totalValue,
          products: priced,
          subscriptionId: charge.subscriptionId,
          couponCode,
        });

        checkoutSnapshotSaved = true;
        break;
      } catch (error: any) {
        checkoutSnapshotError = error;

        console.error(
          `[Checkout] Snapshot da cobrança falhou (${attempt}/3):`,
          error?.message || error,
        );

        if (attempt < 3) {
          await new Promise((resolve) =>
            setTimeout(resolve, attempt * 300),
          );
        }
      }
    }

    /*
     * A cobrança já foi criada no gateway; portanto NÃO lançamos um
     * erro ao cliente aqui, pois isso poderia induzi-lo a tentar de
     * novo e criar uma segunda cobrança.
     *
     * Em vez disso, geramos alerta operacional crítico. A referência
     * externa do Asaas continua permitindo recuperação do produto
     * principal, e a reconciliação será fortalecida nas próximas etapas.
     */
    if (!checkoutSnapshotSaved) {
      console.error(
        `[Checkout] CRITICAL: cobrança ${charge.paymentId} criada sem snapshot persistido.`,
      );

      try {
        const { raiseOpsAlert } = await import(
          "./ops-alerts.server"
        );

        await raiseOpsAlert({
          type: "checkout_snapshot_failed",
          dedupKey: `checkout_snapshot_failed:${charge.paymentId}`,
          title: "Cobrança criada sem snapshot do pedido",
          message:
            "Uma cobrança foi criada no Asaas, mas o vínculo completo dos produtos não pôde ser persistido após 3 tentativas.",
          details: {
            paymentId: charge.paymentId,
            userId: context.userId,
            productCount: priced.length,
            error: String(
              (checkoutSnapshotError as any)?.message ||
                checkoutSnapshotError ||
                "erro desconhecido",
            ).slice(0, 500),
          },
        });
      } catch (alertError: any) {
        console.error(
          "[Checkout] Falha também ao registrar alerta do snapshot:",
          alertError?.message || alertError,
        );
      }
    }

    const consultationCredits: ConsultationCredit[] = [];
    if (charge.confirmed) {
      for (const p of priced) {
        const res = await fulfill(p.productType, p.productId, context, charge.paymentId, p.value);
        if (res.credit) consultationCredits.push(res.credit);
      }
    }

    return { ...charge, free: false, coupon: couponCode, products: priced, recurring, consultationCredits };
  });


/** Polling seguro: o navegador informa o paymentId, mas nunca decide quais produtos serão liberados. */
export const getNativeCheckoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().min(3),

        /*
         * Compatibilidade temporária com o front já publicado.
         * Clientes antigos ainda podem enviar `products`, porém
         * esse campo NÃO participa mais da autorização/liberação.
         */
        products: z
          .array(productSchema)
          .min(1)
          .max(6)
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      const {
        assertCheckoutPaymentOwnership,
        getAuthoritativeCheckoutProducts,
      } = await import(
        "./checkout-payment-snapshot.server"
      );

      /*
       * Uma única consulta autoritativa:
       * - busca a cobrança direto no Asaas;
       * - valida externalReference;
       * - prova que o pagamento pertence ao usuário logado.
       */
      const owned =
        await assertCheckoutPaymentOwnership(
          data.paymentId,
          context.userId,
        );

      const paymentStatus = String(
        owned.payment?.status || "UNKNOWN",
      );

      const confirmed = [
        "RECEIVED",
        "CONFIRMED",
        "RECEIVED_IN_CASH",
      ].includes(paymentStatus);

      if (!confirmed) {
        return {
          confirmed: false,
          status: paymentStatus,
          consultationCredits: [],
        };
      }

      /*
       * Fonte de verdade:
       * 1. payments.metadata criado na Etapa 2;
       * 2. pending_checkouts.metadata;
       * 3. externalReference somente para cobranças antigas.
       *
       * data.products enviado pelo browser é ignorado.
       */
      const trustedProducts =
        await getAuthoritativeCheckoutProducts(
          data.paymentId,
          context.userId,
          owned.parsed,
        );

      if (trustedProducts.length === 0) {
        return {
          confirmed: true,
          status: paymentStatus,
          granted: false,
          message:
            "Pagamento confirmado, mas o pedido não pôde ser reconstruído com segurança.",
          consultationCredits: [],
        };
      }

      /*
       * Curso/e-book passam pelo pipeline central:
       * acesso + confirmação + pagamento +
       * admin/push + e-mail + auditoria.
       *
       * Fidelize/consultoria permanecem no fluxo
       * especializado atual nesta release.
       */
      const standardOnly =
        trustedProducts.every(
          (product) =>
            product.productType === "course" ||
            product.productType === "ebook",
        );

      if (standardOnly) {
        const {
          finalizeStandardPaidSale,
        } = await import(
          "./sale-finalization.server"
        );

        const finalized =
          await finalizeStandardPaidSale({
            payment: owned.payment,
            userId: context.userId,
            products: trustedProducts,
            source: "polling",
          });

        return {
          confirmed: true,
          status: paymentStatus,
          granted: finalized.ok,
          consultationCredits: [],
        };
      }

      let granted = true;
      const consultationCredits:
        ConsultationCredit[] = [];

      for (const product of trustedProducts) {
        const result = await fulfill(
          product.productType,
          product.productId,
          context,
          data.paymentId,
          product.value,
        );

        if (result.credit) {
          consultationCredits.push(
            result.credit,
          );
        }

        granted = granted && result.ok;
      }

      return {
        confirmed: true,
        status: paymentStatus,
        granted,
        consultationCredits,
      };
    } catch (error: any) {
      console.error(
        "[Checkout] Falha no polling seguro:",
        error?.message || error,
      );

      return {
        confirmed: false,
        status: "UNKNOWN",
        message:
          error?.message ||
          "Não foi possível verificar o pagamento.",
        consultationCredits: [],
      };
    }
  });


export type ConsultationCredit = {
  id: string;
  productId: string;
  productTitle: string;
};

/** Libera o produto comprado (curso, e-book, Fidelize ou crédito de consultoria). */
async function fulfill(
  productType: "course" | "ebook" | "fidelize" | "consultation",
  productId: string,
  context: any,
  paymentId: string,
  amount?: number,
): Promise<{ ok: boolean; credit?: ConsultationCredit }> {
  if (productType === "consultation") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotente: o mesmo pagamento nunca gera dois créditos do mesmo produto.
    const { data: existing } = await supabaseAdmin
      .from("consultation_credits")
      .select("id, product_id, product_title")
      .eq("user_id", context.userId)
      .eq("product_id", productId)
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existing) {
      return {
        ok: true,
        credit: {
          id: (existing as any).id,
          productId: (existing as any).product_id,
          productTitle: (existing as any).product_title,
        },
      };
    }

    const { data: product } = await supabaseAdmin
      .from("consultation_products")
      .select("id, title, price")
      .eq("id", productId)
      .maybeSingle();
    if (!product) return { ok: false };

    const { data: created, error } = await supabaseAdmin
      .from("consultation_credits")
      .insert({
        user_id: context.userId,
        product_id: productId,
        product_title: (product as any).title,
        amount: amount ?? Number((product as any).price ?? 0),
        payment_id: paymentId,
        status: "available",
      } as never)
      .select("id, product_id, product_title")
      .maybeSingle();

    if (error || !created) return { ok: false };
    return {
      ok: true,
      credit: {
        id: (created as any).id,
        productId: (created as any).product_id,
        productTitle: (created as any).product_title,
      },
    };
  }

  if (productType === "fidelize") {
    const { provisionFidelizeAccount } = await import("./fidelize-provisioning.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", context.userId)
      .maybeSingle();
    const email = (profile as any)?.email || (context.claims as any)?.email;
    if (!email) return { ok: false };
    const result = await provisionFidelizeAccount({
      orderId: paymentId,
      userId: context.userId,
      plan: productId as any,
      name: (profile as any)?.name || "Cliente",
      email,
      phone: (profile as any)?.phone || null,
    });
    return { ok: result.success };
  }

  const { grantAccess } = await import("./asaas.server");
  const ok = await grantAccess(productType, productId, context.userId);
  return { ok };
}

