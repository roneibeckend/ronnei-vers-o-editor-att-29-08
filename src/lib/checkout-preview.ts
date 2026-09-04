/**
 * Prévia de valores do checkout (apenas exibição).
 * O valor autoritativo é SEMPRE recalculado no servidor
 * (createNativeCheckout + redeem_coupon). Nada daqui é enviado como preço.
 */

export interface CheckoutPreviewInput {
  /** Soma do produto principal + itens adicionais (já com desconto de order bump). */
  subtotal: number;
  /** Desconto do cupom já validado pelo servidor, referente ao produto principal. */
  couponDiscount?: number | null;
  /** Código do cupom aplicado, apenas para exibição. */
  couponCode?: string | null;
}

export interface CheckoutPreview {
  subtotal: number;
  discount: number;
  total: number;
  couponCode: string | null;
  hasDiscount: boolean;
  /** Total zerado por cupom: libera acesso sem cobrança. */
  isFree: boolean;
}

/** Arredonda para centavos evitando erro de ponto flutuante. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeCheckoutPreview({
  subtotal,
  couponDiscount,
  couponCode,
}: CheckoutPreviewInput): CheckoutPreview {
  const safeSubtotal = roundCents(Math.max(Number(subtotal) || 0, 0));
  const rawDiscount = roundCents(Math.max(Number(couponDiscount) || 0, 0));
  // Nunca deixa o total negativo: o desconto é limitado ao subtotal.
  const discount = Math.min(rawDiscount, safeSubtotal);
  const total = roundCents(safeSubtotal - discount);

  return {
    subtotal: safeSubtotal,
    discount,
    total,
    couponCode: discount > 0 ? (couponCode ?? null) : null,
    hasDiscount: discount > 0,
    isFree: discount > 0 && total <= 0,
  };
}
