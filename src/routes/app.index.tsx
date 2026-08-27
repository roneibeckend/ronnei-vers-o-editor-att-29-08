import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, ShoppingCart, Sparkles, Lock, Loader2 } from "lucide-react";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { savePendingCheckout, getPendingCheckout, completePendingCheckout } from "@/lib/checkout.functions";
import { useServerFn } from "@tanstack/react-start";

import { getAffiliateRef } from "@/hooks/use-affiliate-tracking";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { IMG } from "@/lib/platform-data";
import { optimizedImage } from "@/lib/image-url";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/use-enrollments";
import { CourseCardSkeleton } from "@/components/ui/skeleton";
import { PostPurchaseOffer } from "@/components/platform/PostPurchaseOffer";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";
import { VISIBLE_STATUSES, isComingSoon, COMING_SOON_NOTICE } from "@/lib/product-status";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [{ title: "Visão Geral — Ronnei na Veia" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { isEnrolledInCourse, isEnrolledInEbook, isLoading: isLoadingEnrollments } = useEnrollments();
  const { syncWithDatabase } = usePostPurchaseOfferStore();
  const [showOffer, setShowOffer] = useState(false);
  const [offerItem, setOfferItem] = useState<any>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(15);
  const { isEnabled: isOfferEnabled } = usePostPurchaseOfferStore();
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const saveCheckout = useServerFn(savePendingCheckout);
  const getPending = useServerFn(getPendingCheckout);
  const completeCheckout = useServerFn(completePendingCheckout);
  const { openPayment } = usePaymentModal();

  const executeCheckout = async (targetItem: any, additionalItems: any[]) => {
    try {
      setIsProcessing(true);
      
      // Persiste a intenção antes de criar o link
      await saveCheckout({
        data: {
          productId: targetItem.id,
          productType: targetItem.type,
          metadata: { additionalItems }
        }
      });

      
      const products = [
        {
          productId: targetItem.id,
          productType: targetItem.type,
          title: targetItem.title,
          description: targetItem.description,
          value: targetItem.price || 0,
        },
        ...additionalItems.map(off => ({
          productId: off.id,
          productType: off.type,
          title: off.title,
          description: off.description,
          value: (off.price || 0) * (1 - (discountPercentage / 100)),
        }))
      ];

      const result = await createPaymentLink({
        data: {
          products,
          affiliateRef: getAffiliateRef() || undefined,
          paymentType: targetItem.payment_type || 'unique',
          dueDays: targetItem.due_days || 3,
          couponCode: localStorage.getItem('pending_coupon_code') || undefined,
        }
      });
      
      if (result.url) {
        openPayment(result.url, targetItem.title, targetItem.id, targetItem.type);
      }
    } catch (error: any) {
      console.error("Erro ao processar compra:", error);
      toast.error(error.message || "Erro ao gerar link de pagamento.");
    } finally {
      setIsProcessing(false);
      setShowOffer(false);
    }
  };

  useEffect(() => {
    syncWithDatabase();
  }, [syncWithDatabase]);

  const { data: showcaseItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ["showcase-items"],
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const [coursesRes, ebooksRes, consultRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, description, price, cover_url, created_at, badge, status")
          .eq("is_locked", false)
          .in("status", VISIBLE_STATUSES),
        supabase
          .from("ebooks")
          .select("id, title, description, price, cover_url, created_at, badge, status")
          .eq("is_locked", false)
          .in("status", VISIBLE_STATUSES),
        supabase
          .from("consultation_products")
          .select("id, title, subtitle, description, price, cover_url, created_at, status")
          .in("status", ["active", "coming_soon"]),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (ebooksRes.error) throw ebooksRes.error;

      const items = [
        ...(coursesRes.data || []).map(c => ({ 
          ...c,
          type: 'course' as const 
        })),
        ...(ebooksRes.data || []).map(e => ({ 
          ...e,
          type: 'ebook' as const 
        })),
        ...(consultRes.data || []).map((c: any) => ({
          ...c,
          description: c.description || c.subtitle,
          badge: null,
          type: 'consultation' as const,
        })),
      ];

      return items.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
    },
  });

  const [resumeItem, setResumeItem] = useState<{ id: string, type: 'course' | 'ebook', title: string } | null>(null);

  useEffect(() => {
    if (showcaseItems) {
      const lastReadEbookId = Object.keys(localStorage).find(key => key.startsWith('ebook_last_read_'))?.split('_').pop();
      const lastWatchedCourseId = Object.keys(localStorage).find(key => key.startsWith('course_last_watched_'))?.split('_').pop();
      
      const lastItem = showcaseItems.find(i => i.id === lastReadEbookId || i.id === lastWatchedCourseId);
      if (lastItem) {
        setResumeItem({ id: lastItem.id, type: lastItem.type, title: lastItem.title });
      }
    }
  }, [showcaseItems]);

  useEffect(() => {
    const handleBuyParam = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const buyId = urlParams.get('buy');
      const buyType = urlParams.get('type') as 'course' | 'ebook' | null;

      if (buyId && buyType && !isLoadingEnrollments) {
        const alreadyEnrolled = buyType === 'course' ? isEnrolledInCourse(buyId) : isEnrolledInEbook(buyId);
        
        if (alreadyEnrolled) {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('buy');
          newUrl.searchParams.delete('type');
          window.history.replaceState({}, '', newUrl.pathname + newUrl.search);
          
          // Se já tem acesso, redireciona para o conteúdo para não ficar na home
          navigate({ 
            to: buyType === 'course' ? "/app/cursos/$courseId" : "/app/ebooks/$ebookId",
            params: buyType === 'course' ? { courseId: buyId } : { ebookId: buyId }
          });
          return;
        }

        const table = buyType === 'course' ? 'courses' : 'ebooks';
        const { data: item } = await supabase
          .from(table)
          .select('id, title, description, price, status, is_locked')
          .eq('id', buyId)
          .maybeSingle();

        if (item) {
          const targetItem = { ...item, type: buyType };
          
          // Limpa URL para evitar loops
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('buy');
          newUrl.searchParams.delete('type');
          window.history.replaceState({}, '', newUrl.pathname + newUrl.search);

          // Inicia checkout
          executeCheckout(targetItem, []);
        }
      }
    };

    handleBuyParam();
  }, [isLoadingEnrollments, isOfferEnabled]);


  const isLoadingShowcase = isLoadingItems || isLoadingEnrollments;

  const visibleItems = (showcaseItems ?? [])
    .map((item: any) => ({
      ...item,
      isEnrolled: isComingSoon(item.status) || item.type === 'consultation'
        ? false
        : item.type === 'course'
          ? isEnrolledInCourse(item.id) || (item.price || 0) === 0
          : isEnrolledInEbook(item.id) || (item.price || 0) === 0,
    }))
    .filter((item: any) => !item.isEnrolled);


  return (
    <div className="space-y-8">
      {offerItem && (
        <PostPurchaseOffer
          isOpen={showOffer}
          onClose={() => {
            setShowOffer(false);
            setOfferItem(null);
          }}
          onProceedWithOffers={(selected) => executeCheckout(offerItem, selected)}
          onProceedWithoutOffers={() => executeCheckout(offerItem, [])}
          originalProductId={offerItem.id}
          productType={offerItem.type}
          amount={offerItem.price || 0}
        />
      )}

      {resumeItem && (
        <section className="animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="glass flex flex-col items-center justify-between gap-4 rounded-2xl p-6 sm:flex-row">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-fire/20 text-primary">
                <Play className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">Continuar de onde parou?</h3>
                <p className="text-sm text-muted-foreground">Você estava vendo: <span className="text-foreground font-medium">{resumeItem.title}</span></p>
              </div>
            </div>
            <Link 
              to={resumeItem.type === 'course' ? "/app/cursos/$courseId" : "/app/ebooks/$ebookId"}
              params={resumeItem.type === 'course' ? { courseId: resumeItem.id } : { ebookId: resumeItem.id }}
              className="btn-fire px-8 py-2.5 text-xs font-bold uppercase tracking-widest whitespace-nowrap"
            >
              Retomar agora
            </Link>
          </div>
        </section>
      )}

      <section id="novidades">
        <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight break-words min-w-0">Novidades para você</h2>
          <Link to="/app/cursos" className="shrink-0 text-sm font-medium text-gold hover:underline">Ver todos</Link>
        </div>

        {isLoadingShowcase ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Você já tem acesso a todo o conteúdo disponível. Novos lançamentos aparecem aqui.
            </p>
            <Link to="/app/cursos" className="btn-fire mt-4 inline-flex px-6 py-2 text-xs font-bold uppercase tracking-widest">
              Ir para meus cursos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-6">
            {visibleItems.map((item: any) => (
              <CourseShowcaseCard
                key={`${item.type}-${item.id}`}
                item={item}
                isEnrolled={item.isEnrolled}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function CourseShowcaseCard({ item, isEnrolled }: { item: any; isEnrolled: boolean }) {
  const { isEnabled: isOfferEnabled } = usePostPurchaseOfferStore();
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const saveCheckout = useServerFn(savePendingCheckout);
  const { openPayment } = usePaymentModal();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(15);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  
  const comingSoon = isComingSoon(item.status);

  const handlePurchase = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (comingSoon) {
      toast.info(COMING_SOON_NOTICE);
      return;
    }
    
    if (isOfferEnabled) {
      const data = await getIntegrationConfig('offer_settings');
      if (data?.settings && typeof data.settings === 'object') {
        const s = data.settings as any;
        if (s.discountPercentage) setDiscountPercentage(s.discountPercentage);
      }
      setShowOffer(true);
      return;
    }

    await executeCheckout([]);
  };

  const executeCheckout = async (additionalItems: any[]) => {
    try {
      setIsProcessing(true);
      
      // Persiste a intenção
      await saveCheckout({
        data: {
          productId: item.id,
          productType: item.type,
          metadata: { additionalItems }
        }
      });

      
      const products = [
        {
          productId: item.id,
          productType: item.type,
          title: item.title,
          description: item.description,
          value: item.price || 0,
        },
        ...additionalItems.map(off => ({
          productId: off.id,
          productType: off.type,
          title: off.title,
          description: off.description,
          value: (off.price || 0) * (1 - (discountPercentage / 100)),
        }))
      ];

      const pendingCoupon = localStorage.getItem('pending_coupon_code') || undefined;

      const result = await createPaymentLink({
        data: {
          products,
          affiliateRef: getAffiliateRef() || undefined,
          paymentType: item.payment_type || 'unique',
          dueDays: item.due_days || 3,
          couponCode: pendingCoupon,
        }
      });

      if ((result as any).free) {
        localStorage.removeItem('pending_coupon_code');
        toast.success("Cupom aplicado! Acesso liberado gratuitamente. 🎉");
        await queryClient.invalidateQueries({ queryKey: ["course-enrollments"] });
        await queryClient.invalidateQueries({ queryKey: ["ebook-enrollments"] });
        navigate({ to: item.type === 'course' ? `/app/cursos/${item.id}` : `/app/ebooks/${item.id}` });
        return;
      }

      if (result.url) {
        openPayment(result.url, item.title, item.id, item.type);
      }
    } catch (error: any) {
      console.error("Erro ao processar compra:", error);
      toast.error(error.message || "Erro ao gerar link de pagamento.");
    } finally {
      setIsProcessing(false);
      setShowOffer(false);
    }
  };

  const isLocked = !isEnrolled;
  const linkTo = item.type === 'course' ? "/app/cursos/$courseId" : "/app/ebooks/$ebookId";
  const linkParams = item.type === 'course' ? { courseId: item.id } : { ebookId: item.id };
  
  return (
    <>
      <PostPurchaseOffer
        isOpen={showOffer}
        onClose={() => setShowOffer(false)}
        onProceedWithOffers={(selected) => executeCheckout(selected)}
        onProceedWithoutOffers={() => executeCheckout([])}
        originalProductId={item.id}
        productType={item.type}
        amount={item.price || 0}
      />
      <article className={`glass overflow-hidden rounded-2xl transition-all duration-300 ${isLocked ? "opacity-90 grayscale-[0.3]" : "card-tilt shadow-lg"} flex flex-col h-full active:scale-[0.99] touch-action-manipulation relative z-[1]`}>
      <div className="relative aspect-video max-h-[220px] bg-muted/20 shrink-0 overflow-hidden">
        <img 
          src={optimizedImage(item.cover_url) || IMG.hero} 
          alt={item.title} 
          className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 ${isLocked ? "blur-[1px] brightness-75" : ""}`} 

          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = IMG.hero;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {comingSoon && (
          <div className="absolute left-3 top-3 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur-md">
            Em breve
          </div>
        )}

        {item.badge && !isLocked && !comingSoon && (
          <div className="absolute left-3 top-3 rounded-full bg-gold px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
            <Sparkles className="mr-1 inline h-3 w-3" /> {item.badge}
          </div>
        )}

        {isLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-black/60 border border-white/20">
              <Lock className="h-5 w-5 text-gold" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        <h3 className="font-display text-base sm:text-lg font-bold line-clamp-2 break-words">{item.title}</h3>
        <p className="mt-1 line-clamp-3 text-xs sm:text-sm text-muted-foreground min-h-[48px] sm:min-h-[60px] break-words">{item.description}</p>
        
        {isLocked ? (
          <div className="mt-auto pt-4">
            <div className="flex items-center justify-between">
              <div>
                {comingSoon ? (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Lançamento em breve</span>
                ) : (
                  <>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Acesso imediato</span>
                    <div className="font-display text-xl font-bold text-gold">R$ {item.price?.toString().replace(".", ",")}</div>
                  </>
                )}
              </div>
              {comingSoon ? (
                <button
                  type="button"
                  disabled
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-not-allowed"
                >
                  Em breve
                </button>
              ) : (
                <button 
                  onClick={handlePurchase}
                  disabled={isProcessing}
                  className="btn-fire px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98] touch-action-manipulation"
                >
                  {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                  {isProcessing ? "..." : "Comprar"}
                </button>
              )}

            </div>
          </div>
        ) : (
          <div className="mt-auto pt-4">
            <Link
              to={linkTo}
              params={linkParams}
              className="btn-fire flex w-full items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest active:scale-[0.98] touch-action-manipulation"
            >
              <Play className="h-3.5 w-3.5" /> {item.type === 'course' ? 'Continuar Aluno' : 'Acessar E-book'}
            </Link>
          </div>
        )}
      </div>
    </article>
    </>
  );
}
