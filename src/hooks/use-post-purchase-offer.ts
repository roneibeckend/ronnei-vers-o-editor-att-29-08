import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";

interface PostPurchaseOfferState {
  isEnabled: boolean;
  togglePostPurchaseOfferPopup: (enabled: boolean) => void;
  syncWithDatabase: () => Promise<void>;
}

export const usePostPurchaseOfferStore = create<PostPurchaseOfferState>((set) => ({
  isEnabled: false,
  togglePostPurchaseOfferPopup: (enabled: boolean) => set({ isEnabled: enabled }),
  syncWithDatabase: async () => {
    try {
      const data = await getIntegrationConfig('offer_settings');

      if (data) {
        set({ isEnabled: data.status ?? false });
        // Cache the setting in localStorage for immediate retrieval on next load
        if (typeof window !== 'undefined') {
          localStorage.setItem('post_purchase_offer_enabled', String(data.status ?? false));
        }
      }
    } catch (err) {
      console.error('Failed to sync offer settings:', err);
      // Fallback to local cache if DB fails
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('post_purchase_offer_enabled');
        if (cached !== null) set({ isEnabled: cached === 'true' });
      }
    }
  }
}));

// Initialize from local cache for zero-latency startup
if (typeof window !== 'undefined') {
  const cached = localStorage.getItem('post_purchase_offer_enabled');
  if (cached !== null) {
    usePostPurchaseOfferStore.getState().togglePostPurchaseOfferPopup(cached === 'true');
  }

  (window as any).togglePostPurchaseOfferPopup = (enabled: boolean) => {
    usePostPurchaseOfferStore.getState().togglePostPurchaseOfferPopup(enabled);
  };
}
