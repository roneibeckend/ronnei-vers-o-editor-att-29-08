/**
 * Telemetria do fluxo de upsell (landing e plataforma).
 *
 * Objetivo: identificar rapidamente quando a oferta não carrega e por qual motivo.
 * - Console: cada passo com prefixo `[upsell]`.
 * - Buffer em memória: `window.__upsellEvents` (últimos 50 eventos) para inspeção rápida.
 * - Persistência: eventos relevantes vão para `system_logs` (visíveis em /admin/logs).
 */

export type UpsellStep =
  | "gate_check"
  | "gate_enabled"
  | "gate_disabled"
  | "gate_error"
  | "modal_open"
  | "fetch_start"
  | "fetch_settings"
  | "fetch_blocked_min_amount"
  | "fetch_success"
  | "fetch_empty"
  | "fetch_error"
  | "extras_loaded"
  | "extras_error"
  | "proceed_with_offers"
  | "proceed_without_offers"
  | "modal_close";

export interface UpsellEvent {
  ts: string;
  step: UpsellStep;
  surface: string;
  level: "info" | "warn" | "error";
  reason?: string | null;
  details?: Record<string, unknown>;
  durationMs?: number;
}

const BUFFER_LIMIT = 50;

/** Passos que valem persistir no banco (falhas e conversões). */
const PERSISTED: UpsellStep[] = [
  "gate_disabled",
  "gate_error",
  "fetch_blocked_min_amount",
  "fetch_empty",
  "fetch_error",
  "extras_error",
  "proceed_with_offers",
  "proceed_without_offers",
];

function buffer(): UpsellEvent[] {
  if (typeof window === "undefined") return [];
  const w = window as unknown as { __upsellEvents?: UpsellEvent[] };
  if (!w.__upsellEvents) w.__upsellEvents = [];
  return w.__upsellEvents;
}

export function getUpsellEvents(): UpsellEvent[] {
  return [...buffer()];
}

export function trackUpsell(
  step: UpsellStep,
  opts: {
    surface: string;
    level?: "info" | "warn" | "error";
    reason?: string | null;
    details?: Record<string, unknown>;
    durationMs?: number;
  },
): void {
  const event: UpsellEvent = {
    ts: new Date().toISOString(),
    step,
    surface: opts.surface,
    level: opts.level ?? (step.includes("error") ? "error" : step.includes("empty") || step.includes("disabled") || step.includes("blocked") ? "warn" : "info"),
    reason: opts.reason ?? null,
    ...(opts.details ? { details: opts.details } : {}),
    ...(typeof opts.durationMs === "number" ? { durationMs: Math.round(opts.durationMs) } : {}),
  };

  const buf = buffer();
  buf.push(event);
  if (buf.length > BUFFER_LIMIT) buf.splice(0, buf.length - BUFFER_LIMIT);

  const line = `[upsell] ${event.step} @${event.surface}${event.reason ? ` — ${event.reason}` : ""}`;
  if (event.level === "error") console.error(line, event);
  else if (event.level === "warn") console.warn(line, event);
  else console.info(line, event);

  if (!PERSISTED.includes(step)) return;
  if (typeof window === "undefined") return;

  void (async () => {
    try {
      const { logUpsellEvent } = await import("@/lib/upsell-telemetry.functions");
      await logUpsellEvent({
        data: {
          step: event.step,
          level: event.level,
          surface: event.surface,
          reason: event.reason ?? null,
          details: {
            ...(event.details ?? {}),
            ...(event.durationMs != null ? { durationMs: event.durationMs } : {}),
            path: window.location?.pathname,
          },
        },
      });
    } catch {
      // Telemetria nunca deve quebrar o fluxo de compra (ex.: usuário deslogado).
    }
  })();
}
