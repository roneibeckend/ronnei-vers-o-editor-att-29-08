import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, Sparkles, Lock, ShoppingCart, Loader2 } from "lucide-react";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { useServerFn } from "@tanstack/react-start";
import { getAffiliateRef } from "@/hooks/use-affiliate-tracking";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/platform/Shell";
import { ProgressSummary } from "@/components/platform/ProgressSummary";
import { IMG } from "@/lib/platform-data";
import { optimizedImage } from "@/lib/image-url";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useProgress } from "@/hooks/use-progress";
import { CourseCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { PostPurchaseOffer } from "@/components/platform/PostPurchaseOffer";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";

export const Route = createFileRoute("/app/cursos/")({
  head: () => ({ meta: [{ title: "Meus cursos — Ronnei na Veia" }] }),
  component: CoursesPage,
});


function resolveEbookCover(e: any) {
  // Capa migrada para a VPS.
  if (e?.id === 'ee1a776c-6c7d-4a88-a980-7e671ad8d4fb') {
    return '/media/ebook-zero-10k.jpg';
  }

  // Nunca tenta carregar assets internos do antigo Lovable.
  for (const raw of [e?.cover_url, e?.cover]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (raw.includes("/__l5e/")) continue;

    const resolved = optimizedImage(raw);
    if (resolved) return resolved;
  }

  return IMG.hero;
}

function CoursesPage() {
  const { courseEnrollments, ebookEnrollments, isLoading: isLoadingEnrollments } = useEnrollments();
  const { startedCount, finishedCount, totalProgress, streak, isLoading: isLoadingProgress } = useProgress();
  const navigate = useNavigate();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [offerContext, setOfferContext] = useState<{ item: any; type: 'course' | 'ebook' } | null>(null);
  const { isEnabled: isOfferEnabled, syncWithDatabase } = usePostPurchaseOfferStore();

  const { data: interactivePreviewsStatus } = useQuery({
    queryKey: ['interactive-previews-status'],
    queryFn: async () => {
      return await getIntegrationStatus('interactive_previews');
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    syncWithDatabase();
  }, [syncWithDatabase]);

  useEffect(() => {
    // Check for auto-buy from URL (e.g. from landing page)
    const params = new URLSearchParams(window.location.search);
    const buyId = params.get('buy');
    const buyType = params.get('type') as 'course' | 'ebook';
    
    if (buyId && buyType && !isLoadingEnrollments) {
      const checkAndPurchase = async () => {
        // Se já está matriculado, apenas navega
        if (buyType === 'course' ? courseEnrollments.includes(buyId) : ebookEnrollments.includes(buyId)) {
          navigate({ to: buyType === 'course' ? `/app/cursos/${buyId}` : `/app/ebooks/${buyId}` });
          return;
        }

        const { data, error } = await supabase
          .from(buyType === 'course' ? 'courses' : 'ebooks')
          .select('*')
          .eq('id', buyId)
          .maybeSingle();
          
        if (data && !error) {
          // Limpa URL primeiro para evitar loops de processamento se o usuário der refresh
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
          
          handlePurchase(data, buyType);
        }
      };
      
      const timer = setTimeout(checkAndPurchase, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoadingEnrollments, courseEnrollments, ebookEnrollments]);
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const { openPayment } = usePaymentModal();
  const queryClient = useQueryClient();

  const handlePurchase = async (item: any, type: 'course' | 'ebook') => {
    // Check if item is already owned (safety check)
    if (type === 'course' ? courseEnrollments.includes(item.id) : ebookEnrollments.includes(item.id)) {
      navigate({ to: type === 'course' ? `/app/cursos/${item.id}` : `/app/ebooks/${item.id}` });
      return;
    }

    if (isOfferEnabled) {
      // Sync toggle state just in case
      const configData = await getIntegrationConfig('offer_settings');
      if (configData && configData.status === false) {
        await executeCheckout(item, type, []);
        return;
      }

      // Fast check: if no other products exist, skip modal
      const { data: otherCourses } = await supabase.from('courses')
        .select('id')
        .eq('status', 'active')
        .eq('is_locked', false)
        .neq('id', item.id)
        .limit(1);

      const { data: otherEbooks } = await supabase.from('ebooks')
        .select('id')
        .eq('status', 'active')
        .eq('is_locked', false)
        .neq('id', item.id)
        .limit(1);

      if ((!otherCourses || otherCourses.length === 0) && (!otherEbooks || otherEbooks.length === 0)) {
        await executeCheckout(item, type, []);
        return;
      }

      setOfferContext({ item, type });
      return;
    }

    await executeCheckout(item, type, []);
  };

  const executeCheckout = async (item: any, type: 'course' | 'ebook', additionalItems: any[]) => {
    try {
      setProcessingId(item.id);
      
      const products = [
        {
          productId: item.id,
          productType: type,
          title: item.title,
          description: item.description,
          value: item.price || 0,
        },
        ...additionalItems.map(off => ({
          productId: off.id,
          productType: off.type,
          title: off.title,
          description: off.description,
          value: (off.price || 0) * (1 - (15 / 100)), // We'll assume default 15 if not fetched, but PostPurchaseOffer handles its own display
        }))
      ];

      // To be strictly correct, we should fetch the current discount here too, 
      // but PostPurchaseOffer component is what passes 'additionalItems' 
      // actually, PostPurchaseOffer returns OfferItem[] which doesn't have the discounted price.
      // So we must fetch the discount here.
      
      const settings = (await getIntegrationSettings('offer_settings')) as any;
      const discount = settings?.discountPercentage || 15;

      products.forEach((p, i) => {
        if (i > 0) { // skip the original product
          const originalItem = additionalItems[i-1];
          p.value = (originalItem.price || 0) * (1 - (discount / 100));
        }
      });

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
        navigate({ to: type === 'course' ? `/app/cursos/${item.id}` : `/app/ebooks/${item.id}` });
        return;
      }

      if (result.url) {
        openPayment(result.url, item.title, item.id, type);
      }
    } catch (error: any) {
      console.error("Erro ao processar compra:", error);
      toast.error(error.message || "Erro ao gerar link de pagamento.");
    } finally {
      setProcessingId(null);
      setOfferContext(null);
    }
  };
  
  const { data: dbCourses, isLoading: isLoadingCourses } = useQuery({
    queryKey: ["courses"],
    staleTime: 1000 * 60 * 5, // 5 minutos
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, description, price, cover_url, badge, status, is_locked")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const { data: dbEbooks, isLoading: isLoadingEbooks } = useQuery({
    queryKey: ["ebooks"],
    staleTime: 1000 * 60 * 5, // 5 minutos
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ebooks")
        .select("id, title, description, price, cover_url, cover, badge, status, is_locked")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const ownedCourses = dbCourses?.filter((c) => courseEnrollments.includes(c.id) || ((c.price || 0) === 0 && !c.is_locked)) || [];
  const otherCourses = dbCourses?.filter((c) => !courseEnrollments.includes(c.id) && (c.price || 0) > 0) || [];
  
  const ownedEbooks = dbEbooks?.filter((e) => ebookEnrollments.includes(e.id) || ((e.price || 0) === 0 && !e.is_locked)) || [];
  const otherEbooks = dbEbooks?.filter((e) => !ebookEnrollments.includes(e.id) && (e.price || 0) > 0) || [];

  if (isLoadingCourses || isLoadingEnrollments || isLoadingEbooks || isLoadingProgress) {
    return (
      <div className="pb-10 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 opacity-0 pointer-events-none">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>

        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-48" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  // totalProgress removido daqui para evitar conflito com o que vem do hook

  return (
    <div className="pb-10">
      <PostPurchaseOffer
        isOpen={!!offerContext}
        onClose={() => setOfferContext(null)}
        onProceedWithOffers={(selected) => offerContext && executeCheckout(offerContext.item, offerContext.type, selected)}
        onProceedWithoutOffers={() => offerContext && executeCheckout(offerContext.item, offerContext.type, [])}
        originalProductId={offerContext?.item?.id || ""}
        productType={offerContext?.type}
        amount={offerContext?.item?.price || 0}
      />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between mb-8">
        <PageHeader
          title="Meus cursos"
          subtitle="Gerencie seus treinamentos e descubra novos conteúdos."
        />
        {interactivePreviewsStatus && (
          <Link to="/app/cursos/preview" className="btn-ghost-fire text-xs sm:text-sm w-full sm:w-auto mt-2 sm:mt-0 py-3 sm:py-4 h-12 sm:h-auto">
            <Sparkles className="h-4 w-4" /> Ver previews interativas
          </Link>
        )}
      </div>

      <ProgressSummary 
        totalProgress={totalProgress}
        startedCount={startedCount}
        finishedCount={finishedCount}
        streak={streak}
      />

      {/* Seção de Treinamentos (Cursos e E-books Adquiridos) */}
      <section className="mb-12">
        <h2 className="mb-6 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Seus Treinamentos
        </h2>
        
        {(ownedCourses.length > 0 || ownedEbooks.length > 0) ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Renderizar Cursos */}
            {ownedCourses.map((c) => (
              <article key={c.id} className="glass card-tilt group overflow-hidden rounded-2xl border border-white/5 transition-all hover:border-fire/30 flex flex-col h-full relative z-[1]">
                <div className="relative aspect-video w-full bg-muted/20 shrink-0 overflow-hidden">
                  <img 
                    src={optimizedImage(c.cover_url) || IMG.hero} 
                    alt={c.title} 
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 



                    loading="lazy" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = IMG.hero;
                    }}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                  
                  {c.badge && (
                    <div className="absolute left-3 top-3 rounded-full bg-gold px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
                      <Sparkles className="mr-1 inline h-3 w-3" /> {c.badge}
                    </div>
                  )}
                </div>
                
                <div className="p-4 sm:p-5 flex flex-col flex-1">
                  <h3 className="font-display text-base sm:text-lg font-bold leading-tight line-clamp-2 break-words">{c.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs sm:text-sm text-muted-foreground break-words">{c.description}</p>
                  
                  <Link
                    to="/app/cursos/$courseId"
                    params={{ courseId: c.id }}
                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs sm:text-sm font-bold bg-fire text-white shadow-lg shadow-fire/20 hover:brightness-110 transition-all active:scale-[0.98] touch-action-manipulation"
                  >
                    <Play className="h-4 w-4 fill-current" /> 
                    Acessar conteúdo
                  </Link>
                </div>
              </article>
            ))}

            {/* Renderizar E-books */}
            {ownedEbooks.map((e) => (
              <article key={e.id} className="glass card-tilt group overflow-hidden rounded-2xl border border-white/5 transition-all hover:border-fire/30 flex flex-col h-full relative z-[1]">
                <div className="relative aspect-video w-full bg-black/60 shrink-0 overflow-hidden">
                  <img
                    src={resolveEbookCover(e) || IMG.hero}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
                    loading="lazy"
                  />
                  <img 
                    src={resolveEbookCover(e) || IMG.hero} 
                    alt={e.title} 
                    className="relative h-full w-full object-contain transition-transform duration-500 group-hover:scale-105" 
                    loading="lazy" 
                  />
                </div>
                
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gold bg-gold/10 px-2 py-0.5 rounded">E-book</span>
                  </div>
                  <h3 className="font-display text-lg font-bold leading-tight line-clamp-2 break-words">{e.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground break-words">{e.description}</p>
                  
                  <Link
                    to="/app/ebooks/$ebookId"
                    params={{ ebookId: e.id }}
                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border border-fire/50 text-fire hover:bg-fire/10 transition-all active:scale-[0.98] touch-action-manipulation"
                  >
                    <Play className="h-4 w-4 fill-current" /> 
                    Ler e-book
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="glass flex flex-col items-center justify-center rounded-2xl py-20 text-center text-muted-foreground">
            Você ainda não possui nenhum conteúdo liberado.
          </div>
        )}
      </section>

      {/* Seção de Cursos Disponíveis para Compra */}
      {otherCourses.length > 0 && (
        <section className="mb-12">
          <div className="mb-6 flex items-center gap-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Conteúdo Disponível
            </h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {otherCourses.map((c) => (
              <article key={c.id} className="glass overflow-hidden rounded-2xl border border-white/5 opacity-80 transition-opacity hover:opacity-100 flex flex-col h-full relative z-[1]">
                <div className="relative aspect-video w-full bg-muted/20 grayscale-[0.3] overflow-hidden">
                  <img 
                    src={optimizedImage(c.cover_url) || IMG.hero} 
                    alt={c.title} 
                    className="h-full w-full object-cover" 


                    loading="lazy" 
                  />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-black/60 p-3 text-gold backdrop-blur-md">
                      <Lock className="h-6 w-6" />
                    </div>
                  </div>
                </div>
                
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-display text-lg font-bold leading-tight line-clamp-2 break-words">{c.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground break-words">{c.description}</p>
                  
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Investimento</span>
                      <div className="font-display text-2xl font-bold text-gold">
                        R$ {c.price?.toString().replace(".", ",")}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePurchase(c, 'course')}
                    disabled={processingId === c.id}
                    className="btn-fire mt-auto flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-lg shadow-fire/10 disabled:opacity-50 active:scale-[0.98] touch-action-manipulation"
                  >
                    {processingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    {processingId === c.id ? "Processando..." : "Comprar acesso"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Seção de E-books Disponíveis para Compra */}
      {otherEbooks.length > 0 && (
        <section>
          <div className="mb-6 flex items-center gap-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
              E-books Disponíveis
            </h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {otherEbooks.map((e) => (
              <article key={e.id} className="glass overflow-hidden rounded-2xl border border-white/5 opacity-80 transition-opacity hover:opacity-100 flex flex-col h-full relative z-[1]">
                <div className="relative aspect-video w-full bg-muted/20 grayscale-[0.3] overflow-hidden">
                  <img 
                    src={resolveEbookCover(e) || IMG.hero} 
                    alt={e.title} 
                    className="h-full w-full object-cover" 

                    loading="lazy" 
                  />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-black/60 p-3 text-gold backdrop-blur-md">
                      <Lock className="h-6 w-6" />
                    </div>
                  </div>
                </div>
                
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-display text-lg font-bold leading-tight line-clamp-2 break-words">{e.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground break-words">{e.description}</p>
                  
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Investimento</span>
                      <div className="font-display text-2xl font-bold text-gold">
                        R$ {e.price?.toString().replace(".", ",")}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePurchase(e, 'ebook')}
                    disabled={processingId === e.id}
                    className="btn-ghost-fire mt-auto flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-lg disabled:opacity-50 active:scale-[0.98] touch-action-manipulation"
                  >
                    {processingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    {processingId === e.id ? "Processando..." : "Comprar acesso"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
