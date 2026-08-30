import { getIntegrationConfig } from "@/lib/integration-settings";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";

/**
 * Consulta (no momento do clique) se o popup de ofertas/upsell está ativo.
 *
 * O estado global é sincronizado de forma assíncrona, então clicar em
 * "comprar" antes da sincronização terminar — ou com um cache antigo em
 * localStorage — fazia o usuário ir direto para o pagamento sem ver o upsell.
 */
export async function isOfferPopupEnabled(): Promise<boolean> {
  try {
    const config = await getIntegrationConfig("offer_settings");
    const enabled = config?.status ?? false;
    usePostPurchaseOfferStore.getState().togglePostPurchaseOfferPopup(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("post_purchase_offer_enabled", String(enabled));
    }
    return enabled;
  } catch {
    return usePostPurchaseOfferStore.getState().isEnabled;
  }
}
