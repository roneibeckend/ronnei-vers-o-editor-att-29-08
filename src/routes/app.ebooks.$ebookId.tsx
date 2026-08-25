import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { Lock, ChevronLeft, ChevronRight, Loader2, ShoppingCart, BookOpen, CheckCircle2, X, Play, ArrowDown, Award, Download } from "lucide-react";
import { VideoPlayer } from "@/components/platform/VideoPlayer";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/platform/Shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useProgress } from "@/hooks/use-progress";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { CouponInput, type AppliedCoupon } from "@/components/platform/CouponInput";
import { getAffiliateRef } from "@/hooks/use-affiliate-tracking";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { PostPurchaseOffer } from "@/components/platform/PostPurchaseOffer";
import { FeedbackSummary } from "@/components/platform/FeedbackSummary";
import { FeedbackList } from "@/components/platform/FeedbackList";
import { FeedbackModal } from "@/components/platform/FeedbackModal";
import { usePostPurchaseOfferStore } from "@/hooks/use-post-purchase-offer";
import { getSignedVideoUrl } from "@/lib/video.functions";
import { generateCertificate } from "@/lib/certificates-student.functions";
import EbookDownloadDialog from "@/components/platform/EbookDownloadDialog";
import { registerEbookDownload } from "@/lib/ebook-download.functions";
import { sanitizeRichHtml } from "@/lib/sanitize-html";



export const Route = createFileRoute("/app/ebooks/$ebookId")({
  head: () => ({
    meta: [{ title: "E-book Interativo — Ronnei na Veia" }],
  }),
  loader: async ({ params }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Busca o ebook e seus módulos
    const ebookQuery = supabase
      .from("ebooks")
      .select(`
        id, title, subtitle, description, price, cover_url, opening_video_url, payment_type, due_days, status,
        modules:ebook_modules (
          id, title, order_index
        )
      `)
      .eq("id", params.ebookId)
      .single();

    // Busca os capítulos separadamente para evitar problemas com junções complexas
    const chaptersQuery = supabase
      .from("ebook_chapters")
      .select(`id, title, content, video_url, reading_minutes, order_index, module_id`)
      .eq("ebook_id", params.ebookId);

    // Verifica matricula se o usuário estiver logado
    const enrollmentQuery = userId 
      ? supabase.from("ebook_enrollments").select("id").eq("ebook_id", params.ebookId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null });

    const [ebookRes, chaptersRes, enrollmentRes] = await Promise.all([
      ebookQuery,
      chaptersQuery,
      enrollmentQuery
    ]);

    if (ebookRes.error || !ebookRes.data) {
      console.warn(`E-book with ID ${params.ebookId} not found.`);
      throw notFound();
    }

    const ebook = ebookRes.data;
    let chapters = chaptersRes.data || [];
    let isEnrolled = !!enrollmentRes.data;

    // E-books gratuitos: garante matrícula para liberar módulos/capítulos (RLS)
    if (userId && !isEnrolled && (ebook.price || 0) === 0) {
      const { data: enrolled } = await supabase.rpc("enroll_free_ebook", { p_ebook_id: params.ebookId });
      if (enrolled) {
        isEnrolled = true;
        const [refetchEbook, refetchChapters] = await Promise.all([
          supabase.from("ebooks").select(`modules:ebook_modules ( id, title, order_index )`).eq("id", params.ebookId).single(),
          supabase.from("ebook_chapters").select(`id, title, content, video_url, reading_minutes, order_index, module_id`).eq("ebook_id", params.ebookId),
        ]);
        if (refetchChapters.data) chapters = refetchChapters.data;
        if (refetchEbook.data?.modules) (ebook as any).modules = refetchEbook.data.modules;
      }
    }

    // Mapeia os capítulos para seus respectivos módulos
    const modulesWithChapters = (ebook.modules || []).map((mod: any) => ({
      ...mod,
      chapters: chapters
        .filter((chap: any) => chap.module_id === mod.id)
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    }));

    return { 
      ebook: { 
        ...ebook, 
        modules: modulesWithChapters 
      },
      serverSideEnrolled: isEnrolled
    };
  },
  component: EbookReaderPage,
});

