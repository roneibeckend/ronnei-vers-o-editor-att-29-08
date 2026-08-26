import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saveLiveClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    scheduled_at: z.string(),
    link: z.string().optional(),
    materials_url: z.string().optional(),
    cover_url: z.string().nullable().optional(),
    status: z.enum(['scheduled', 'live', 'completed']).default('scheduled'),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      throw new Error("Acesso negado: permissão de administrador necessária.");
    }
    
    const isNew = !data.id;
    const payload = {
      title: data.title,
      description: data.description || null,
      scheduled_at: data.scheduled_at,
      link: data.link || null,
      materials_url: data.materials_url || null,
      cover_url: data.cover_url || null,
      status: data.status,
    };

    let liveClassId = data.id;

    if (isNew) {
      const { data: result, error } = await context.supabase
        .from('live_classes')
        .insert(payload as any)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      liveClassId = result.id;
    } else {
      if (!liveClassId) throw new Error("Evento inválido para atualização.");

      const { data: result, error } = await context.supabase
        .from('live_classes')
        .update(payload as any)
        .eq('id', liveClassId)
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      liveClassId = result.id;
    }

    // Se for uma nova aula e estiver agendada, notifica os alunos.
    // O salvamento não pode depender da service-role key na VPS; e-mails ficam em best-effort.
    if (isNew && data.status === 'scheduled') {
      console.log(`[LiveClass] Nova aula criada: ${data.title}. Iniciando notificações...`);

      if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) {
        console.warn('[LiveClass] SUPABASE_SERVICE_ROLE_KEY ausente; evento salvo e notificações por e-mail ignoradas nesta execução.');
      } else {
        // Envia notificações em background
        (async () => {
          try {
            const { triggerEmailEvent } = await import("./resend.server");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: students, error: studentError } = await supabaseAdmin
              .from('profiles')
              .select('id, email, name')
              .not('email', 'is', null);

            if (studentError || !students || students.length === 0) return;

            const results = await Promise.allSettled(students.map(student => 
              triggerEmailEvent({
                event: 'nova_aula_ao_vivo',
                to: student.email!,
                data: {
                  name: student.name || 'Aluno',
                  title: data.title,
                  date: new Date(data.scheduled_at).toLocaleString('pt-BR'),
                  description: data.description || 'Sem descrição.',
                  link: data.link || '#'
                },
                idempotencyKey: `live_${liveClassId}_${student.id}`
              })
            ));
            const sentCount = results.filter(r => r.status === 'fulfilled').length;
            console.log(`[LiveClass] Notificações enviadas para ${sentCount}/${students.length} alunos.`);
          } catch (notifyErr) {
            console.error('[LiveClass] Erro no fluxo de notificações:', notifyErr);
          }
        })();
      }
    }

    return { success: true };
  });

export const saveContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    id: z.string().optional(),
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    price: z.number().nullable().optional(),
    is_ai_generated: z.boolean().default(false),
    content_url: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    teacher_name: z.string().nullable().optional(),
    badge: z.string().nullable().optional(),
    is_locked: z.boolean().default(false),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      throw new Error("Acesso negado: permissão de administrador necessária.");
    }

    const { error } = await context.supabase
      .from('courses')
      .upsert(data as any);

    if (error) throw new Error(error.message);
    return { success: true };
  });
