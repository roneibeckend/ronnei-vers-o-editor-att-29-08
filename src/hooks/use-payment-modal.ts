import { create } from 'zustand';
import { gtmBeginCheckout } from '@/lib/gtm';

interface PaymentState {
  isOpen: boolean;
  paymentUrl: string | null;
  title: string;
  productId: string | null;
  productType: 'course' | 'ebook' | 'fidelize' | 'consultation' | null;
  /** Valor real cobrado no Asaas (BRL). */
  value: number | null;
  /** ID real do pedido/link de pagamento no Asaas. */
  transactionId: string | null;
  status: 'idle' | 'processing' | 'confirmed' | 'failed';
  onClose: (() => void) | null;
  openPayment: (
    url: string,
    title: string,
    productId: string,
    productType: 'course' | 'ebook' | 'fidelize' | 'consultation',
    order?: { value?: number | null; transactionId?: string | null; onClose?: () => void },
  ) => void;
  closePayment: () => void;
  setStatus: (status: 'idle' | 'processing' | 'confirmed' | 'failed') => void;
}

export const usePaymentModal = create<PaymentState>((set) => ({
  isOpen: false,
  paymentUrl: null,
  title: '',
  productId: null,
  productType: null,
  value: null,
  transactionId: null,
  status: 'idle',
  onClose: null,
  openPayment: (url, title, productId, productType, order) => {
    gtmBeginCheckout({
      productId,
      productType,
      productName: title,
      value: order?.value ?? undefined,
      transactionId: order?.transactionId ?? undefined,
    });
    return set({
      isOpen: true,
      paymentUrl: url,
      title,
      productId,
      productType,
      value: order?.value ?? null,
      transactionId: order?.transactionId ?? null,
      status: 'idle',
      onClose: order?.onClose || null,
    });
  },
  closePayment: () => set((state) => {
    if (state.onClose) state.onClose();
    return { 
      isOpen: false, 
      paymentUrl: null, 
      title: '', 
      productId: null,
      productType: null,
      value: null,
      transactionId: null,
      status: 'idle',
      onClose: null,
    };
  }),
  setStatus: (status) => set({ status }),
}));
