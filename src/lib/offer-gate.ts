import { getIntegrationConfig } from "@/lib/integration-settings";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { trackUpsell } from "@/lib/upsell-telemetry";

/**
 * Consulta (no momento do clique) se o popup de ofertas/upsell está ativo.
 *
 * O estado global é sincronizado de forma assíncrona, então clicar em
 * "comprar" antes da sincronização terminar — ou com um cache antigo em
 * localStorage — fazia o usuário ir direto para o pagamento sem ver o upsell.
 */
export async function isOfferPopupEnabled(surface = "unknown"): Promise<boolean> {
  const startedAt = Date.now();
  trackUpsell("gate_check", { surface });
  try {
    const config = await getIntegrationConfig("offer_settings");
    const enabled = config?.status ?? false;
    usePostPurchaseOfferStore.getState().togglePostPurchaseOfferPopup(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("post_purchase_offer_enabled", String(enabled));
    }
    trackUpsell(enabled ? "gate_enabled" : "gate_disabled", {
      surface,
      durationMs: Date.now() - startedAt,
      reason: enabled ? null : config ? "offer_settings.status = false" : "configuração offer_settings não encontrada",
    });
    return enabled;
  } catch (error) {
    const fallback = usePostPurchaseOfferStore.getState().isEnabled;
    trackUpsell("gate_error", {
      surface,
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : "falha ao ler offer_settings",
      details: { fallbackEnabled: fallback },
    });
    return fallback;
  }
}
