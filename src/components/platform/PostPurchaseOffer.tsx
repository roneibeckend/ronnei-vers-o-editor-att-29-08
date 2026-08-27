import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Sparkles, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnrollments } from '@/hooks/use-enrollments';
import { toast } from 'sonner';
import { IMG } from '@/lib/platform-data';
import { optimizedImage } from '@/lib/image-url';
import { CouponInput, type AppliedCoupon } from '@/components/platform/CouponInput';
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";


interface OfferItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  type: 'course' | 'ebook';
  cover_url?: string | null;
}

interface PostPurchaseOfferProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedWithOffers: (selectedOffers: OfferItem[]) => void;
  onProceedWithoutOffers: () => void;
  originalProductId: string;
  /** Tipo do produto principal (para validação do cupom). */
  productType?: 'course' | 'ebook';
  /** Valor do produto principal (para calcular o desconto exibido). */
  amount?: number;
}

export function PostPurchaseOffer({
  isOpen,
  onClose,
  onProceedWithOffers,
  onProceedWithoutOffers,
  originalProductId,
  productType,
  amount
}: PostPurchaseOfferProps) {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [discountPercentage, setDiscountPercentage] = useState(15);
  const [copy, setCopy] = useState({
    headline: 'Turbine seu aprendizado!',
    subheadline: '',
    ctaLabel: 'Adicionar Ofertas e Prosseguir',
    allowCoupon: true,
  });
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const { isEnrolledInCourse, isEnrolledInEbook } = useEnrollments();

  const handleCouponApplied = (coupon: AppliedCoupon | null) => {
    setAppliedCoupon(coupon);
    if (typeof window === 'undefined') return;
    if (coupon) {
      localStorage.setItem('pending_coupon_code', coupon.code);
    } else {
      localStorage.removeItem('pending_coupon_code');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOffers();
    }
  }, [isOpen, originalProductId]);

  useEffect(() => {
    if (isOpen && !isLoading && offers.length === 0) {
      const timer = setTimeout(() => {
        onProceedWithoutOffers();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading, offers.length, onProceedWithoutOffers]);

  const fetchOffers = async () => {
    try {
      setIsLoading(true);
      
      // Fetch dynamic settings
      const config = await getIntegrationConfig('offer_settings');
      const s = (config?.settings && typeof config.settings === 'object'
        ? (config.settings as Record<string, any>)
        : {}) as Record<string, any>;

      if (s.discountPercentage) setDiscountPercentage(s.discountPercentage);

      const offerType: 'upsell' | 'cross_sell' | 'downsell' = s.offerType || 'upsell';
      const maxItems = Math.min(Math.max(Number(s.maxItems) || 3, 1), 5);
      const trigger: 'buy_click' | 'min_amount' = s.trigger || 'buy_click';
      const minOrderAmount = Number(s.minOrderAmount) || 0;
      const autoSelect = s.autoSelect === true;

      setCopy({
        headline: s.headline || 'Turbine seu aprendizado!',
        subheadline: s.subheadline || '',
        ctaLabel: s.ctaLabel || 'Adicionar Ofertas e Prosseguir',
        allowCoupon: s.allowCoupon !== false,
      });

      // Gatilho: só exibe quando o pedido atinge o valor mínimo configurado.
      if (trigger === 'min_amount' && (amount || 0) < minOrderAmount) {
        setOffers([]);
        return;
      }

      const [coursesRes, ebooksRes] = await Promise.all([
        supabase.from('courses')
          .select('id, title, description, price, cover_url, status')
          .eq('is_locked', false)
          .eq('status', 'active')
          .neq('id', originalProductId),
        supabase.from('ebooks')
          .select('id, title, description, price, cover_url, status')
          .eq('is_locked', false)
          .eq('status', 'active')
          .neq('id', originalProductId)
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (ebooksRes.error) throw ebooksRes.error;

      // Filter and validate availability
      const allPossibleOffers: OfferItem[] = [
        ...(coursesRes.data || []).map(c => ({ ...c, type: 'course' as const })),
        ...(ebooksRes.data || []).map(e => ({ ...e, type: 'ebook' as const })),
      ].filter(item => {
        // 1. Ensure product has a valid price
        if (!item.price || item.price <= 0) return false;

        // 2. Filter out items the user already owns
        if (item.type === 'course') {
          return !isEnrolledInCourse(item.id);
        } else {
          return !isEnrolledInEbook(item.id);
        }
      });

      // Ordenação conforme o tipo de oferta configurado
      const ranked = [...allPossibleOffers];
      if (offerType === 'upsell') {
        ranked.sort((a, b) => (b.price || 0) - (a.price || 0));
      } else if (offerType === 'downsell') {
        ranked.sort((a, b) => (a.price || 0) - (b.price || 0));
      } else {
        ranked.sort(() => 0.5 - Math.random());
      }

      const selectedOffers = ranked.slice(0, maxItems);

      setOffers(selectedOffers);
      setSelectedIds(autoSelect ? selectedOffers.map(o => o.id) : []);
    } catch (error) {
      console.error('Erro ao buscar ofertas:', error);
      toast.error('Erro ao carregar ofertas complementares.');
    } finally {
      setIsLoading(false);
    }
  };


  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAddAndProceed = () => {
    const selectedItems = offers.filter(o => selectedIds.includes(o.id));
    onProceedWithOffers(selectedItems);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onProceedWithoutOffers()}>
      <DialogContent className="max-w-2xl glass border-white/10 p-0 overflow-hidden sm:rounded-3xl w-[92vw] sm:w-full fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[90vh] flex flex-col outline-none z-[9999]">
        <div className="relative p-4 sm:p-8 flex flex-col h-full overflow-hidden">
          <button 
            onClick={onProceedWithoutOffers}
            className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors z-10"
          >
            <X className="h-6 w-6" />
          </button>

          <DialogHeader className="mb-6 shrink-0">
            <div className="flex items-center gap-2 text-gold mb-2">
              <Sparkles className="h-5 w-5 fill-current" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Oferta Exclusiva</span>
            </div>
            <DialogTitle className="font-display text-xl sm:text-3xl font-black text-white leading-tight break-words text-balance">
              {copy.headline}
            </DialogTitle>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base leading-relaxed break-words text-balance">
              {copy.subheadline ? copy.subheadline : (
                <>Adicione estes itens complementares agora e ganhe <span className="text-gold font-bold">{discountPercentage}% de desconto</span> em cada um.</>
              )}
            </p>


          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground mb-4">Otimizando sua experiência de compra...</p>
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gold" />
              </div>
              {/* Auto-proceed logic added in useEffect */}
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
              {offers.map(offer => {
                const discountPrice = (offer.price || 0) * (1 - (discountPercentage / 100));
                const isSelected = selectedIds.includes(offer.id);
                
                return (
                  <div 
                    key={offer.id}
                    onClick={() => toggleSelection(offer.id)}
                    className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-gold/10 border-gold shadow-lg shadow-gold/5' 
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="h-14 w-20 sm:h-20 sm:w-32 rounded-lg overflow-hidden shrink-0 bg-black/60">
                      <img 
                        src={optimizedImage(offer.cover_url) || IMG.hero} 
                        alt={offer.title} 
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-tighter text-gold bg-gold/10 px-1.5 py-0.5 rounded">
                          {offer.type === 'course' ? 'Curso' : 'E-book'}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm sm:text-base leading-tight break-words text-white line-clamp-2">
                        {offer.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                        <span className="text-[10px] sm:text-xs line-through text-muted-foreground">
                          R$ {offer.price?.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-gold">
                          R$ {discountPrice.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                    <div className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-gold border-gold text-black' : 'border-white/20'
                    }`}>
                      {isSelected && <ShoppingCart className="h-3 w-3 fill-current" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && (
            <div className="mt-5 shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
              <CouponInput
                productId={originalProductId}
                productType={productType}
                amount={amount}
                context="main"
                authenticated
                applied={appliedCoupon}
                onApplied={handleCouponApplied}
              />
            </div>
          )}

          <div className="mt-6 sm:mt-8 flex flex-col sm:grid sm:grid-cols-2 gap-3 shrink-0">
            <Button 
              variant="outline" 
              onClick={onProceedWithoutOffers}
              className="w-full rounded-xl border-white/10 hover:bg-white/5 h-12 order-2 sm:order-1 text-sm sm:text-base whitespace-normal text-center py-2"
            >
              Prosseguir sem Ofertas
            </Button>
            <Button 
              disabled={selectedIds.length === 0}
              onClick={handleAddAndProceed}
              className="w-full btn-fire rounded-xl font-bold h-12 shadow-lg shadow-fire/20 order-1 sm:order-2 text-sm sm:text-base whitespace-normal text-center py-2"
            >
              Adicionar Ofertas e Prosseguir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
