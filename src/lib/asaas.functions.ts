import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  asaasErrorMessage,
  asaasFetchJson,
  asaasHeaders,
  buildExternalReference,
  findConfirmedPayment,
  getAsaasConfig,
  grantAccess,
} from "./asaas.server";

export const createAsaasPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    products: z.array(z.object({
      productId: z.string(),
      productType: z.enum(['course', 'ebook']),
      title: z.string(),
      description: z.string().optional().nullable(),
      value: z.number().optional(),
    })),
    affiliateRef: z.string().optional(),
    paymentType: z.enum(['unique', 'recurring']).optional(),
    dueDays: z.number().optional(),
    couponCode: z.string().trim().max(40).optional(),
    checkoutContext: z.enum(['main', 'upsell', 'downsell', 'order_bump']).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { apiKey, baseUrl, isTestMode } = await getAsaasConfig();

    console.log(`[Asaas] Ambiente: ${isTestMode ? 'SANDBOX' : 'PRODUCTION'} | URL: ${baseUrl}`);

    try {
      // SECURITY: preços autoritativos vêm do banco, nunca do cliente.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const pricedProducts: { productId: string; productType: 'course' | 'ebook'; title: string; value: number }[] = [];
      for (const p of data.products) {
        const table = p.productType === 'course' ? 'courses' : 'ebooks';
        const { data: row, error: priceError } = await supabaseAdmin
          .from(table)
          .select('price, title, status')
          .eq('id', p.productId)
          .maybeSingle();
        if (priceError || !row) throw new Error("Produto não encontrado.");
        if ((row as any).status === 'coming_soon') throw new Error("Este conteúdo será lançado em breve.");
        if ((row as any).status !== 'active') throw new Error("Produto indisponível para compra.");
        const price = Number((row as any).price ?? 0);
        if (!(price > 0)) throw new Error("Produto sem preço válido para checkout.");
        pricedProducts.push({
          productId: p.productId,
          productType: p.productType,
          title: (row as any).title || p.title,
          value: price,
        });
      }

      // CUPOM: validação e resgate atômicos no banco (anti-fraude e anti-concorrência).
      // O desconto é sempre recalculado no servidor sobre o preço autoritativo do produto principal.
      let couponApplied: { code: string; discountAmount: number; finalAmount: number } | null = null;
      if (data.couponCode) {
        const main = pricedProducts[0];
        const { data: redemption, error: couponError } = await (supabaseAdmin as any).rpc("redeem_coupon", {
          p_code: data.couponCode,
          p_product_id: main.productId,
          p_product_type: main.productType,
          p_amount: main.value,
          p_user_id: context.userId,
          p_context: data.checkoutContext ?? "main",
          p_metadata: {
            products: pricedProducts.map((p) => ({ id: p.productId, type: p.productType, value: p.value })),
          },
        });

        if (couponError) {
          console.error("[Coupons] Erro ao resgatar cupom:", couponError);
          throw new Error("Não foi possível aplicar o cupom. Tente novamente.");
        }
        if (!redemption?.valid) {
          throw new Error(redemption?.message || "Cupom inválido ou expirado.");
        }

        const discountAmount = Number(redemption.discount_amount) || 0;
        if (discountAmount > 0) {
          pricedProducts[0] = { ...main, value: Number(redemption.final_amount) };
          couponApplied = {
            code: redemption.code,
            discountAmount,
            finalAmount: Number(redemption.final_amount),
          };
          console.log(`[Coupons] Cupom ${redemption.code} aplicado: -R$ ${discountAmount} em ${main.productId}`);
        }
      }

      const totalValue = Math.round(pricedProducts.reduce((acc, p) => acc + p.value, 0) * 100) / 100;
      const mainProduct = pricedProducts[0];

      // 100% DE DESCONTO: libera o acesso imediatamente, sem gerar cobrança no Asaas.
      if (totalValue <= 0) {
        for (const p of pricedProducts) {
          await grantAccess(p.productType, p.productId, context.userId);
        }
        return { free: true, coupon: couponApplied?.code ?? null, url: null, id: null };
      }
      const rawTitles = pricedProducts.map(p => p.title).join(' + ');

      // Sanitização rigorosa para o Asaas: apenas alfanuméricos, espaços, hífen e underscore.
      // Remove acentos e caracteres especiais que causam o erro "O nome do link de pagamento não pode conter caracteres especiais."
      const sanitizeAsaasName = (text: string) => {
        return text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // Remove acentos
          .replace(/[^\w\s-]/g, "") // Remove tudo que não é alfanumérico, espaço, hífen ou underscore
          .replace(/\s+/g, " ") // Colapsa múltiplos espaços
          .trim();
      };

      const sanitizedName = sanitizeAsaasName(rawTitles);
      const finalName = sanitizedName.length > 100 
        ? sanitizedName.substring(0, 97) + '...' 
        : sanitizedName;

      const response = await asaasFetchJson(`${baseUrl}/paymentLinks`, {
        method: 'POST',
        headers: asaasHeaders(apiKey),
        body: JSON.stringify({
          name: finalName || `Pedido ${mainProduct.productId}`,
          description: `Acesso a: ${rawTitles.substring(0, 450)}`, // Descrição pode ser mais permissiva, mas limitamos tamanho
          value: totalValue,
          billingType: 'UNDEFINED',
          chargeType: data.paymentType === 'recurring' ? 'RECURRENT' : 'DETACHED',
          dueDateLimitDays: data.dueDays || 3,
          endDate: null,
          notificationEnabled: true,
          externalReference: buildExternalReference({
            productType: mainProduct.productType,
            productId: mainProduct.productId,
            userId: context.userId,
            affiliateRef: data.affiliateRef || null,
          }),
        })
      });

      if (!response.ok || !response.json) {
        console.error(
          `[Asaas] Falha ao criar link (HTTP ${response.status}):`,
          response.text?.slice(0, 300),
        );
        throw new Error(asaasErrorMessage(response));
      }

      const result = response.json;

      return { url: result.url, id: result.id };
    } catch (error: any) {
      console.error("[Asaas] Erro ao criar link:", error);
      throw new Error(error?.message || "Falha na comunicação com o Asaas. Tente novamente em instantes.");
    }
  });

/** Verificação manual: consulta o Asaas e libera o acesso se o pagamento já foi confirmado. */
export const verifyAsaasPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    productId: z.string(),
    productType: z.enum(['course', 'ebook']),
  }).parse(data))
  .handler(async ({ data, context }) => {
    try {
      const payment = await findConfirmedPayment({
        productType: data.productType,
        productId: data.productId,
        userId: context.userId,
        userEmail: (context.claims as any)?.email ?? null,
      });


      if (!payment) {
        return { confirmed: false, message: "Nenhum pagamento confirmado encontrado ainda." };
      }

      const granted = await grantAccess(data.productType, data.productId, context.userId);
      return {
        confirmed: granted,
        message: granted
          ? "Pagamento confirmado e acesso liberado."
          : "Pagamento encontrado, mas houve falha ao liberar o acesso.",
      };
    } catch (error: any) {
      console.error("[Asaas] Erro na verificação manual:", error);
      return { confirmed: false, message: error.message || "Falha ao verificar o pagamento." };
    }
  });

/** Sonda a página de checkout do Asaas antes de mandar o cliente para lá. */
export const checkAsaasCheckoutHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    const { probeAsaasCheckout } = await import("./asaas.server");
    return probeAsaasCheckout(data.url);
  });
