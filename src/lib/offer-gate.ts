import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { trackUpsell } from "@/lib/upsell-telemetry";
import { getOfferSettings } from "@/lib/offer-settings.functions";

/**
 * Consulta (no momento do clique) se o popup de ofertas/upsell está ativo.
 *
 * A leitura é feita no servidor porque a tabela `integrations` é restrita a
 * administradores — do contrário, contas de aluno iriam sempre direto para o
 * pagamento, sem ver o upsell.
 */
export async function isOfferPopupEnabled(surface = "unknown"): Promise<boolean> {
  const startedAt = Date.now();
  trackUpsell("gate_check", { surface });
  try {
    const config = await getOfferSettings();
    const enabled = config?.status ?? false;
    usePostPurchaseOfferStore.getState().togglePostPurchaseOfferPopup(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("post_purchase_offer_enabled", String(enabled));
    }
    trackUpsell(enabled ? "gate_enabled" : "gate_disabled", {
      surface,
      durationMs: Date.now() - startedAt,
      reason: enabled ? null : "offer_settings.status = false",
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
