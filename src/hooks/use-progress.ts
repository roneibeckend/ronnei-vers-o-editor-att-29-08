import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { toast } from "sonner";

export function useProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: lessonProgress, isLoading: isLoadingLessonProgress } = useQuery({
    queryKey: ["lesson-progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from("lesson_progress").select("lesson_id, is_completed, updated_at").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const { data: ebookProgress, isLoading: isLoadingEbookProgress } = useQuery({
    queryKey: ["ebook-progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from("ebook_progress").select("chapter_id, completed_at, last_read_at").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const { data: globalProgressTracking, isLoading: isLoadingGlobalProgress } = useQuery({
    queryKey: ["global-progress-tracking", user?.id],
    queryFn: async () => {
      if (!user?.id) return { lessonCount: 0, chapterCount: 0, tracking: [] };

      // Considera o mesmo universo exibido em "Seus Treinamentos":
      // matrículas + conteúdos gratuitos ativos (mesma regra de app/cursos)
      const [
        { data: courseEnrollments },
        { data: ebookEnrollments },
        { data: progressTracking },
        { data: activeCourses },
        { data: activeEbooks },
      ] = await Promise.all([
        supabase.from("course_enrollments").select("course_id").eq("user_id", user.id),
        supabase.from("ebook_enrollments").select("ebook_id").eq("user_id", user.id),
        supabase.from("progress_tracking").select("item_type, item_id, started_at, completed_at").eq("user_id", user.id),
        supabase.from("courses").select("id, price").eq("status", "active"),
        supabase.from("ebooks").select("id, price").eq("status", "active"),
      ]);

      // Só entram no universo conteúdos que existem E estão ativos.
      // Matrículas em conteúdo excluído ou inativo (rascunho/arquivado) não contam.
      const activeCourseIds = new Set((activeCourses || []).map((c: any) => c.id));
      const activeEbookIds = new Set((activeEbooks || []).map((e: any) => e.id));

      const enrolledCourseIds = (courseEnrollments || []).map((c: any) => c.course_id).filter((id: string) => activeCourseIds.has(id));
      const freeCourseIds = (activeCourses || []).filter((c: any) => (c.price || 0) === 0).map((c: any) => c.id);
      const courseIds = Array.from(new Set([...enrolledCourseIds, ...freeCourseIds]));

      const enrolledEbookIds = (ebookEnrollments || []).map((e: any) => e.ebook_id).filter((id: string) => activeEbookIds.has(id));
      const freeEbookIds = (activeEbooks || []).filter((e: any) => (e.price || 0) === 0).map((e: any) => e.id);
      const ebookIds = Array.from(new Set([...enrolledEbookIds, ...freeEbookIds]));

      // Aulas agrupadas por curso
      const courseLessonMap: Record<string, string[]> = {};
      let lessonCount = 0;
      if (courseIds.length > 0) {
        const { data: modules } = await supabase.from("course_modules").select("id, course_id").in("course_id", courseIds);
        const moduleIds = (modules || []).map((m: any) => m.id);
        if (moduleIds.length > 0) {
          const { data: lessons } = await supabase.from("course_lessons").select("id, module_id").in("module_id", moduleIds);
          const moduleToCourse = new Map((modules || []).map((m: any) => [m.id, m.course_id]));
          (lessons || []).forEach((l: any) => {
            const cid = moduleToCourse.get(l.module_id);
            if (!cid) return;
            (courseLessonMap[cid] ||= []).push(l.id);
          });
          lessonCount = lessons?.length || 0;
        }
      }

      // Capítulos agrupados por e-book
      const ebookChapterMap: Record<string, string[]> = {};
      let chapterCount = 0;
      if (ebookIds.length > 0) {
        const { data: chapters } = await supabase.from("ebook_chapters").select("id, ebook_id").in("ebook_id", ebookIds);
        (chapters || []).forEach((c: any) => {
          (ebookChapterMap[c.ebook_id] ||= []).push(c.id);
        });
        chapterCount = chapters?.length || 0;
      }

      return {
        lessonCount,
        chapterCount,
        courseIds,
        ebookIds,
        courseLessonMap,
        ebookChapterMap,
        tracking: progressTracking || []
      };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });



  const toggleLessonMutation = useMutation({
    mutationFn: async ({ lessonId, completed, moduleId, courseId }: { lessonId: string, completed: boolean, moduleId?: string, courseId?: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (moduleId && courseId) {
        await supabase.from("progress_tracking").upsert({ user_id: user.id, item_type: 'module', item_id: moduleId, started_at: new Date().toISOString() }, { onConflict: 'user_id,item_type,item_id' });
        await supabase.from("progress_tracking").upsert({ user_id: user.id, item_type: 'course', item_id: courseId, started_at: new Date().toISOString() }, { onConflict: 'user_id,item_type,item_id' });
      }
      await supabase.from("lesson_progress").upsert({ user_id: user.id, lesson_id: lessonId, is_completed: completed, updated_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-progress", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["global-progress-tracking", user?.id] });
    },
  });

  const completeChapterMutation = useMutation({
    mutationFn: async ({ chapterId, ebookId, moduleId }: { chapterId: string, ebookId?: string, moduleId?: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (ebookId && moduleId) {
        await supabase.from("progress_tracking").upsert({ user_id: user.id, item_type: 'ebook_module', item_id: moduleId, started_at: new Date().toISOString() }, { onConflict: 'user_id,item_type,item_id' });
        await supabase.from("progress_tracking").upsert({ user_id: user.id, item_type: 'ebook', item_id: ebookId, started_at: new Date().toISOString() }, { onConflict: 'user_id,item_type,item_id' });
      }
      await supabase.from("ebook_progress").upsert({ user_id: user.id, chapter_id: chapterId, completed_at: new Date().toISOString(), last_read_at: new Date().toISOString() }, { onConflict: 'user_id,chapter_id' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ebook-progress", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["global-progress-tracking", user?.id] });
    },
  });

  // Progresso Total = (treinamentos concluídos ÷ treinamentos disponíveis) × 100
  // "Concluído" segue a mesma regra do sistema: todas as aulas/capítulos concluídos
  // OU registro de conclusão em progress_tracking (usado por certificados/finalize).
  const completedLessonIds = new Set((lessonProgress || []).filter((p: any) => p.is_completed).map((p: any) => p.lesson_id));
  const completedChapterIds = new Set((ebookProgress || []).filter((p: any) => !!p.completed_at).map((p: any) => p.chapter_id));

  const courseLessonMap = globalProgressTracking?.courseLessonMap || {};
  const ebookChapterMap = globalProgressTracking?.ebookChapterMap || {};
  const trackingList = (globalProgressTracking?.tracking || []) as any[];

  const isTrackedComplete = (type: string, id: string) =>
    trackingList.some((t) => t.item_type === type && t.item_id === id && !!t.completed_at);

  const trainings: { key: string; ratio: number; done: boolean }[] = [];

  (globalProgressTracking?.courseIds || []).forEach((id: string) => {
    const lessons = courseLessonMap[id] || [];
    const done = lessons.length > 0 ? lessons.filter((l) => completedLessonIds.has(l)).length : 0;
    const ratio = lessons.length > 0 ? done / lessons.length : (isTrackedComplete('course', id) ? 1 : 0);
    trainings.push({ key: `course:${id}`, ratio, done: ratio >= 1 || isTrackedComplete('course', id) });
  });

  (globalProgressTracking?.ebookIds || []).forEach((id: string) => {
    const chapters = ebookChapterMap[id] || [];
    const done = chapters.length > 0 ? chapters.filter((c) => completedChapterIds.has(c)).length : 0;
    const ratio = chapters.length > 0 ? done / chapters.length : (isTrackedComplete('ebook', id) ? 1 : 0);
    trainings.push({ key: `ebook:${id}`, ratio, done: ratio >= 1 || isTrackedComplete('ebook', id) });
  });

  const completedTrainings = trainings.filter((t) => t.done).length;
  const totalProgress = trainings.length > 0
    ? Math.round((completedTrainings / trainings.length) * 100)
    : 0;

  // E-mail de conclusão de treinamento (o servidor garante um único envio).
  const completedKeys = trainings.filter((t) => t.done).map((t) => t.key).join("|");
  useEffect(() => {
    if (!user?.id || !completedKeys) return;
    const storageKey = `completed-mail:${user.id}`;
    let notified: string[] = [];
    try {
      notified = JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch { notified = []; }

    const pending = completedKeys.split("|").filter((key) => key && !notified.includes(key));
    if (pending.length === 0) return;

    (async () => {
      try {
        const { notifyContentCompleted } = await import("@/lib/email-triggers.functions");
        for (const key of pending) {
          const [type, id] = key.split(":");
          if (!id) continue;
          await notifyContentCompleted({
            data: { content_id: id, content_type: type === "ebook" ? "ebook" : "course" },
          });
        }
        localStorage.setItem(storageKey, JSON.stringify([...notified, ...pending]));
      } catch (mailError) {
        console.error("[Progresso] Falha ao notificar conclusão:", mailError);
      }
    })();
  }, [user?.id, completedKeys]);



  // Universo válido: apenas conteúdos que ainda existem (cursos/e-books ativos ou matriculados).
  // Registros antigos de conteúdo excluído não podem mais ser contados.
  const validCourseIds = new Set<string>(globalProgressTracking?.courseIds || []);
  const validEbookIds = new Set<string>(globalProgressTracking?.ebookIds || []);
  const isValidItem = (t: any) =>
    (t.item_type === 'course' && validCourseIds.has(t.item_id)) ||
    (t.item_type === 'ebook' && validEbookIds.has(t.item_id));

  const trackedItems = (globalProgressTracking?.tracking || []).filter(isValidItem);

  // Deduplica por tipo+id (evita contagem dupla de registros repetidos)
  const uniqueItems = Array.from(
    new Map(trackedItems.map((t: any) => [`${t.item_type}:${t.item_id}`, t])).values()
  ) as any[];

  // "Iniciados" = todo conteúdo que o aluno começou (inclui os já finalizados)
  const startedCount = Math.max(
    uniqueItems.filter((t) => !!t.started_at).length,
    trainings.filter((t) => t.ratio > 0 || t.done).length
  );
  const finishedCount = Math.max(uniqueItems.filter((t) => !!t.completed_at).length, completedTrainings);

  // Sequência (dias consecutivos com atividade de estudo) — usa o fuso do aluno (BRT),
  // pois em UTC uma aula vista à noite cairia no dia seguinte e quebraria a contagem.
  const TZ = "America/Sao_Paulo";
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

  const activityDates = new Set<string>();
  const pushDate = (value?: string | null) => {
    if (!value) return;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) activityDates.add(dayKey(d));
  };
  (lessonProgress || []).forEach((p: any) => pushDate(p.updated_at));
  (ebookProgress || []).forEach((p: any) => pushDate(p.last_read_at || p.completed_at));
  trackedItems.forEach((t: any) => {
    pushDate(t.started_at);
    pushDate(t.completed_at);
  });

  let streak = 0;
  if (activityDates.size > 0) {
    const cursor = new Date();
    if (!activityDates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (activityDates.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }


  return {
    streak,
    lessonProgress: lessonProgress || [],
    isLessonCompleted: (id: string) => lessonProgress?.some(p => p.lesson_id === id && p.is_completed) || false,
    toggleLessonProgress: toggleLessonMutation.mutateAsync,
    isTogglingLesson: toggleLessonMutation.isPending,
    ebookProgress: ebookProgress || [],
    isChapterCompleted: (id: string) => ebookProgress?.some(p => p.chapter_id === id && !!p.completed_at) || false,
    completeChapter: completeChapterMutation.mutate,
    totalProgress,
    startedCount,
    finishedCount,
    isLoading: isLoadingLessonProgress || isLoadingEbookProgress || isLoadingGlobalProgress
  };
}
