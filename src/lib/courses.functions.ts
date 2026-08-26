import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !isAdmin) throw new Error("Acesso negado: permissão de administrador necessária.");
}

// Tipos para validação Zod
const CourseSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3),
  slug: z.string(),
  description: z.string().optional().nullable(),
  cover_url: z.string().optional().nullable(),
  intro_video_url: z.string().optional().nullable(),
  level: z.string().default('beginner'),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  order_index: z.number().int().default(0),
});

const ModuleSchema = z.object({
  id: z.string().uuid().optional(),
  course_id: z.string(),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  order_index: z.number().int().default(0),
});

const LessonSchema = z.object({
  id: z.string().uuid().optional(),
  module_id: z.string().uuid(),
  title: z.string().min(2),
  slug: z.string(),
  description: z.string().optional().nullable(),
  video_url: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  duration_minutes: z.number().int().default(0),
  order_index: z.number().int().default(0),
  is_free: z.boolean().default(false),
});

// Funções de Servidor


export const upsertModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => ModuleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin
      .from('course_modules')
      .upsert(data)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return result;
  });

export const upsertLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => LessonSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin
      .from('course_lessons')
      .upsert(data)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return result;
  });


