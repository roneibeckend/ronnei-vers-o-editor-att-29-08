/**
 * Google Tag Manager — container GTM-M376JTZP.
 *
 * O snippet oficial é injetado uma única vez no <head> global
 * (src/routes/__root.tsx) e o <noscript> logo após o <body>.
 * Este módulo só expõe helpers de dataLayer, seguros em SSR.
 */

export const GTM_ID = "GTM-M376JTZP";

type DataLayerEvent = Record<string, unknown> & { event: string };

/** Empurra um evento no dataLayer (no-op em SSR). */
export function gtmPush(payload: DataLayerEvent): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ...payload, timestamp: new Date().toISOString() });
}

/** Página vista (SPA: chamado a cada mudança de rota). */
export function gtmPageView(path?: string): void {
  if (typeof window === "undefined") return;
  const page = path ?? window.location.pathname + window.location.search;
  gtmPush({
    event: "page_view",
    page_path: page,
    page_title: document.title,
    area: page.startsWith("/admin") ? "admin" : "cliente",
  });
}

/* ---------------------------------------------------------------- */
/* Eventos de conversão (clientes)                                   */
/* ---------------------------------------------------------------- */

export type GtmAuthMethod = "email" | "google" | "facebook" | "apple";

/** Dispara no máximo uma vez por chave (por aba). */
function onceInSession(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function gtmLogin(method: GtmAuthMethod | string = "email", dedupeKey?: string) {
  if (dedupeKey && !onceInSession(`gtm_login_${dedupeKey}`)) return;
  gtmPush({ event: "login", method, area: "cliente" });
}

export function gtmSignUp(method: GtmAuthMethod | string = "email", dedupeKey?: string) {
  if (dedupeKey && !onceInSession(`gtm_signup_${dedupeKey}`)) return;
  gtmPush({ event: "sign_up", method, area: "cliente" });
}

/** Guarda o provedor social escolhido antes do redirect do OAuth. */
export function gtmRememberAuthMethod(method: GtmAuthMethod) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("gtm_auth_method", method);
  } catch {
    /* noop */
  }
}

function readRememberedMethod(): GtmAuthMethod {
  if (typeof window === "undefined") return "email";
  try {
    return (sessionStorage.getItem("gtm_auth_method") as GtmAuthMethod) || "email";
  } catch {
    return "email";
  }
}

/**
 * Dispara login/sign_up somente após a autenticação estar concluída.
 * Novos usuários (criados há menos de 2 minutos) contam como sign_up.
 */
export function gtmTrackAuthenticatedUser(user: {
  id?: string;
  created_at?: string;
  app_metadata?: { provider?: string } | null;
} | null | undefined) {
  if (!user?.id) return;
  const provider = (user.app_metadata?.provider as GtmAuthMethod) || readRememberedMethod();
  const method: GtmAuthMethod = provider === "email" ? "email" : provider;
  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
  const isNew = createdAt > 0 && Date.now() - createdAt < 2 * 60 * 1000;
  if (isNew) gtmSignUp(method, `${user.id}`);
  gtmLogin(method, `${user.id}:${Math.floor(Date.now() / 60000)}`);
}

export type GtmProductType = "course" | "ebook" | "consultation" | string;

export function gtmBeginCheckout(params: {
  productId: string;
  productType: GtmProductType;
  productName?: string;
  value?: number;
  transactionId?: string;
}) {
  gtmPush({
    event: "begin_checkout",
    area: "cliente",
    currency: "BRL",
    transaction_id: params.transactionId,
    item_id: params.productId,
    item_category: params.productType,
    item_name: params.productName,
    value: typeof params.value === "number" ? Number(params.value.toFixed(2)) : undefined,
  });
}

/**
 * Pagamento aprovado + evento específico do tipo de produto.
 * `transactionId` é obrigatório e deve ser o ID real do pedido no Asaas.
 */
export function gtmPurchase(params: {
  productId: string;
  productType: GtmProductType;
  productName?: string;
  value: number;
  transactionId: string;
}) {
  if (!params.transactionId) {
    console.warn("[gtm] purchase ignorado: transaction_id do pedido ausente");
    return;
  }
  if (!onceInSession(`gtm_purchase_${params.transactionId}`)) return;

  const base = {
    area: "cliente",
    currency: "BRL",
    transaction_id: params.transactionId,
    item_id: params.productId,
    item_category: params.productType,
    item_name: params.productName,
    value: Number((params.value ?? 0).toFixed(2)),
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_category: params.productType,
        price: Number((params.value ?? 0).toFixed(2)),
        quantity: 1,
      },
    ],
  };
  gtmPush({ event: "payment_approved", ...base });
  gtmPush({ event: "purchase", ...base });

  const specific: Record<string, string> = {
    course: "course_purchased",
    ebook: "ebook_purchased",
    consultation: "consultation_purchased",
  };
  const named = specific[params.productType];
  if (named) gtmPush({ event: named, ...base });
}

export function gtmConsultationScheduled(params: {
  consultationId?: string;
  productName?: string;
  scheduledAt?: string;
  sessions?: number;
  transactionId?: string;
}) {
  const key = params.transactionId ?? params.consultationId;
  if (key && !onceInSession(`gtm_consult_sched_${key}`)) return;
  gtmPush({
    event: "consultation_scheduled",
    area: "cliente",
    transaction_id: params.transactionId,
    item_id: params.consultationId,
    item_name: params.productName,
    scheduled_at: params.scheduledAt,
    sessions: params.sessions,
  });
}

/** Emissão do certificado (uma vez por certificado). */
export function gtmCertificateIssued(params: {
  certificateId?: string;
  courseId?: string;
  courseName?: string;
}) {
  const key = params.certificateId ?? params.courseId;
  if (key && !onceInSession(`gtm_cert_issued_${key}`)) return;
  gtmPush({
    event: "certificate_issued",
    area: "cliente",
    certificate_id: params.certificateId,
    item_id: params.courseId,
    item_name: params.courseName,
  });
}

/** Download do PDF do certificado (pode acontecer várias vezes). */
export function gtmCertificateDownloaded(params: {
  certificateId?: string;
  courseId?: string;
  courseName?: string;
}) {
  gtmPush({
    event: "certificate_downloaded",
    area: "cliente",
    certificate_id: params.certificateId,
    item_id: params.courseId,
    item_name: params.courseName,
  });
}

export function gtmSocialClick(network: "whatsapp" | "instagram", location?: string) {
  gtmPush({
    event: network === "whatsapp" ? "whatsapp_click" : "instagram_click",
    area: "cliente",
    social_network: network,
    click_location: location,
  });
}

/** Instalação do PWA — garantido 1 evento por instalação. */
export function gtmPwaInstalled(outcome: "accepted" | "installed" = "installed") {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("gtm_pwa_installed")) return;
    localStorage.setItem("gtm_pwa_installed", String(Date.now()));
  } catch {
    /* noop */
  }
  gtmPush({ event: "pwa_install", area: "cliente", outcome });
}


/* ---------------------------------------------------------------- */
/* Eventos administrativos (namespace separado: admin_*)             */
/* ---------------------------------------------------------------- */

export function gtmAdminEvent(action: string, params: Record<string, unknown> = {}) {
  gtmPush({ event: `admin_${action}`, area: "admin", ...params });
}
