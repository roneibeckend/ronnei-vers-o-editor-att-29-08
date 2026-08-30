import { create } from 'zustand';
import { gtmBeginCheckout } from '@/lib/gtm';

export type CheckoutProductType = 'course' | 'ebook' | 'fidelize' | 'consultation';

export interface CheckoutProduct {
  productId: string;
  productType: CheckoutProductType;
  title: string;
  /** Capa/imagem exibida na coluna esquerda. */
  cover?: string | null;
  description?: string | null;
  /** Benefícios exibidos com check. */
  benefits?: string[];
  /** Valor apenas informativo — o valor cobrado é sempre recalculado no servidor. */
  value?: number | null;
  recurring?: boolean;
  affiliateRef?: string | null;
  /** Itens adicionais (order bump/upsell) cobrados na mesma transação. */
  extraItems?: { productId: string; productType: CheckoutProductType; discountPercent?: number }[];
  couponCode?: string | null;
  onSuccess?: (() => void) | null;
}

interface CheckoutState {
  isOpen: boolean;
  product: CheckoutProduct | null;
  openCheckout: (product: CheckoutProduct) => void;
  closeCheckout: () => void;
}

export const useCheckout = create<CheckoutState>((set) => ({
  isOpen: false,
  product: null,
  openCheckout: (product) => {
    gtmBeginCheckout({
      productId: product.productId,
      productType: product.productType,
      productName: product.title,
      value: product.value ?? undefined,
    });
    set({ isOpen: true, product });
  },
  closeCheckout: () => set({ isOpen: false, product: null }),
}));
