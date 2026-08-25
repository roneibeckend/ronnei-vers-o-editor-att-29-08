import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, Suspense, lazy, useRef, useLayoutEffect } from "react";
import { Check, Lock, Play, ChevronLeft, ChevronRight, FileText, StickyNote, Loader2, ShoppingCart, CheckCircle2, ArrowDown, X, Award } from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/use-enrollments";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { CouponInput, type AppliedCoupon } from "@/components/platform/CouponInput";
import { getAffiliateRef } from "@/hooks/use-affiliate-tracking";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgress } from "@/hooks/use-progress";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { FeedbackModal } from "@/components/platform/FeedbackModal";
import { FeedbackSummary } from "@/components/platform/FeedbackSummary";
import { FeedbackList } from "@/components/platform/FeedbackList";
import { PostPurchaseOffer } from "@/components/platform/PostPurchaseOffer";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { getSignedVideoUrl } from "@/lib/video.functions";
import { generateCertificate } from "@/lib/certificates-student.functions";
import { motion, AnimatePresence } from "framer-motion";



const VideoPlayer = lazy(() => 
  import("@/components/platform/VideoPlayer")
    .then(m => ({ default: m.VideoPlayer }))
    .catch(err => {
      console.error("Failed to load VideoPlayer chunk, reloading page...", err);
      if (typeof window !== 'undefined') window.location.reload();
      return { default: () => <div className="aspect-[9/16] bg-white/5 animate-pulse rounded-2xl" /> };
    })
);


export const Route = createFileRoute("/app/cursos/$courseId")({
  head: ({ params }) => {
    return {
      meta: [
        { title: "Curso — Ronnei na Veia" },
      ],
    };
  },
  loader: async ({ params }) => {
    const { data: course, error } = await supabase
      .from("courses")
      .select(`
        id, title, description, price, teacher_name, cover_url, payment_type, due_days, status, intro_video_url,
        modules (
          id, title, video_url, order_index,
          lessons (id, title, video_url, duration, order_index, module_id)
        )
      `)
      .eq("id", params.courseId)
      .eq("status", "active")
      .single();


    if (error || !course) {
      console.warn(`Course with ID ${params.courseId} not found or inactive.`);
      throw notFound();
    }
    return { course };
  },
  component: CoursePage,
});

