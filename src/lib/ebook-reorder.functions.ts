import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reorderChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    chapterId: z.string().uuid(),
    newOrderIndex: z.number().min(0),
    moduleId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      throw new Error("Acesso negado: permissão de administrador necessária.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chapterId, newOrderIndex, moduleId } = data;

    const { data: chapters, error: fetchError } = await supabaseAdmin
      .from('ebook_chapters')
      .select('id, order_index')
      .eq('module_id', moduleId)
      .order('order_index', { ascending: true });

    if (fetchError) throw new Error(fetchError.message);

    const currentChapters = chapters || [];
    const movingChapter = currentChapters.find(c => c.id === chapterId);

    if (!movingChapter) throw new Error("Capítulo não encontrado");

    const otherChapters = currentChapters.filter(c => c.id !== chapterId);
    otherChapters.splice(newOrderIndex, 0, movingChapter);

    const updates = otherChapters
      .map((chapter, index) =>
        chapter.order_index !== index
          ? supabaseAdmin.from('ebook_chapters').update({ order_index: index }).eq('id', chapter.id)
          : null
      )
      .filter(Boolean);

    if (updates.length > 0) {
      const results = await Promise.all(updates as any[]);
      const firstError = results.find(r => r && r.error);
      if (firstError) throw new Error(firstError.error?.message);
    }

    return { success: true };
  });