function EbookReaderPage() {
  const { ebook, serverSideEnrolled } = Route.useLoaderData() as { ebook: any, serverSideEnrolled: boolean };
  const { isEnrolledInEbook, isLoading: isLoadingEnrollments } = useEnrollments();
  const { isChapterCompleted, completeChapter, ebookProgress } = useProgress();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState(false);
  const { isEnabled: isOfferEnabled, syncWithDatabase } = usePostPurchaseOfferStore();

  const isFree = ebook ? (ebook.price || 0) === 0 : false;
  const isEnrolled = serverSideEnrolled || (ebook ? isEnrolledInEbook(ebook.id) : false);
  const hasAccess = isFree || isEnrolled;

  const { data: interactivePreviewsStatus } = useQuery({
    queryKey: ['interactive-previews-status'],
    queryFn: async () => {
      const { data } = await supabase.from('integrations').select('status').eq('category', 'interactive_previews').maybeSingle();
      return data?.status ?? false;
    }
  });

  const readerRef = useRef<HTMLDivElement>(null);
  const chapterTopRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    syncWithDatabase();
  }, [syncWithDatabase]);
  const [showOpeningVideo, setShowOpeningVideo] = useState(false);
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadOwner, setDownloadOwner] = useState<{ id: string; name: string; email: string } | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [preparingDownload, setPreparingDownload] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const registerDownload = useServerFn(registerEbookDownload);
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const getSignedUrl = useServerFn(getSignedVideoUrl);
  const { openPayment } = usePaymentModal();
  const [signedIntroUrl, setSignedIntroUrl] = useState<string | null>(null);
  const generateCertFn = useServerFn(generateCertificate);
  const introNeedsSigning = Boolean(
    ebook?.opening_video_url &&
    !ebook.opening_video_url.includes('youtube') &&
    !ebook.opening_video_url.includes('drive')
  );

  useEffect(() => {
    let cancelled = false;
    const loadSignedUrl = async () => {
      if (introNeedsSigning) {
        try {
          const result = await getSignedUrl({ data: { contentId: ebook.id, contentType: 'ebook' } });
          if (!cancelled && result?.signedUrl) setSignedIntroUrl(result.signedUrl);
        } catch (error) {
          console.error("Failed to sign intro video URL:", error);
          // Fallback to raw URL if signing fails
          if (!cancelled) setSignedIntroUrl(ebook.opening_video_url);
        }
      }
    };
    loadSignedUrl();
    return () => { cancelled = true; };
  }, [ebook.opening_video_url, introNeedsSigning, getSignedUrl]);



  // O vídeo de abertura não inicia automaticamente; o aluno escolhe quando assistir
  // useEffect(() => {
  //   if (ebook?.opening_video_url) {
  //     const hasSeen = localStorage.getItem(`ebook_opening_${ebook.id}`);
  //     if (!hasSeen) {
  //       setShowOpeningVideo(true);
  //     }
  //   }
  // }, [ebook.id, ebook.opening_video_url]);

  const markVideoAsSeen = () => {
    setShowOpeningVideo(false);
    localStorage.setItem(`ebook_opening_${ebook.id}`, 'true');
  };

  const chapters = (ebook.modules || [])
    .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    .flatMap((m: any) => 
      (m.chapters || [])
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    );

  const [activeChapterId, setActiveChapterId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const lastRead = localStorage.getItem(`ebook_last_read_${ebook.id}`);
    if (lastRead && chapters.some((c: any) => c.id === lastRead)) {
      return lastRead;
    }
    return chapters.length > 0 ? chapters[0].id : undefined;
  });

  // Effect to ensure activeChapterId is set if it becomes undefined or null during re-renders
  useEffect(() => {
    if (!activeChapterId && chapters.length > 0) {
      setActiveChapterId(chapters[0].id);
    }
  }, [chapters, activeChapterId]);
  
  // Prefetch next chapter content
  useEffect(() => {
    if (!activeChapterId || !chapters.length) return;
    
    const currentIndex = chapters.findIndex((c: any) => c.id === activeChapterId);
    const nextChapter = chapters[currentIndex + 1];
    
    if (nextChapter?.video_url && !nextChapter.video_url.includes('youtube') && !nextChapter.video_url.includes('drive')) {
      // Prefetch signed URL for next chapter
      const prefetchUrl = async () => {
        try {
          const result = await getSignedUrl({ data: { chapterId: nextChapter.id } });
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.as = 'video';
          link.href = result.signedUrl;
          document.head.appendChild(link);
        } catch (e) {
          console.error("Next chapter prefetch failed", e);
        }
      };
      prefetchUrl();
    }
  }, [activeChapterId, chapters, getSignedUrl]);
  
  // Update local storage when chapter changes
  useEffect(() => {
    if (activeChapterId) {
      localStorage.setItem(`ebook_last_read_${ebook.id}`, activeChapterId);
    }
  }, [activeChapterId, ebook.id]);

  // Scroll to top when chapter changes (all devices)
  useLayoutEffect(() => {
    if (activeChapterId) {
      // Find the scrollable container (in Shell.tsx it is <main className="... overflow-y-auto ...">)
      const scrollContainer = readerRef.current?.closest('main');
      
      const scrollToTop = () => {
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        // Also use the anchor as a fallback/reinforcement
        if (chapterTopRef.current) {
          chapterTopRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      };

      // Execute immediately and again after a frame to handle content rendering shifts
      scrollToTop();
      const rafId = requestAnimationFrame(scrollToTop);
      
      return () => cancelAnimationFrame(rafId);
    }
  }, [activeChapterId]);




  const [signedChapterUrl, setSignedChapterUrl] = useState<string | null>(null);
  const [isLoadingSignedChapter, setIsLoadingSignedChapter] = useState(false);
  // We use find to get the current chapter based on activeChapterId
  // Fallback to the first chapter if not found, to avoid "content not found" message
  const activeChapter = chapters.find((c: any) => c.id === activeChapterId) || chapters[0];
  const activeIndex = chapters.findIndex((c: any) => c.id === activeChapter?.id);

  useEffect(() => {
    const loadSignedChapterUrl = async () => {
      if (activeChapter?.video_url && !activeChapter.video_url.includes('youtube') && !activeChapter.video_url.includes('drive')) {
        try {
          setIsLoadingSignedChapter(true);
          const result = await getSignedUrl({ data: { chapterId: activeChapter.id } });
          setSignedChapterUrl(result.signedUrl);
        } catch (error) {
          console.error("Failed to sign chapter video URL:", error);
          setSignedChapterUrl(null);
        } finally {
          setIsLoadingSignedChapter(false);
        }
      } else {
        setSignedChapterUrl(null);
      }
    };
    loadSignedChapterUrl();
  }, [activeChapter?.video_url, getSignedUrl]);

  const prevChapter = activeIndex > 0 ? chapters[activeIndex - 1] : null;
  const nextChapter = activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;


  // access definitions moved above early return to maintain hook order

  const markedChaptersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeChapterId || !activeChapter || !hasAccess) return;
    if (markedChaptersRef.current.has(activeChapterId)) return;
    markedChaptersRef.current.add(activeChapterId);

    const wasCompleted = isChapterCompleted(activeChapterId);
    
    completeChapter({
      chapterId: activeChapterId,
      ebookId: ebook.id,
      moduleId: activeChapter.module_id,
    });

    // Se o ebook foi concluído agora, marca para mostrar feedback
    const newCompletedCount = chapters.filter((c: any) => 
      c.id === activeChapterId ? true : isChapterCompleted(c.id)
    ).length;

    if (newCompletedCount === chapters.length && !wasCompleted) {
      localStorage.setItem(`ebook_just_finished_${ebook.id}`, 'true');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterId, hasAccess]);

  const queryClient = useQueryClient();

  // Estado persistido: e-book concluído e/ou feedback já enviado
  const { data: completionState } = useQuery({
    queryKey: ["ebook-completion-state", ebook.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { completed: false, feedback: false };

      const [{ data: tracking }, { data: feedback }] = await Promise.all([
        supabase
          .from("progress_tracking")
          .select("completed_at")
          .eq("user_id", user.id)
          .eq("item_type", "ebook")
          .eq("item_id", ebook.id)
          .maybeSingle(),
        supabase
          .from("course_feedback")
          .select("id")
          .eq("user_id", user.id)
          .eq("ebook_id", ebook.id)
          .maybeSingle(),
      ]);

      return { completed: !!tracking?.completed_at, feedback: !!feedback };
    },
    enabled: hasAccess,
  });

  useEffect(() => {
    if (completionState?.completed || completionState?.feedback) {
      setHasSubmittedFeedback(true);
    }
  }, [completionState?.completed, completionState?.feedback]);

  const [isFinalizing, setIsFinalizing] = useState(false);

  const handleFinalizeEbook = async () => {
    if (isFinalizing || hasSubmittedFeedback) return;
    setIsFinalizing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      // 1. Marca capítulos, módulos e o e-book como concluídos (server-side, atômico)
      const { error: rpcError } = await supabase.rpc("finalize_ebook_completion" as any, {
        _ebook_id: ebook.id,
      } as any);
      if (rpcError) throw rpcError;


      // 3. Gera o certificado
      try {
        await generateCertFn({ data: { content_id: ebook.id, content_type: "ebook" } });
      } catch (certError) {
        console.error("Erro ao gerar certificado:", certError);
      }

      localStorage.removeItem(`ebook_just_finished_${ebook.id}`);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ebook-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["global-progress-tracking"] }),
        queryClient.invalidateQueries({ queryKey: ["student-certificates"] }),
        queryClient.invalidateQueries({ queryKey: ["ebook-completion-state", ebook.id] }),
      ]);

      setHasSubmittedFeedback(true);

      if (!completionState?.feedback) {
        setShowFeedbackModal(true);
      } else {
        toast.success("E-book concluído! Certificado disponível em Certificados.");
      }
    } catch (error: any) {
      console.error("Erro ao finalizar e-book:", error);
      toast.error(error?.message || "Não foi possível finalizar o e-book. Tente novamente.");
    } finally {
      setIsFinalizing(false);
    }
  };



  const handlePurchase = async () => {
    if (isOfferEnabled) {
      // Check for available offers before showing modal
      const { data: otherCourses } = await supabase.from('courses').select('id').in('status', ['published', 'active']).eq('is_locked', false).limit(1);
      const { data: otherEbooks } = await supabase.from('ebooks').select('id').in('status', ['published', 'active']).eq('is_locked', false).neq('id', ebook.id).limit(1);
      
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
          productId: ebook.id,
          productType: 'ebook' as const,
          title: ebook.title,
          description: ebook.description,
          value: ebook.price || 0,
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
          paymentType: ebook.payment_type || 'unique',
          dueDays: ebook.due_days || 3,
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
        openPayment(result.url, ebook.title, ebook.id, 'ebook');
      }
    } catch (error: any) {
      console.error("Erro ao processar compra:", error);
      toast.error(error.message || "Erro ao gerar link de pagamento.");
    } finally {
      setIsProcessing(false);
      setShowOffer(false);
    }
  };

  // Access logic moved above for hook stability

  if (isLoadingEnrollments) {
    return (
      <div className="mx-auto max-w-5xl pb-20 animate-in fade-in duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <Skeleton className="h-[600px] w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <aside className="space-y-6">
            <Skeleton className="h-[400px] w-full rounded-3xl" />
            <Skeleton className="h-[200px] w-full rounded-3xl" />
          </aside>
        </div>
      </div>
    );
  }

  async function handleOpenDownload() {
    try {
      setPreparingDownload(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthUserId(null);
        toast.error("Faça login para baixar o e-book.");
        return;
      }
      setAuthUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", user.id)
        .maybeSingle();

      setDownloadOwner({
        id: user.id,
        name: profile?.name || user.email?.split("@")[0] || "Aluno",
        email: profile?.email || user.email || "",
      });
      setShowDownloadDialog(true);
    } catch (error: any) {
      toast.error("Não foi possível preparar o download: " + error.message);
    } finally {
      setPreparingDownload(false);
    }
  }

  async function handleConfirmDownload(accepted: boolean) {
    if (!downloadOwner) {
      toast.error("Faça login para baixar o e-book.");
      throw new Error("unauthenticated");
    }
    if (!accepted) {
      toast.error("É necessário aceitar os termos de direitos autorais.");
      throw new Error("terms_not_accepted");
    }

    // O aceite e o limite anti-abuso são validados e registrados no servidor
    // antes de qualquer geração de arquivo.
    let result: any;
    try {
      result = await registerDownload({
        data: {
          ebook_id: ebook.id,
          accepted: true,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
      });
    } catch (error: any) {
      toast.error("Não foi possível validar o download: " + (error?.message || "erro desconhecido"));
      throw error;
    }

    if (!result?.allowed) {
      toast.error(result?.message || "Download não permitido.");
      throw new Error(result?.reason || "denied");
    }

    try {
      const { generateEbookPdf } = await import("@/lib/ebook-pdf");
      generateEbookPdf({
        title: ebook.title,
        subtitle: ebook.subtitle,
        chapters: chapters.map((c: any) => ({ title: c.title, content: c.content })),
        owner: downloadOwner,
      });

      toast.success(
        `PDF gerado com sua identificação. ${result.email_sent ? "Enviamos o link do e-book no seu e-mail. " : ""}Restam ${result.remaining_for_ebook} download(s) hoje para este e-book.`,
      );
    } catch (error: any) {
      toast.error("Erro ao gerar o PDF: " + error.message);
      throw error;
    }
  }

  if (!hasAccess) {

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PostPurchaseOffer
          isOpen={showOffer}
          onClose={() => setShowOffer(false)}
          onProceedWithOffers={(selected) => executeCheckout(selected)}
          onProceedWithoutOffers={() => executeCheckout([])}
          originalProductId={ebook.id}
          productType="ebook"
          amount={ebook.price || 0}
        />
        <div className="mb-6 rounded-full bg-white/5 p-8 text-gold">
          <Lock className="h-16 w-16" />
        </div>
        <h2 className="font-display text-3xl font-black">{ebook.title}</h2>
        <p className="mt-4 max-w-md text-muted-foreground">
          Este e-book é exclusivo para alunos. Adquira agora para liberar o acesso imediato ao conteúdo completo.
        </p>
        <div className="mt-8 w-full max-w-md space-y-4">
          <CouponInput
            productId={ebook.id}
            productType="ebook"
            amount={ebook.price || 0}
            authenticated
            applied={appliedCoupon}
            onApplied={setAppliedCoupon}
            initialCode={typeof window !== 'undefined' ? localStorage.getItem('pending_coupon_code') ?? undefined : undefined}
          />
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link to="/app/cursos" className="btn-ghost-fire px-8 py-3 font-bold active:scale-[0.98] touch-action-manipulation">
              Voltar
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
                  : `Comprar por R$ ${(appliedCoupon ? appliedCoupon.finalAmount : ebook.price)?.toString().replace(".", ",")}`}
            </button>
          </div>
          {appliedCoupon && appliedCoupon.discountAmount > 0 && (
            <p className="text-xs text-emerald-400 font-semibold text-center sm:text-left">
              De <span className="line-through">R$ {ebook.price?.toString().replace(".", ",")}</span> por R$ {appliedCoupon.finalAmount.toFixed(2).replace(".", ",")} com o cupom {appliedCoupon.code}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-0 pb-20 sm:px-4 overflow-x-hidden">
      <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-end sm:justify-between mb-6 sm:mb-8 sm:px-0">
        <div>
          <div className="mb-4 flex items-center gap-4">
            <FeedbackSummary ebookId={ebook.id} />
            {chapters.length > 0 && chapters.every((c: any) => isChapterCompleted(c.id)) && (
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
            title={ebook.title}
            subtitle={ebook.subtitle || "E-book Exclusivo"}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {ebook.opening_video_url && (
            <button 
              onClick={() => setShowIntroVideo(true)}
              className="btn-fire flex items-center justify-center gap-2 px-4 sm:px-6 h-12 sm:h-auto py-3 sm:py-4 font-bold whitespace-nowrap text-xs sm:text-sm"
            >
              <Play className="h-4 w-4 fill-current flex-shrink-0" />
              Ver Vídeo de Abertura
            </button>
          )}
          <button
            onClick={handleOpenDownload}
            disabled={!authUserId || preparingDownload}
            title={!authUserId ? "Faça login para baixar o e-book" : undefined}
            className="btn-ghost-fire flex items-center justify-center gap-2 px-4 sm:px-6 h-12 sm:h-auto py-3 sm:py-4 font-bold whitespace-nowrap text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {preparingDownload ? (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
            ) : (
              <Download className="h-4 w-4 flex-shrink-0" />
            )}
            {!authUserId ? "Faça login para baixar" : "Baixar E-book"}
          </button>
          <Link to="/app/cursos" className="btn-ghost-fire text-xs sm:text-sm w-full sm:w-auto h-12 sm:h-auto py-3 sm:py-4 flex items-center justify-center">← Meus Conteúdos</Link>
        </div>
      </div>

      <EbookDownloadDialog
        open={showDownloadDialog}
        onClose={() => setShowDownloadDialog(false)}
        onConfirm={handleConfirmDownload}
        ebookTitle={ebook.title}
        owner={downloadOwner}
      />


      <AnimatePresence mode="wait">
        {(showOpeningVideo || showIntroVideo) && ebook.opening_video_url && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md"
            key="intro-modal"
          >
            <div
              className="relative flex h-[100dvh] w-full flex-col sm:mx-auto sm:max-w-4xl sm:justify-center"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <button
                onClick={() => {
                  if (showOpeningVideo) markVideoAsSeen();
                  setShowIntroVideo(false);
                }}
                aria-label={showOpeningVideo ? "Pular vídeo" : "Fechar vídeo"}
                className="fixed right-3 z-[130] inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-black/70 px-3 text-white shadow-lg backdrop-blur-md transition hover:bg-black/90 active:scale-95"
                style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
              >
                <span className="hidden text-sm font-semibold sm:inline">{showOpeningVideo ? "Pular Vídeo" : "Fechar"}</span>
                <X className="h-6 w-6" />
              </button>

              <div className="mb-3 hidden text-center sm:mb-6 sm:block">
                <h2 className="text-2xl font-black text-white mb-2">{ebook.title}</h2>
                <p className="text-fire font-bold uppercase tracking-widest text-sm">Vídeo de Abertura</p>
              </div>

              <div className="relative min-h-0 flex-1 w-full overflow-hidden bg-black sm:aspect-[9/16] sm:max-h-[68dvh] sm:max-w-[400px] sm:mx-auto sm:flex-none sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-[0_0_50px_rgba(255,106,0,0.2)] group/intro">

                {introNeedsSigning && !signedIntroUrl ? (
                  <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-fire" /></div>
                ) : (
                  <VideoPlayer
                    key={signedIntroUrl || ebook.opening_video_url}
                    videoId={`intro-${ebook.id}`}
                    src={signedIntroUrl || ebook.opening_video_url}
                    poster={ebook.cover_url || undefined}
                    isIntro={false}
                    aspect="portrait"
                    fit="contain"
                    className="!aspect-auto h-full w-full rounded-none sm:rounded-3xl"
                    autoStart
                    onEnded={() => {
                      if (showOpeningVideo) markVideoAsSeen();
                      setShowIntroVideo(false);
                    }}
                  />
                )}
              </div>

              <div
                className="shrink-0 px-3 pb-0 pt-2 sm:mt-8 sm:flex sm:justify-center sm:px-0 sm:pb-0 sm:pt-0"
                style={{ paddingBottom: "max(2px, calc(env(safe-area-inset-bottom, 0px) - 0.9rem))" }}
              >
                <button 
                  onClick={() => {
                    if (showOpeningVideo) markVideoAsSeen();
                    setShowIntroVideo(false);
                  }}
                  className="btn-fire flex w-full items-center justify-center gap-3 px-6 py-3 text-base font-black shadow-2xl shadow-fire/30 sm:w-auto sm:px-10 sm:py-4 sm:text-lg"
                >
                  <BookOpen className="h-6 w-6" />
                  {showOpeningVideo ? "Começar Leitura agora" : "Continuar Leitura"}
                </button>
              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>


      <div className="grid gap-8 lg:grid-cols-[1fr_300px] max-w-full overflow-x-hidden">
        {/* Reader Area */}
        <div className="min-w-0">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              ref={readerRef}
              key={activeChapter?.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="glass min-h-[500px] overflow-hidden rounded-none sm:rounded-3xl pb-12 sm:min-h-[600px] w-full max-w-full relative"
            >
              <div ref={chapterTopRef} className="absolute -top-32" />
              {activeChapter?.video_url && (
                <div className="w-full bg-black/40 border-b border-white/5">
                  <div className="max-w-4xl mx-auto py-4 sm:py-8 px-0 sm:px-4">
                    <div className="relative aspect-[9/16] max-h-[70vh] max-w-[400px] mx-auto rounded-none sm:rounded-2xl overflow-hidden shadow-2xl border-y sm:border border-white/10 bg-black/60 group">
                      {!activeChapter.video_url.includes('youtube') && !activeChapter.video_url.includes('drive') && (isLoadingSignedChapter || !signedChapterUrl) ? (
                        <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-fire" /></div>
                      ) : (
                        <VideoPlayer
                          videoId={`chapter-${activeChapter.id}`}
                          src={signedChapterUrl || activeChapter.video_url}
                          poster={ebook.cover_url || undefined}
                          aspect="portrait"
                          className="w-full h-full"
                        />
                      )}

                      <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-none sm:rounded-2xl"></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-6 md:p-12 mt-4">
                <div className="mb-6 sm:mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl md:text-4xl break-words">
                    {activeChapter?.title}
                  </h1>
                  {activeChapter?.reading_minutes && (
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                      {activeChapter.reading_minutes} min de leitura
                    </span>
                  )}
                </div>

                <div className="prose prose-invert prose-orange w-full max-w-full overflow-x-hidden">
                  {activeChapter?.content ? (
                    <div className="text-justify leading-[1.5] text-base sm:text-lg text-white/90 break-words 
                      [&_p]:indent-[1.25cm] [&_p]:mb-6 [&_p]:text-justify
                      [&_h1]:font-black [&_h1]:text-3xl [&_h1]:mt-12 [&_h1]:mb-6 [&_h1]:text-white [&_h1]:uppercase [&_h1]:tracking-tight
                      [&_h2]:font-bold [&_h2]:text-2xl [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-white/95
                      [&_h3]:font-bold [&_h3]:text-xl [&_h3]:mt-8 [&_h3]:mb-4 [&_h3]:text-white/90
                      [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl [&_img]:my-8 [&_img]:mx-auto [&_img]:shadow-2xl
                      [&_table]:block [&_table]:overflow-x-auto [&_table]:w-full [&_table]:my-8 [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-white/5
                      [&_td]:p-4 [&_td]:border [&_td]:border-white/10 [&_td]:text-sm
                      [&_th]:p-4 [&_th]:border [&_th]:border-white/10 [&_th]:bg-white/10 [&_th]:font-bold [&_th]:text-sm
                      [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground [&_figcaption]:text-center [&_figcaption]:mt-2 [&_figcaption]:mb-8
                      [&_.table-wrapper]:overflow-x-auto [&_.table-wrapper]:max-w-full [&_.table-wrapper]:mb-8" 
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(activeChapter.content) }} 
                    />
                  ) : activeChapter ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-fire mb-4" />
                      <p className="italic mb-2">Carregando conteúdo do capítulo...</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="text-xs underline hover:text-fire transition-colors"
                      >
                        Recarregar página se demorar
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50 text-center">
                      <p className="italic mb-4">Selecione um capítulo no menu lateral para começar a leitura.</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="text-xs underline hover:text-fire transition-colors"
                      >
                        Recarregar página
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Controls */}
          <div className="mt-8 flex items-center justify-between gap-4 px-4 sm:px-0">
            <button
              disabled={!prevChapter}
              onClick={() => setActiveChapterId(prevChapter?.id)}
              className="group flex flex-1 items-center gap-4 rounded-2xl bg-white/5 p-4 transition-all hover:bg-white/10 disabled:opacity-30"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-muted-foreground group-hover:text-fire">
                <ChevronLeft className="h-5 w-5" />
              </div>
              <div className="hidden text-left md:block">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Anterior</div>
                <div className="line-clamp-2 text-sm font-bold break-words">{prevChapter?.title || "Início"}</div>
              </div>
            </button>

            {!nextChapter ? (
              <button
                disabled={hasSubmittedFeedback || isFinalizing}
                onClick={handleFinalizeEbook}
                className={`group flex flex-1 items-center justify-end gap-4 rounded-2xl p-4 text-right transition-all shadow-lg shadow-fire/20 ${
                  hasSubmittedFeedback 
                    ? "bg-white/5 opacity-50 cursor-not-allowed pointer-events-none" 
                    : "bg-[#ff6a00] hover:bg-[#ff8c33]"
                }`}
              >
                <div className="hidden md:block">
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${hasSubmittedFeedback ? "text-muted-foreground" : "text-black/60"}`}>
                    {hasSubmittedFeedback ? "Concluído" : "Finalizar"}
                  </div>
                  <div className={`line-clamp-2 text-sm font-bold ${hasSubmittedFeedback ? "text-muted-foreground" : "text-black"}`}>
                    {hasSubmittedFeedback ? "Curso Finalizado" : isFinalizing ? "Finalizando..." : "Concluir E-book"}
                  </div>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${hasSubmittedFeedback ? "bg-white/5 text-muted-foreground" : "bg-black/20 text-black"}`}>
                  {isFinalizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Award className="h-5 w-5" />}
                </div>
              </button>

            ) : (
              <button
                onClick={() => setActiveChapterId(nextChapter?.id)}
                className="group flex flex-1 items-center justify-end gap-4 rounded-2xl bg-white/5 p-4 text-right transition-all hover:bg-white/10"
              >
                <div className="hidden md:block">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Próximo</div>
                  <div className="line-clamp-2 text-sm font-bold break-words">{nextChapter?.title}</div>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-fire text-white shadow-lg shadow-fire/20">
                  <ChevronRight className="h-5 w-5" />
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Index */}
        <aside className="space-y-6 px-4 sm:px-0 order-2 lg:order-none">
          <div className="glass rounded-3xl p-6">
            <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Conteúdo do E-book
            </h3>
            
            <div className="space-y-6">
              {ebook.opening_video_url && (
                <div className="mb-4">
                  <button
                    onClick={() => {
                      setShowIntroVideo(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all bg-fire/5 border border-fire/10 text-fire hover:bg-fire/10 group"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fire/20 text-fire group-hover:scale-110 transition-transform">
                      <Play className="h-4 w-4 fill-current" />
                    </div>
                    <div>
                      <div className="font-bold">Vídeo de Abertura</div>
                      <div className="text-[10px] opacity-60 uppercase tracking-widest">Introdução Fixa</div>
                    </div>
                  </button>
                </div>
              )}
              {ebook.modules?.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)).map((m: any) => (
                <div key={m.id}>
                  <div className="mb-3 px-2 text-xs font-bold text-fire/70 uppercase tracking-wider">{m.title}</div>
                  <div className="space-y-1">
                    {m.chapters?.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)).map((c: any) => {
                      const isActive = c.id === activeChapter?.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setActiveChapterId(c.id)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-all ${
                            isActive 
                              ? "bg-fire/10 text-fire font-bold" 
                              : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-fire" : (isChapterCompleted(c.id) ? "bg-green-500" : "bg-white/20")}`} />
                          <span className="flex-1 whitespace-normal">{c.title}</span>
                          {(isActive || isChapterCompleted(c.id)) && <CheckCircle2 className={`h-3.5 w-3.5 ${isChapterCompleted(c.id) && !isActive ? "text-green-500" : ""}`} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </aside>

        {/* Feedback - mobile: below sidebar; desktop: under reader in left column */}
        <div className="order-3 px-4 sm:px-0 lg:order-none lg:col-start-1 lg:row-start-2">
          <FeedbackList ebookId={ebook.id} />
        </div>
      </div>
      <FeedbackModal
        ebookId={ebook.id}
        itemTitle={ebook.title}
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false);
        }}
        onSuccess={() => {
          setHasSubmittedFeedback(true);
          queryClient.invalidateQueries({ queryKey: ["ebook-completion-state", ebook.id] });
        }}
      />
    </div>
  );
}
