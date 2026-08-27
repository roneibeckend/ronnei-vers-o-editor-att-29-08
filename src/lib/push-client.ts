import { getPushConfig, removePushSubscription, savePushSubscription } from "@/lib/admin-notifications.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : "Navegador";
  const standalone = window.matchMedia("(display-mode: standalone)").matches ? " (PWA)" : "";
  return `${platform}${standalone}`;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}> {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = registration ? await registration.pushManager.getSubscription() : null;
    return { supported: true, permission: Notification.permission, subscribed: Boolean(sub) };
  } catch {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
}

/** Solicita permissão, registra o dispositivo e salva a inscrição no servidor. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return {
      ok: false,
      message:
        "Este navegador não suporta notificações push. No iPhone, instale o app na tela de início e abra por lá.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Permissão de notificações negada nas configurações do navegador." };
  }

  const { publicKey } = await getPushConfig();
  if (!publicKey) return { ok: false, message: "Chaves de push não configuradas no servidor." };

  const registration = await getRegistration();
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  if (!json.endpoint || !json.keys?.["p256dh"] || !json.keys?.["auth"]) {
    return { ok: false, message: "Não foi possível obter as chaves do dispositivo." };
  }

  await savePushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys["p256dh"],
      auth: json.keys["auth"],
      deviceName: deviceName(),
    },
  });

  return { ok: true, message: "Notificações ativadas neste dispositivo." };
}

export async function disablePush(): Promise<{ ok: boolean; message: string }> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await removePushSubscription({ data: { endpoint } });
    }
    return { ok: true, message: "Notificações desativadas neste dispositivo." };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Falha ao desativar notificações." };
  }
}
