import {
  getPushConfig,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/admin-notifications.functions";
import { registerAppServiceWorker } from "@/lib/pwa-sw";

function toApplicationServerKey(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }

  if (bytes.byteLength !== 65 || bytes[0] !== 0x04) {
    throw new Error(
      `Chave pública VAPID inválida (${bytes.byteLength} bytes).`,
    );
  }

  // ArrayBuffer exato. Evita bug de offset/BufferSource em Safari.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function applicationServerKeyMatches(
  existing: ArrayBuffer | null,
  expected: ArrayBuffer,
): boolean {
  if (!existing) return false;

  const a = new Uint8Array(existing);
  const b = new Uint8Array(expected);

  if (a.byteLength !== b.byteLength) return false;

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
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

  return `${platform}${isStandalone() ? " (PWA)" : ""}`;
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
  let registration =
    (await navigator.serviceWorker.getRegistration("/")) || null;

  if (!registration) {
    registration = await registerAppServiceWorker();
  }

  if (!registration) {
    throw new Error("Service Worker indisponível neste dispositivo.");
  }

  // Busca o /sw.js atual, sem depender do cache HTTP.
  await registration.update().catch(() => undefined);

  const ready = await navigator.serviceWorker.ready;

  return ready;
}

export async function getCurrentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;

  // No iPhone o endpoint que interessa é o do PWA aberto pela Tela de Início.
  if (
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent)
  ) {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!standalone) return null;
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration("/");

    if (!registration) return null;

    const subscription =
      await registration.pushManager.getSubscription();

    return subscription?.endpoint || null;
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}> {
  if (!pushSupported()) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
    };
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration("/");

    const sub = registration
      ? await registration.pushManager.getSubscription()
      : null;

    return {
      supported: true,
      permission: Notification.permission,
      subscribed: Boolean(sub),
    };
  } catch {
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: false,
    };
  }
}

/**
 * Ativa ou REPARA o push.
 *
 * No iOS fazemos uma inscrição nova quando o usuário toca o botão,
 * porque uma PWA reinstalada/migrada pode manter endpoint ligado a
 * outra chave/origem e continuar aparecendo como "subscribed".
 */
export async function enablePush(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!pushSupported()) {
    return {
      ok: false,
      message:
        "Este navegador não suporta Web Push neste contexto.",
    };
  }

  if (isIOS() && !isStandalone()) {
    return {
      ok: false,
      message:
        "No iPhone, abra o Ronnei pelo ícone instalado na Tela de Início. O Safari em aba comum não é o contexto correto para o push do PWA.",
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      message:
        "As notificações estão bloqueadas nas configurações deste dispositivo.",
    };
  }

  const { publicKey } = await getPushConfig();

  if (!publicKey) {
    return {
      ok: false,
      message: "Chave pública VAPID ausente no servidor.",
    };
  }

  const applicationServerKey = toApplicationServerKey(publicKey);
  const registration = await getRegistration();

  let existing =
    await registration.pushManager.getSubscription();

  if (existing) {
    const currentKey =
      existing.options?.applicationServerKey ?? null;

    // iOS: o toque em "Reparar push" recria deliberadamente.
    // Outros navegadores só recriam se a VAPID divergir.
    const mustRepair =
      isIOS() ||
      !applicationServerKeyMatches(
        currentKey,
        applicationServerKey,
      );

    if (mustRepair) {
      const oldEndpoint = existing.endpoint;

      await existing.unsubscribe().catch(() => false);

      await removePushSubscription({
        data: { endpoint: oldEndpoint },
      }).catch(() => undefined);

      existing = null;
    }
  }

  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: Record<string, string>;
  };

  if (
    !json.endpoint ||
    !json.keys?.["p256dh"] ||
    !json.keys?.["auth"]
  ) {
    return {
      ok: false,
      message:
        "O iPhone não retornou as chaves da inscrição push.",
    };
  }

  await savePushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys["p256dh"],
      auth: json.keys["auth"],
      deviceName: deviceName(),
    },
  });

  return {
    ok: true,
    message:
      "Push nativo registrado neste dispositivo. Agora use Testar.",
  };
}

export async function disablePush(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const registration =
      await navigator.serviceWorker.getRegistration("/");

    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;

    if (subscription) {
      const endpoint = subscription.endpoint;

      await subscription.unsubscribe();

      await removePushSubscription({
        data: { endpoint },
      });
    }

    return {
      ok: true,
      message: "Notificações desativadas neste dispositivo.",
    };
  } catch (err: any) {
    return {
      ok: false,
      message:
        err?.message || "Falha ao desativar notificações.",
    };
  }
}
