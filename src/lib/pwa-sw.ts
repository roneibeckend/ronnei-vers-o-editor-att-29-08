/**
 * Registro único e seguro do Service Worker de push (/sw.js).
 *
 * O worker existe apenas para notificações push + fallback offline de
 * navegação. Ele NUNCA deve ser registrado em dev, no preview do Lovable ou
 * dentro de iframe — nesses contextos o navegador recusa a atualização e
 * dispara "Failed to update a ServiceWorker for scope".
 */

const SW_URL = "/sw.js";

export function swAllowedHere(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    if (new URL(window.location.href).searchParams.get("sw") === "off") return false;
  } catch {
    /* ignora */
  }

  if (window.top !== window.self) return false;
  if (!window.isSecureContext) return false;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return false;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return false;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return false;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return false;
  if (host.endsWith("-dev.lovable.app")) return false;

  return true;
}

/** Remove registros do /sw.js em contextos onde ele não deve existir. */
export async function unregisterAppServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations
        .filter((r) => (r.active || r.installing || r.waiting)?.scriptURL.includes(SW_URL))
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignora */
  }
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Idempotente: uma única chamada de register por sessão de página. */
export function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  if (!swAllowedHere()) {
    void unregisterAppServiceWorker();
    return Promise.resolve(null);
  }

  const w = window as typeof window & {
    __RNV_SW_REGISTRATION__?: Promise<ServiceWorkerRegistration | null>;
  };

  if (w.__RNV_SW_REGISTRATION__) return w.__RNV_SW_REGISTRATION__;

  registration = navigator.serviceWorker
    .register(SW_URL, { scope: "/", updateViaCache: "none" })
    .catch((error) => {
      console.warn("[RNV PWA] Service Worker indisponível:", error);
      return null;
    });

  w.__RNV_SW_REGISTRATION__ = registration;
  return registration;
}