function CoursePage() {
  const data = Route.useLoaderData() as { course: any };
  const course = data?.course;
  const navigate = useNavigate();
  const { isEnrolledInCourse, isLoading: isLoadingEnrollments } = useEnrollments();
  const { isLessonCompleted, toggleLessonProgress, isTogglingLesson, lessonProgress } = useProgress();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const { isEnabled: isOfferEnabled, syncWithDatabase } = usePostPurchaseOfferStore();

  const readerRef = useRef<HTMLDivElement>(null);
  const lessonTopRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    syncWithDatabase();
  }, [syncWithDatabase]);
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const { openPayment } = usePaymentModal();
  const getSignedUrl = useServerFn(getSignedVideoUrl);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showOpeningVideo, setShowOpeningVideo] = useState(false);
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  const [signedLessonUrl, setSignedLessonUrl] = useState<string | null>(null);
  const [signedIntroUrl, setSignedIntroUrl] = useState<string | null>(null);
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = useState(false);
  const generateCertFn = useServerFn(generateCertificate);
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const queryClient = useQueryClient();


  const handlePurchase = async () => {
    if (isOfferEnabled) {
      // Check for available offers before showing modal
      const { data: otherCourses } = await supabase.from('courses').select('id').eq('status', 'active').eq('is_locked', false).neq('id', course.id).limit(1);
      const { data: otherEbooks } = await supabase.from('ebooks').select('id').eq('status', 'active').eq('is_locked', false).limit(1);
      
      const hasOffers = (otherCourses && otherCourses.length > 0) || (otherEbooks && otherEbooks.length > 0);

      const { data } = await supabase.from('integrations').select('status').eq('category', 'offer_settings').maybeSingle();
      if ((data && data.status === false) || !hasOffers) {
        await executeCheckout([]);
        return;
      }
      setShowOffer(true);
      return;
    }
    await executeCheckout([]);
  };

  const executeCheckout = async (additionalItems: any[]) => {
    try {
      setIsProcessing(true);
      
      const products = [
        {
          productId: course.id,
          productType: 'course' as const,
          title: course.title,
          description: course.description,
          value: course.price || 0,
        },
        ...additionalItems.map(off => ({
          productId: off.id,
          productType: off.type,
          title: off.title,
          description: off.description,
          value: (off.price || 0) * (1 - (15 / 100)), 
        }))
      ];

      const { data: config } = await supabase.from('integrations').select('settings').eq('category', 'offer_settings').maybeSingle();
      const settings = config?.settings as any;
      const discount = settings?.discountPercentage || 15;

      products.forEach((p, i) => {
        if (i > 0) {
          const originalItem = additionalItems[i-1];
          p.value = (originalItem.price || 0) * (1 - (discount / 100));
        }
      });

      const result = await createPaymentLink({
        data: {
          products,
          affiliateRef: getAffiliateRef() || undefined,
          paymentType: course.payment_type || 'unique',
          dueDays: course.due_days || 3,
          couponCode: appliedCoupon?.code || localStorage.getItem('pending_coupon_code') || undefined,
        }
      });

      if ((result as any).free) {
        toast.success("Cupom aplicado! Acesso liberado gratuitamente. 🎉");
        await queryClient.invalidateQueries({ queryKey: ["course-enrollments"] });
        await queryClient.invalidateQueries({ queryKey: ["ebook-enrollments"] });
        return;
      }

      if (result.url) {
        openPayment(result.url, course.title, course.id, 'course');
      }
    } catch (error: any) {
      console.error("Erro ao processar compra:", error);
      toast.error(error.message || "Erro ao gerar link de pagamento.");
    } finally {
      setIsProcessing(false);
      setShowOffer(false);
    }
  };

  const isFree = course ? (course.price || 0) === 0 : false;
  const isEnrolled = course ? isEnrolledInCourse(course.id) : false;
  const hasAccess = isFree || isEnrolled;

  const flat = course?.modules
    ?.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    ?.flatMap((m: any) => 
      (m.lessons || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    ) || [];
  const completedCount = flat.filter((l: any) => isLessonCompleted(l.id)).length;
  const isCompleted = flat.length > 0 && completedCount === flat.length;

  if (!course) return null;

  // access and flat definitions moved above early return to maintain hook order

  useEffect(() => {
    // Só dispara se estiver tudo carregado e o usuário tiver acesso
    if (!hasAccess || hasSubmittedFeedback || isLoadingEnrollments || flat.length === 0) return;
    
    // Calcula o progresso real baseado no estado local (mais rápido que o banco)
    const currentCompletedCount = flat.filter((l: any) => isLessonCompleted(l.id)).length;
    const isActuallyCompleted = flat.length > 0 && currentCompletedCount === flat.length;

    // Check if we should show feedback modal (only if just finished)
    const justFinished = localStorage.getItem(`course_just_finished_${course.id}`) === 'true';

    if (isActuallyCompleted && justFinished) {
      const handleFinalization = async () => {
        try {
          // Generate certificate automatically first
          await generateCertFn({ data: { content_id: course.id, content_type: 'course' } });
          
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          
          const { data } = await supabase
            .from("course_feedback")
            .select("id")
            .eq("user_id", user.id)
            .eq("course_id", course.id)
            .maybeSingle();
          
          if (data) {
            setHasSubmittedFeedback(true);
          } else {
            setShowFeedbackModal(true);
            localStorage.removeItem(`course_just_finished_${course.id}`);
          }
        } catch (error) {
          console.error("Erro na finalização automática do curso:", error);
        }
      };
      handleFinalization();
    }
  }, [lessonProgress, hasSubmittedFeedback, course.id, hasAccess, flat.length, isLoadingEnrollments, generateCertFn]);

  const introNeedsSigning = Boolean(
    course?.intro_video_url &&
    !course.intro_video_url.includes('youtube') &&
    !course.intro_video_url.includes('drive')
  );

  useEffect(() => {
    let cancelled = false;
    const loadSignedIntroUrl = async () => {
      if (introNeedsSigning) {
        try {
          const result = await getSignedUrl({ data: { contentId: course.id, contentType: 'course' } });
          if (!cancelled && result?.signedUrl) setSignedIntroUrl(result.signedUrl);
        } catch (error) {
          console.error("Failed to sign intro video URL:", error);
          // Fallback to raw URL if signing fails
          if (!cancelled) setSignedIntroUrl(course.intro_video_url);
        }
      }
    };
    loadSignedIntroUrl();
    return () => { cancelled = true; };
  }, [course.intro_video_url, introNeedsSigning, getSignedUrl]);

  // Opening video removed from auto-trigger to optimize UX
  /*
  useEffect(() => {
    if (course?.intro_video_url) {
      const hasSeen = localStorage.getItem(`course_opening_${course.id}`);
      if (!hasSeen) {
        setShowOpeningVideo(true);
      }
    }
  }, [course.id, course.intro_video_url]);
  */

  const markVideoAsSeen = () => {
    setShowOpeningVideo(false);
    localStorage.setItem(`course_opening_${course.id}`, 'true');
  };

  useEffect(() => {
    if (!isLoadingEnrollments && !hasAccess) {
      // Se não tem acesso, não redirecionamos bruscamente, apenas mostramos o estado bloqueado na UI
    }
  }, [hasAccess, isLoadingEnrollments]);


  // Se não tem acesso, mostra tela de compra
  if (!isLoadingEnrollments && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PostPurchaseOffer
          isOpen={showOffer}
          onClose={() => setShowOffer(false)}
          onProceedWithOffers={(selected) => executeCheckout(selected)}
          onProceedWithoutOffers={() => executeCheckout([])}
          originalProductId={course.id}
          productType="course"
          amount={course.price || 0}
        />
        <div className="mb-6 rounded-full bg-white/5 p-8 text-gold">
          <Lock className="h-16 w-16" />
        </div>
        <h2 className="font-display text-3xl font-black">{course.title}</h2>
        <p className="mt-4 max-w-md text-muted-foreground">
          Este conteúdo é exclusivo para alunos deste treinamento. Adquira agora para liberar o acesso imediato.
        </p>
        <div className="mt-8 w-full max-w-md space-y-4">
          <CouponInput
            productId={course.id}
            productType="course"
            amount={course.price || 0}
            authenticated
            applied={appliedCoupon}
            onApplied={setAppliedCoupon}
            initialCode={typeof window !== 'undefined' ? localStorage.getItem('pending_coupon_code') ?? undefined : undefined}
          />
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link to="/app/cursos" className="btn-ghost-fire px-8 py-3 font-bold active:scale-[0.98] touch-action-manipulation">
              Voltar aos cursos
            </Link>
            <button
              onClick={handlePurchase}
              disabled={isProcessing}
              className="btn-fire px-10 py-3 font-bold shadow-lg shadow-fire/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] touch-action-manipulation"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ShoppingCart className="h-5 w-5" />
              )}
              {isProcessing
                ? "Processando..."
                : appliedCoupon && appliedCoupon.finalAmount <= 0
                  ? "Resgatar Grátis"
                  : `Comprar por R$ ${(appliedCoupon ? appliedCoupon.finalAmount : course.price)?.toString().replace(".", ",")}`}
            </button>
          </div>
          {appliedCoupon && appliedCoupon.discountAmount > 0 && (
            <p className="text-xs text-emerald-400 font-semibold text-center sm:text-left">
              De <span className="line-through">R$ {course.price?.toString().replace(".", ",")}</span> por R$ {appliedCoupon.finalAmount.toFixed(2).replace(".", ",")} com o cupom {appliedCoupon.code}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Lógica normal do curso
  // const flat defined above
  const [activeId, setActiveId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const lastWatched = localStorage.getItem(`course_last_watched_${course.id}`);
    if (lastWatched && flat.some((l: any) => l.id === lastWatched)) {
      return lastWatched;
    }
    return flat.length > 0 ? flat[0].id : undefined;
  });

  // Prefetch next lesson video
  useEffect(() => {
    if (!activeId || !flat.length) return;
    
    const currentIndex = flat.findIndex((l: any) => l.id === activeId);
    const nextLesson = flat[currentIndex + 1];
    
    if (nextLesson?.video_url && !nextLesson.video_url.includes('youtube') && !nextLesson.video_url.includes('drive')) {
      const prefetchNext = async () => {
        try {
          const result = await getSignedUrl({ data: { lessonId: nextLesson.id } });
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.as = 'video';
          link.href = result.signedUrl;
          document.head.appendChild(link);
        } catch (e) {
          console.error("Next lesson prefetch failed", e);
        }
      };
      prefetchNext();
    }
  }, [activeId, flat, getSignedUrl]);

  useEffect(() => {
    const activeLesson = flat.find((l: any) => l.id === activeId);
    if (activeLesson?.video_url && !activeLesson.video_url.includes('youtube') && !activeLesson.video_url.includes('drive')) {
      const loadSignedUrl = async () => {
        try {
          setIsLoadingSignedUrl(true);
          const result = await getSignedUrl({ data: { lessonId: activeLesson.id } });
          setSignedLessonUrl(result.signedUrl);
        } catch (error) {
          console.error("Failed to sign lesson video URL:", error);
          setSignedLessonUrl(null);
        } finally {
          setIsLoadingSignedUrl(false);
        }
      };
      loadSignedUrl();
    } else {
      setSignedLessonUrl(null);
    }
  }, [activeId, flat, getSignedUrl]);

  useEffect(() => {
    if (activeId) {
      localStorage.setItem(`course_last_watched_${course.id}`, activeId);
    }
  }, [activeId, course.id]);

  // Scroll to top when lesson changes (all devices)
  useLayoutEffect(() => {
    if (activeId) {
      // Pequeno delay para garantir que o DOM atualizou
      const timer = setTimeout(() => {
        const scrollContainer = readerRef.current?.closest('main');
        
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        if (lessonTopRef.current) {
          lessonTopRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [activeId]);





  const [tab, setTab] = useState<"materiais" | "anotacoes">("materiais");
  const [note, setNote] = useState("");

  const active = flat.find((l: any) => l.id === activeId) ?? flat[0];
  const nextLessonForPrefetch = flat.findIndex((l: any) => l.id === active?.id) + 1;
  const next = nextLessonForPrefetch < flat.length ? flat[nextLessonForPrefetch] : null;
  const prev = (flat.findIndex((l: any) => l.id === active?.id) || 0) > 0 ? flat[flat.findIndex((l: any) => l.id === active?.id) - 1] : null;


  if (isLoadingEnrollments) {
    return (
      <div className="animate-in fade-in duration-500 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="aspect-[9/16] max-h-[600px] w-full max-w-[340px] mx-auto rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }


  if (!active) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <h2 className="font-display text-xl font-bold">Este curso ainda não possui aulas cadastradas.</h2>
        <Link to="/app/cursos" className="btn-fire mt-4 inline-flex">Voltar aos cursos</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-0 sm:px-4">
      <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-end sm:justify-between mb-6 sm:mb-8 sm:px-0">
        <div>
          <div className="mb-4 flex items-center gap-4">
            <FeedbackSummary courseId={course.id} />
            {isCompleted && (
              <Link
                to="/app/certificados"
                className="flex items-center gap-2 px-3 py-1 bg-[#ff6a00]/10 hover:bg-[#ff6a00]/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#ff6a00] transition border border-[#ff6a00]/20"
              >
                <Award className="w-3.5 h-3.5" />
                Certificado Disponível
              </Link>
            )}
          </div>
          <PageHeader
            title={course.title}
            subtitle={`Professor: ${course.teacher_name || "Equipe Ronnei na Veia"}`}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {course.intro_video_url && (
            <button 
              onClick={() => setShowIntroVideo(true)}
              className="btn-fire flex items-center justify-center gap-2 px-4 sm:px-6 h-12 sm:h-auto py-3 sm:py-4 font-bold whitespace-nowrap text-xs sm:text-sm"
            >
              <Play className="h-4 w-4 fill-current flex-shrink-0" />
              Ver Vídeo de Abertura
            </button>
          )}
          <Link to="/app/cursos" className="btn-ghost-fire text-xs sm:text-sm w-full sm:w-auto h-12 sm:h-auto py-3 sm:py-4 flex items-center justify-center">← Meus Conteúdos</Link>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {(showOpeningVideo || showIntroVideo) && course.intro_video_url && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md"
            key="intro-modal"
          >
            <div className="relative w-full max-w-4xl">
              <button 
                onClick={() => {
                  if (showOpeningVideo) markVideoAsSeen();
                  setShowIntroVideo(false);
                }}
                className="absolute -top-12 right-0 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <span>{showOpeningVideo ? "Pular Vídeo" : "Fechar"}</span>
                <X className="h-6 w-6" />
              </button>
              
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-white mb-2">{course.title}</h2>
                <p className="text-fire font-bold uppercase tracking-widest text-sm">Vídeo de Abertura</p>
              </div>
 
              <div className="relative aspect-[9/16] h-[70vh] w-full max-w-[400px] mx-auto rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(255,106,0,0.2)] border border-white/10 bg-black group/intro">
                {introNeedsSigning && !signedIntroUrl ? (
                  <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-fire" /></div>
                ) : (
                  <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-fire" /></div>}>
                    <VideoPlayer
                      key={signedIntroUrl || course.intro_video_url}
                      videoId={`intro-${course.id}`}
                      src={signedIntroUrl || course.intro_video_url}
                      poster={course.cover_url || undefined}
                      isIntro={false}
                      aspect="portrait"
                      className="w-full h-full"
                      autoStart
                      onEnded={() => {
                        if (showOpeningVideo) markVideoAsSeen();
                        setShowIntroVideo(false);
                      }}
                    />
                  </Suspense>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                <button 
                  onClick={() => {
                    if (showOpeningVideo) markVideoAsSeen();
                    setShowIntroVideo(false);
                  }}
                  className="btn-fire px-10 py-4 font-black text-lg shadow-2xl shadow-fire/30 flex items-center gap-3"
                >
                  <Play className="h-6 w-6 fill-current" />
                  {showOpeningVideo ? "Começar Treinamento agora" : "Continuar Assistindo"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_400px]">
        {/* Player */}
        <div className="min-w-0 space-y-4">
          <motion.div 
            ref={readerRef}
            key={active.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="overflow-hidden rounded-none sm:rounded-2xl bg-black/20 min-h-[400px]"
          >
            <div ref={lessonTopRef} className="scroll-mt-24" />
            {isLoadingSignedUrl ? (
              <div className="aspect-[9/16] max-h-[70vh] w-full max-w-[400px] mx-auto rounded-2xl bg-white/5 animate-pulse" />
            ) : (
              <Suspense fallback={<div className="aspect-[9/16] max-h-[70vh] w-full max-w-[400px] mx-auto rounded-2xl bg-white/5 animate-pulse" />}>
                <VideoPlayer
                  videoId={active.id}
                  src={signedLessonUrl || active.video_url || ""}
                  poster={course.cover_url || ""}
                  title={active.title}
                  className="w-full"
                />
              </Suspense>
            )}


            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 glass border-t-0 rounded-t-none">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aula atual</div>
                <div className="font-display text-base sm:text-lg font-bold break-words">{active.title}</div>
              </div>
              <button 
                onClick={async () => {
                  const wasCompleted = isLessonCompleted(active.id);
                  await toggleLessonProgress({ 
                    lessonId: active.id, 
                    completed: !wasCompleted,
                    moduleId: active.module_id,
                    courseId: course.id
                  });
                  
                  // Se o curso foi concluído agora, marca para mostrar feedback
                  const newCompletedCount = flat.filter((item: any) => 
                    item.id === active.id ? !wasCompleted : isLessonCompleted(item.id)
                  ).length;
                  
                  if (newCompletedCount === flat.length && !wasCompleted) {
                    localStorage.setItem(`course_just_finished_${course.id}`, 'true');
                  }
                }}
                disabled={isTogglingLesson}
                className={`btn-fire text-xs sm:text-sm touch-target flex items-center justify-center gap-2 w-full sm:w-auto py-3 sm:py-4 h-12 sm:h-auto ${isLessonCompleted(active.id) ? 'bg-green-600 shadow-green-600/20' : ''}`}
              >
                {isTogglingLesson ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLessonCompleted(active.id) ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isLessonCompleted(active.id) ? "Concluída" : "Marcar como concluída"}
              </button>
            </div>
          </motion.div>

          <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
            <button
              disabled={!prev}
              onClick={() => prev && setActiveId(prev.id)}
              className="btn-ghost-fire text-xs sm:text-sm disabled:opacity-40 flex-1 sm:flex-none h-10 sm:h-auto"
            >
              <ChevronLeft className="h-4 w-4" /> Aula anterior
            </button>
            {!next ? (
              <button
                onClick={() => !hasSubmittedFeedback && setShowFeedbackModal(true)}
                disabled={hasSubmittedFeedback}
                className={`text-xs sm:text-sm flex-1 sm:flex-none h-10 sm:h-auto px-6 shadow-lg shadow-fire/20 transition-all ${
                  hasSubmittedFeedback 
                    ? "bg-white/5 opacity-50 cursor-not-allowed pointer-events-none text-muted-foreground border border-white/5" 
                    : "btn-fire"
                }`}
              >
                {hasSubmittedFeedback ? "Concluído curso finalizado" : "Finalizar Curso"} <Award className={`ml-2 h-4 w-4 ${hasSubmittedFeedback ? "text-muted-foreground" : ""}`} />
              </button>
            ) : (
              <button
                onClick={() => next && setActiveId(next.id)}
                className="btn-ghost-fire text-xs sm:text-sm flex-1 sm:flex-none h-10 sm:h-auto"
              >
                Próxima aula <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="glass rounded-none sm:rounded-2xl p-6 sm:p-5">
            <div className="mb-4 flex overflow-x-auto pb-2 gap-2 scrollbar-hidden">
              <div className="flex min-w-max">
                <button
                  onClick={() => setTab("materiais")}
                  className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition ${tab === "materiais" ? "bg-fire text-white shadow-lg shadow-fire/20" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <FileText className="mr-1.5 inline h-3.5 w-3.5" /> Materiais
                </button>
                <button
                  onClick={() => setTab("anotacoes")}
                  className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition ${tab === "anotacoes" ? "bg-fire text-white shadow-lg shadow-fire/20" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <StickyNote className="mr-1.5 inline h-3.5 w-3.5" /> Anotações
                </button>
              </div>
            </div>
            {tab === "materiais" ? (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-lg border border-white/5 p-3">
                  <span>PDF · Guia rápido de temperos</span>
                  <button className="text-gold hover:underline">Baixar</button>
                </li>
              </ul>
            ) : (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anote os pontos importantes desta aula..."
                className="min-h-40 w-full rounded-lg border border-white/10 bg-secondary/50 p-3 text-sm outline-none focus:border-primary text-[16px] md:text-sm"
              />
            )}
          </div>

          <FeedbackList courseId={course.id} />
        </div>

        {/* Modules */}
        <aside className="glass rounded-none sm:rounded-2xl p-6 sm:p-4">
          <div className="mb-3 px-2 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Conteúdo do curso
          </div>
          <div className="space-y-4">
            {course.modules?.map((m: any) => (
              <div key={m.id} className="space-y-3">
                <div className="space-y-2">
                  <button 
                    onClick={() => {
                      if (m.lessons && m.lessons.length > 0) {
                        setActiveId(m.lessons[0].id);
                      }
                    }}
                    className="w-full text-left px-2 text-sm font-semibold hover:text-fire transition-colors break-words"
                  >
                    {m.title}
                  </button>
                  
                  {m.video_url && (
                    <div className="px-2">
                      <div className="relative aspect-[9/16] max-h-[300px] mx-auto rounded-lg overflow-hidden glass border border-white/5">
                        <Suspense fallback={<div className="w-full h-full bg-white/5 animate-pulse" />}>
                          <VideoPlayer
                            key={`module-${m.id}`}
                            videoId={`module-${m.id}`}
                            src={m.video_url}
                            title={`Intro: ${m.title}`}
                            isIntro={true}
                            className="w-full h-full scale-[1.01]"
                          />

                        </Suspense>
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-fire/90 text-[8px] font-bold uppercase tracking-wider text-white">
                          Intro
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <ul className="space-y-1">
                  {m.lessons?.map((l: any) => {
                    const isActive = l.id === active?.id;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => setActiveId(l.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                            isActive ? "bg-fire/20 text-foreground" : "hover:bg-white/5"
                          }`}
                        >
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${isLessonCompleted(l.id) ? 'bg-green-600/20 border-green-600 text-green-500' : 'border-white/10'}`}>
                            {isLessonCompleted(l.id) ? <Check className="h-3 w-3" /> : (isActive ? <Play className="h-3 w-3" /> : <Play className="h-3 w-3 opacity-50" />)}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-normal break-words">{l.title}</span>
                          <span className="text-xs text-muted-foreground">{l.duration || "00:00"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <FeedbackModal
        courseId={course.id}
        itemTitle={course.title}
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false);
        }}
        onSuccess={() => {
          setHasSubmittedFeedback(true);
        }}
      />
    </div>
  );
}

