import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnrollments } from '@/hooks/use-enrollments';
import { toast } from 'sonner';
import { IMG } from '@/lib/platform-data';
import { optimizedImage } from '@/lib/image-url';
import { CouponInput, type AppliedCoupon } from '@/components/platform/CouponInput';
import { getOfferSettings } from "@/lib/offer-settings.functions";
import { trackUpsell } from "@/lib/upsell-telemetry";


interface OfferItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  type: 'course' | 'ebook' | 'consultation';
  cover_url?: string | null;
}

/** Produtos que não entram no carrinho (fluxo próprio), exibidos como oportunidades extras. */
interface ExtraOffer {
  id: string;
  title: string;
  subtitle: string | null;
  price: number | null;
  cover_url?: string | null;
  href: string;
  badge: string;
  cta: string;
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
  /** Origem do upsell (usado na telemetria: home, curso, ebook, landing...). */
  surface?: string;
}

export function PostPurchaseOffer({
  isOpen,
  onClose,
  onProceedWithOffers,
  onProceedWithoutOffers,
  originalProductId,
  productType,
  amount,
  surface = 'plataforma'
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
  const [extras, setExtras] = useState<ExtraOffer[]>([]);
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
      trackUpsell('modal_open', { surface, details: { originalProductId, productType, amount } });
      fetchOffers();
    }
  }, [isOpen, originalProductId]);

  const fetchOffers = async () => {
    const startedAt = Date.now();
    trackUpsell('fetch_start', { surface, details: { originalProductId } });
    try {
      setIsLoading(true);
      
      // Fetch dynamic settings
      // Lido no servidor: a tabela de integrações é restrita a administradores.
      const config = await getOfferSettings();
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

      trackUpsell('fetch_settings', {
        surface,
        details: { offerType, maxItems, trigger, minOrderAmount, autoSelect, discount: s.discountPercentage ?? 15 },
      });

      // Gatilho: só exibe quando o pedido atinge o valor mínimo configurado.
      if (trigger === 'min_amount' && (amount || 0) < minOrderAmount) {
        setOffers([]);
        trackUpsell('fetch_blocked_min_amount', {
          surface,
          reason: `pedido R$ ${(amount || 0).toFixed(2)} abaixo do mínimo R$ ${minOrderAmount.toFixed(2)}`,
        });
        await fetchExtras();
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

      let rejectedNoPrice = 0;
      let rejectedOwned = 0;

      // Filter and validate availability
      const allPossibleOffers: OfferItem[] = [
        ...(coursesRes.data || []).map(c => ({ ...c, type: 'course' as const })),
        ...(ebooksRes.data || []).map(e => ({ ...e, type: 'ebook' as const })),
      ].filter(item => {
        // 1. Ensure product has a valid price
        if (!item.price || item.price <= 0) { rejectedNoPrice++; return false; }

        // 2. Filter out items the user already owns
        const owned = item.type === 'course' ? isEnrolledInCourse(item.id) : isEnrolledInEbook(item.id);
        if (owned) rejectedOwned++;
        return !owned;
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

      // Consultorias entram no MESMO carrinho: o cliente paga aqui e agenda depois.
      const consultationOffers = await fetchConsultationOffers();
      const allOffers = [...selectedOffers, ...consultationOffers];

      setOffers(allOffers);
      setSelectedIds(autoSelect ? allOffers.map(o => o.id) : []);

      const extrasCount = await fetchExtras();

      const metrics = {
        courses: coursesRes.data?.length ?? 0,
        ebooks: ebooksRes.data?.length ?? 0,
        eligible: allPossibleOffers.length,
        shown: allOffers.length,
        consultorias: consultationOffers.length,
        extras: extrasCount,
        rejectedNoPrice,
        rejectedOwned,
      };


      if (allOffers.length === 0 && extrasCount === 0) {
        trackUpsell('fetch_empty', {
          surface,
          durationMs: Date.now() - startedAt,
          reason:
            (coursesRes.data?.length ?? 0) + (ebooksRes.data?.length ?? 0) === 0
              ? 'nenhum curso/e-book ativo e desbloqueado no catálogo'
              : rejectedOwned > 0 && rejectedNoPrice === 0
                ? 'cliente já possui todos os produtos disponíveis'
                : rejectedNoPrice > 0
                  ? 'produtos disponíveis estão sem preço configurado'
                  : 'nenhuma oferta elegível após os filtros',
          details: metrics,
        });
      } else {
        trackUpsell('fetch_success', { surface, durationMs: Date.now() - startedAt, details: metrics });
      }
    } catch (error) {
      trackUpsell('fetch_error', {
        surface,
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : String(error),
      });
      toast.error('Erro ao carregar ofertas complementares.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Consultorias vendidas no MESMO checkout. Preço, descrição e imagem vêm
   * sempre do admin (consultation_products), sem cache. Depois do pagamento o
   * cliente recebe um crédito e escolhe o horário.
   */
  const fetchConsultationOffers = async (): Promise<OfferItem[]> => {
    try {
      const { data, error } = await supabase
        .from('consultation_products')
        .select('id, title, subtitle, description, price, cover_url, duration_minutes, status, sort_order, updated_at')
        .eq('status', 'active')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return (data || [])
        .filter((c: any) => c.id !== originalProductId && Number(c.price) > 0)
        .map((c: any) => {
          const durationLabel = c.duration_minutes
            ? c.duration_minutes >= 60
              ? `${(c.duration_minutes / 60).toFixed(c.duration_minutes % 60 === 0 ? 0 : 1).replace('.', ',')}h de mentoria`
              : `${c.duration_minutes} min de mentoria`
            : null;
          return {
            id: c.id,
            title: c.title,
            description: c.subtitle || c.description || durationLabel,
            price: Number(c.price),
            type: 'consultation' as const,
            cover_url: c.cover_url,
          };
        });
    } catch (e) {
      trackUpsell('extras_error', {
        surface,
        reason: `consultorias: ${e instanceof Error ? e.message : String(e)}`,
      });
      return [];
    }
  };

  /**
   * Oportunidades extras (planos Fidelize). Não entram no carrinho porque têm
   * fluxo próprio de assinatura, mas garantem opções de upsell sempre visíveis.
   */
  const fetchExtras = async (): Promise<number> => {
    const list: ExtraOffer[] = [];
    let fidelizeCount = 0;

    try {
      const { listFidelizePlans } = await import('@/lib/fidelize-products.functions');
      const plans = await listFidelizePlans();
      for (const p of plans) {
        if (!p.active || p.plan === originalProductId) continue;
        list.push({
          id: `fidelize:${p.plan}`,
          title: p.label,
          subtitle: p.tagline || p.description,
          price: p.price,
          cover_url: p.cover,
          href: `/fidelize/${p.plan}`,
          badge: 'Assinatura',
          cta: p.ctaLabel || 'Assinar',
        });
        fidelizeCount++;
      }
    } catch (e) {
      trackUpsell('extras_error', {
        surface,
        reason: `planos Fidelize: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    setExtras(list);
    trackUpsell('extras_loaded', {
      surface,
      details: { fidelize: fidelizeCount, total: list.length },
    });
    return list.length;
  };


  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAddAndProceed = () => {
    const selectedItems = offers.filter(o => selectedIds.includes(o.id));
    trackUpsell('proceed_with_offers', {
      surface,
      details: {
        count: selectedItems.length,
        ids: selectedItems.map(o => o.id),
        total: selectedItems.reduce((sum, o) => sum + (o.price || 0), 0),
      },
    });
    onProceedWithOffers(selectedItems);
  };

  const handleProceedWithout = () => {
    trackUpsell('proceed_without_offers', {
      surface,
      reason: offers.length === 0 ? 'nenhuma oferta exibida' : 'cliente recusou as ofertas',
      details: { offersShown: offers.length, extrasShown: extras.length },
    });
    onProceedWithoutOffers();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl glass border-white/10 p-0 overflow-hidden sm:rounded-3xl w-[92vw] sm:w-full fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[90vh] flex flex-col outline-none z-[9999]">
        <div className="relative p-4 sm:p-8 flex flex-col h-full overflow-hidden">
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
          </DialogHeader>




          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gold" />
            </div>
          ) : offers.length === 0 && extras.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-white font-bold">Você já tem tudo o que oferecemos hoje.</p>
              <p className="text-muted-foreground text-sm">
                Siga para o pagamento — novas ofertas aparecem aqui assim que forem lançadas.
              </p>
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
                          {offer.type === 'course' ? 'Curso' : offer.type === 'consultation' ? 'Consultoria' : 'E-book'}
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

              {extras.length > 0 && (
                <div className="pt-2 space-y-3">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Outras oportunidades
                  </p>
                  {extras.map(extra => (
                    <a
                      key={extra.id}
                      href={extra.href}
                      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border border-white/5 bg-white/5 hover:border-white/20 transition-all"
                    >
                      <div className="h-14 w-20 sm:h-20 sm:w-32 rounded-lg overflow-hidden shrink-0 bg-black/60">
                        <img
                          src={optimizedImage(extra.cover_url) || IMG.hero}
                          alt={extra.title}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-tighter text-gold bg-gold/10 px-1.5 py-0.5 rounded">
                          {extra.badge}
                        </span>
                        <h4 className="font-bold text-sm sm:text-base leading-tight break-words text-white line-clamp-2 mt-1">
                          {extra.title}
                        </h4>
                        {extra.subtitle && (
                          <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {extra.subtitle}
                          </p>
                        )}
                        {!!extra.price && (
                          <span className="text-xs sm:text-sm font-bold text-gold">
                            R$ {extra.price.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] sm:text-xs font-bold text-gold shrink-0">{extra.cta}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isLoading && copy.allowCoupon && (
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
              onClick={handleProceedWithout}
              className="w-full rounded-xl border-white/10 hover:bg-white/5 h-12 order-2 sm:order-1 text-sm sm:text-base whitespace-normal text-center py-2"
            >
              Prosseguir sem Ofertas
            </Button>
            <Button 
              disabled={selectedIds.length === 0}
              onClick={handleAddAndProceed}
              className="w-full btn-fire rounded-xl font-bold h-12 shadow-lg shadow-fire/20 order-1 sm:order-2 text-sm sm:text-base whitespace-normal text-center py-2"
            >
              {copy.ctaLabel}

            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
