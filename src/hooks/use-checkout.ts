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
  /** Desconto do cupom já validado no servidor (apenas prévia; o servidor recalcula). */
  couponDiscount?: number | null;
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
    let resolvedProduct = product;

    // Se o cupom foi validado em outro componente (ex.: modal de oferta),
    // recupera somente a prévia correspondente ao MESMO produto.
    // Isso serve apenas para exibição: createNativeCheckout valida novamente.
    if (
      typeof window !== "undefined" &&
      product.couponCode &&
      product.couponDiscount == null
    ) {
      try {
        const raw = localStorage.getItem("pending_coupon_preview");

        if (raw) {
          const preview = JSON.parse(raw) as {
            code?: string;
            productId?: string | null;
            productType?: string | null;
            discountAmount?: number;
          };

          const sameCode =
            String(preview.code ?? "").trim().toUpperCase() ===
            String(product.couponCode).trim().toUpperCase();

          const sameProduct =
            !preview.productId || preview.productId === product.productId;

          const sameType =
            !preview.productType || preview.productType === product.productType;

          const discountAmount = Number(preview.discountAmount);

          if (
            sameCode &&
            sameProduct &&
            sameType &&
            Number.isFinite(discountAmount) &&
            discountAmount > 0
          ) {
            resolvedProduct = {
              ...product,
              couponDiscount: discountAmount,
            };
          }
        }
      } catch {
        // Prévia inválida não bloqueia a compra.
        // O servidor ainda validará o código antes da cobrança.
      }
    }

    gtmBeginCheckout({
      productId: resolvedProduct.productId,
      productType: resolvedProduct.productType,
      productName: resolvedProduct.title,
      value: resolvedProduct.value ?? undefined,
    });

    set({ isOpen: true, product: resolvedProduct });
  },
  closeCheckout: () => set({ isOpen: false, product: null }),
}));
