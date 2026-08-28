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

export function gtmLogin(method: "email" | "google" | string = "email") {
  gtmPush({ event: "login", method, area: "cliente" });
}

export function gtmSignUp(method: "email" | "google" | string = "email") {
  gtmPush({ event: "sign_up", method, area: "cliente" });
}

export type GtmProductType = "course" | "ebook" | "consultation" | string;

export function gtmBeginCheckout(params: {
  productId: string;
  productType: GtmProductType;
  productName?: string;
  value?: number;
}) {
  gtmPush({
    event: "begin_checkout",
    area: "cliente",
    currency: "BRL",
    item_id: params.productId,
    item_category: params.productType,
    item_name: params.productName,
    value: params.value,
  });
}

/** Pagamento aprovado + evento específico do tipo de produto. */
export function gtmPurchase(params: {
  productId: string;
  productType: GtmProductType;
  productName?: string;
  value?: number;
  transactionId?: string;
}) {
  const base = {
    area: "cliente",
    currency: "BRL",
    transaction_id: params.transactionId ?? params.productId,
    item_id: params.productId,
    item_category: params.productType,
    item_name: params.productName,
    value: params.value,
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
}) {
  gtmPush({
    event: "consultation_scheduled",
    area: "cliente",
    item_id: params.consultationId,
    item_name: params.productName,
    scheduled_at: params.scheduledAt,
    sessions: params.sessions,
  });
}

export function gtmCertificateIssued(params: { courseId?: string; courseName?: string }) {
  gtmPush({
    event: "certificate_issued",
    area: "cliente",
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

export function gtmPwaInstalled(outcome: "accepted" | "dismissed" | "installed" = "installed") {
  gtmPush({ event: "pwa_install", area: "cliente", outcome });
}

/* ---------------------------------------------------------------- */
/* Eventos administrativos (namespace separado: admin_*)             */
/* ---------------------------------------------------------------- */

export function gtmAdminEvent(action: string, params: Record<string, unknown> = {}) {
  gtmPush({ event: `admin_${action}`, area: "admin", ...params });
}
