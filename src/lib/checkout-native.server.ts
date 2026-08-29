// Checkout nativo (dentro do Ronnei) usando a API do Asaas.
// Nenhum redirecionamento: criamos cliente + cobrança e devolvemos PIX/boleto/cartão.
import {
  asaasErrorMessage,
  asaasFetchJson,
  asaasHeaders,
  buildExternalReference,
  getAsaasConfig,
} from "./asaas.server";

export type CheckoutMethod = "PIX" | "CREDIT_CARD" | "BOLETO";
export type CheckoutProductType = "course" | "ebook" | "fidelize";

export interface PricedProduct {
  productId: string;
  productType: CheckoutProductType;
  title: string;
  value: number;
}

/** Preço autoritativo: sempre do banco/catálogo, nunca do cliente. */
export async function priceProduct(
  productId: string,
  productType: CheckoutProductType,
): Promise<PricedProduct> {
  if (productType === "fidelize") {
    const { isFidelizePlan } = await import("./fidelize-plans");
    const { getFidelizePlanRecord } = await import("./fidelize-plans.server");
    if (!isFidelizePlan(productId)) throw new Error("Plano Fidelize inválido.");
    const plan = await getFidelizePlanRecord(productId);
    if (!plan.active) throw new Error("Este plano Fidelize está indisponível no momento.");
    if (!(plan.price > 0)) throw new Error("Plano Fidelize sem preço válido para checkout.");
    return { productId, productType, title: plan.label, value: plan.price };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = productType === "course" ? "courses" : "ebooks";
  const { data: row, error } = await supabaseAdmin
    .from(table)
    .select("price, title, status")
    .eq("id", productId)
    .maybeSingle();
  if (error || !row) throw new Error("Produto não encontrado.");
  if ((row as any).status === "coming_soon") throw new Error("Este conteúdo será lançado em breve.");
  if ((row as any).status !== "active") throw new Error("Produto indisponível para compra.");
  const price = Number((row as any).price ?? 0);
  if (!(price > 0)) throw new Error("Produto sem preço válido para checkout.");
  return { productId, productType, title: (row as any).title, value: price };
}

function sanitizeName(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function call(
  config: { apiKey: string; baseUrl: string },
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, any>,
) {
  const res = await asaasFetchJson(`${config.baseUrl}${path}`, {
    method,
    headers: asaasHeaders(config.apiKey),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok || !res.json) throw new Error(asaasErrorMessage(res));
  return res.json;
}

/** Cria (ou reaproveita) o cliente no Asaas a partir dos dados do aluno. */
export async function ensureAsaasCustomer(
  config: { apiKey: string; baseUrl: string },
  payer: { name: string; email: string; cpfCnpj: string; phone?: string | null },
) {
  const doc = payer.cpfCnpj.replace(/\D/g, "");
  const existing = await call(config, `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`);
  if (existing?.data?.[0]?.id) return existing.data[0].id as string;

  const created = await call(config, "/customers", "POST", {
    name: sanitizeName(payer.name) || "Cliente",
    email: payer.email,
    cpfCnpj: doc,
    ...(payer.phone ? { mobilePhone: payer.phone.replace(/\D/g, "") } : {}),
    notificationDisabled: false,
  });
  if (!created?.id) throw new Error("Não foi possível registrar seus dados no processador de pagamento.");
  return created.id as string;
}

function isoDate(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export interface CreateChargeInput {
  product: PricedProduct;
  method: CheckoutMethod;
  recurring: boolean;
  userId: string;
  affiliateRef?: string | null;
  payer: { name: string; email: string; cpfCnpj: string; phone?: string | null };
  card?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
    postalCode?: string | null;
    addressNumber?: string | null;
  } | null;
  remoteIp?: string | null;
}

export interface ChargeResult {
  paymentId: string;
  subscriptionId: string | null;
  status: string;
  confirmed: boolean;
  method: CheckoutMethod;
  value: number;
  pix?: { payload: string; encodedImage: string; expiresAt?: string | null } | null;
  boleto?: { url: string | null; identificationField: string | null } | null;
}

export async function createNativeCharge(input: CreateChargeInput): Promise<ChargeResult> {
  const config = await getAsaasConfig();
  const customer = await ensureAsaasCustomer(config, input.payer);

  const externalReference = buildExternalReference({
    productType: input.product.productType,
    productId: input.product.productId,
    userId: input.userId,
    affiliateRef: input.affiliateRef || null,
  });

  const description = `Acesso a: ${input.product.title}`.slice(0, 480);
  const holderInfo = input.card
    ? {
        name: sanitizeName(input.payer.name) || "Cliente",
        email: input.payer.email,
        cpfCnpj: input.payer.cpfCnpj.replace(/\D/g, ""),
        postalCode: (input.card.postalCode || "01310930").replace(/\D/g, ""),
        addressNumber: input.card.addressNumber || "0",
        phone: (input.payer.phone || "").replace(/\D/g, "") || undefined,
      }
    : undefined;

  const cardPayload = input.card
    ? {
        creditCard: {
          holderName: input.card.holderName,
          number: input.card.number.replace(/\D/g, ""),
          expiryMonth: input.card.expiryMonth,
          expiryYear: input.card.expiryYear.length === 2 ? `20${input.card.expiryYear}` : input.card.expiryYear,
          ccv: input.card.ccv,
        },
        creditCardHolderInfo: holderInfo,
        ...(input.remoteIp ? { remoteIp: input.remoteIp } : {}),
      }
    : {};

  let payment: any;
  let subscriptionId: string | null = null;

  if (input.recurring) {
    const subscription = await call(config, "/subscriptions", "POST", {
      customer,
      billingType: input.method,
      value: input.product.value,
      nextDueDate: isoDate(input.method === "BOLETO" ? 3 : 0),
      cycle: "MONTHLY",
      description,
      externalReference,
      ...cardPayload,
    });
    subscriptionId = subscription?.id ?? null;
    const payments = await call(config, `/subscriptions/${subscription.id}/payments?limit=1`);
    payment = payments?.data?.[0];
    if (!payment?.id) throw new Error("Assinatura criada, mas a primeira cobrança não foi gerada.");
  } else {
    payment = await call(config, "/payments", "POST", {
      customer,
      billingType: input.method,
      value: input.product.value,
      dueDate: isoDate(input.method === "BOLETO" ? 3 : 0),
      description,
      externalReference,
      ...cardPayload,
    });
  }

  const result: ChargeResult = {
    paymentId: payment.id,
    subscriptionId,
    status: payment.status,
    confirmed: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status),
    method: input.method,
    value: Number(payment.value ?? input.product.value),
  };

  if (input.method === "PIX") {
    try {
      const qr = await call(config, `/payments/${payment.id}/pixQrCode`);
      result.pix = {
        payload: qr?.payload ?? "",
        encodedImage: qr?.encodedImage ?? "",
        expiresAt: qr?.expirationDate ?? null,
      };
    } catch (e: any) {
      console.error("[Checkout] Falha ao gerar QR Code PIX:", e?.message);
      throw new Error("Não foi possível gerar o PIX agora. Tente novamente em instantes.");
    }
  }

  if (input.method === "BOLETO") {
    let identificationField: string | null = null;
    try {
      const idf = await call(config, `/payments/${payment.id}/identificationField`);
      identificationField = idf?.identificationField ?? null;
    } catch {
      identificationField = null;
    }
    result.boleto = { url: payment.bankSlipUrl ?? payment.invoiceUrl ?? null, identificationField };
  }

  return result;
}

/** Consulta o status atual da cobrança no Asaas. */
export async function fetchChargeStatus(paymentId: string) {
  const config = await getAsaasConfig();
  const payment = await call(config, `/payments/${paymentId}`);
  return {
    status: payment?.status as string,
    confirmed: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment?.status),
    externalReference: payment?.externalReference ?? null,
    customerEmail: payment?.customerEmail ?? null,
  };
}
