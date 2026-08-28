import { create } from 'zustand';
import { gtmBeginCheckout } from '@/lib/gtm';

interface PaymentState {
  isOpen: boolean;
  paymentUrl: string | null;
  title: string;
  productId: string | null;
  productType: 'course' | 'ebook' | null;
  status: 'idle' | 'processing' | 'confirmed' | 'failed';
  onClose: (() => void) | null;
  openPayment: (url: string, title: string, productId: string, productType: 'course' | 'ebook', onClose?: () => void) => void;
  closePayment: () => void;
  setStatus: (status: 'idle' | 'processing' | 'confirmed' | 'failed') => void;
}

export const usePaymentModal = create<PaymentState>((set) => ({
  isOpen: false,
  paymentUrl: null,
  title: '',
  productId: null,
  productType: null,
  status: 'idle',
  onClose: null,
  openPayment: (url, title, productId, productType, onClose) => {
    gtmBeginCheckout({ productId, productType, productName: title });
    return set({ 
    isOpen: true, 
    paymentUrl: url, 
    title, 
    productId,
    productType,
    status: 'idle',
    onClose: onClose || null 
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
      status: 'idle',
      onClose: null 
    };
  }),
  setStatus: (status) => set({ status }),
}));
