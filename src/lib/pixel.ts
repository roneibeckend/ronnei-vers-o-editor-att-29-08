/**
 * Facebook Pixel + analytics helper.
 *
 * Como ativar:
 * 1. Crie um Pixel em https://business.facebook.com/events_manager
 * 2. Copie o ID (15-16 dígitos) e cole em FB_PIXEL_ID abaixo
 *    OU defina VITE_FB_PIXEL_ID no ambiente de build.
 *
 * Eventos disparados:
 *  - PageView              (carregamento inicial + mudança de rota SPA)
 *  - InitiateCheckout      (clique em qualquer CTA principal)
 *  - Lead                  (envio do formulário do popup)
 *  - ViewContent           (chamada manual em seções-chave, opcional)
 *
 * O helper é 100% seguro em SSR (checa window) e no-op quando o ID não está setado,
 * então nunca quebra o build nem polui o console em dev.
 */

// Cole aqui o ID do Pixel (ex.: "1234567890123456") ou deixe vazio para desligar.
const FB_PIXEL_ID: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_FB_PIXEL_ID) || "";

// Google Analytics 4 (opcional). Cole o Measurement ID no formato "G-XXXXXXX".
const GA4_ID: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GA4_ID) || "";

declare global {
  interface Window {
    fbq?: ((...args: any[]) => void) & { callMethod?: (...args: any[]) => void; queue?: any[]; loaded?: boolean; version?: string; push?: (...args: any[]) => void };
    _fbq?: any;
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

let initialized = false;

/** Carrega o script do Facebook Pixel exatamente uma vez. */
export function initPixel(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  // ---- Meta / Facebook Pixel ----
  if (FB_PIXEL_ID) {
    // Snippet oficial do Facebook (versão minimizada e tipada).
    (function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod
          ? n.callMethod.apply(n, arguments as any)
          : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const t = b.createElement(e) as HTMLScriptElement;
      t.async = true;
      t.src = v;
      const s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    window.fbq?.("init", FB_PIXEL_ID);
    window.fbq?.("track", "PageView");
  }

  // GA4 é servido exclusivamente pelo Google Tag Manager (GTM-M376JTZP).
  // Nunca inicializar gtag.js aqui: gera dupla instrumentação e page_view duplicado.
}

/** Dispara um evento padrão do Pixel (Meta). GA4 recebe tudo via GTM/dataLayer. */
export function trackEvent(
  event: "PageView" | "InitiateCheckout" | "Lead" | "ViewContent" | "Purchase" | "AddToCart",
  params?: Record<string, any>
): void {
  if (typeof window === "undefined") return;

  try {
    window.fbq?.("track", event, params);
  } catch (err) {
    console.warn("[pixel] fbq error", err);
  }

}

/** Helper específico para o CTA principal. */
export function trackInitiateCheckout(source: string, value = 47.9): void {
  trackEvent("InitiateCheckout", {
    content_name: "eBook Espetinho na Veia — Do Zero aos 10k",
    content_category: "ebook",
    content_ids: ["espetinho-na-veia-10k"],
    value,
    currency: "BRL",
    source,
  });
}
