import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ContentSchema = z.object({
  contentType: z.enum(["ebook", "course"]),
  contentId: z.string().min(1),
});

const NotifySchema = ContentSchema.extend({
  force: z.boolean().optional().default(false),
});

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });

  if (error || !isAdmin) {
    throw new Error(
      "Acesso negado: permissão de administrador necessária.",
    );
  }
}

async function loadContent(
  supabaseAdmin: any,
  contentType: "ebook" | "course",
  contentId: string,
) {
  const table = contentType === "ebook" ? "ebooks" : "courses";

  const { data: content, error } = await supabaseAdmin
    .from(table)
    .select("id, title, description, status")
    .eq("id", contentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!content) throw new Error("Conteúdo não encontrado.");

  return content;
}

async function loadEligibleStudents(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, name, email_notifications_opt_in")
    .eq("status", "student")
    .not("email", "is", null)
    .or(
      "email_notifications_opt_in.eq.true,email_notifications_opt_in.is.null",
    )
    .limit(5000);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).filter(
    (student: any) =>
      Boolean(student.email) &&
      student.email_notifications_opt_in !== false,
  );
}

async function findPreviousNotification(
  supabaseAdmin: any,
  contentType: "ebook" | "course",
  contentId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("content_notifications")
    .select(
      "id, created_at, recipients_count, sent_count",
    )
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

/**
 * PRÉVIA SEGURA:
 * não envia nenhum e-mail.
 *
 * Serve para confirmar:
 * - conteúdo publicado;
 * - quantidade real de alunos elegíveis;
 * - se já houve anúncio anterior.
 */
export const previewNewContentNotification =
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((data: unknown) =>
      ContentSchema.parse(data),
    )
    .handler(async ({ data, context }) => {
      await assertAdmin(context);

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const content = await loadContent(
        supabaseAdmin,
        data.contentType,
        data.contentId,
      );

      const previous =
        await findPreviousNotification(
          supabaseAdmin,
          data.contentType,
          data.contentId,
        );

      if (content.status !== "active") {
        return {
          success: true,
          canSend: false,
          contentId: content.id,
          contentType: data.contentType,
          title: content.title,
          status: content.status,
          recipients: 0,
          alreadySent: Boolean(previous),
          sentAt: previous?.created_at ?? null,
          previousSentCount:
            Number(previous?.sent_count) || 0,
          reason:
            data.contentType === "course"
              ? "Este curso ainda não está publicado. Publique o curso antes de avisar os alunos."
              : "Este eBook ainda não está publicado. Publique o eBook antes de avisar os alunos.",
        };
      }

      const students =
        await loadEligibleStudents(supabaseAdmin);

      if (students.length === 0) {
        return {
          success: true,
          canSend: false,
          contentId: content.id,
          contentType: data.contentType,
          title: content.title,
          status: content.status,
          recipients: 0,
          alreadySent: Boolean(previous),
          sentAt: previous?.created_at ?? null,
          previousSentCount:
            Number(previous?.sent_count) || 0,
          reason:
            "Nenhum aluno elegível para receber este e-mail.",
        };
      }

      return {
        success: true,
        canSend: true,
        contentId: content.id,
        contentType: data.contentType,
        title: content.title,
        status: content.status,
        recipients: students.length,
        alreadySent: Boolean(previous),
        sentAt: previous?.created_at ?? null,
        previousSentCount:
          Number(previous?.sent_count) || 0,
      };
    });

/**
 * Envia aviso de novo conteúdo SOMENTE para alunos:
 * - status = student
 * - e-mail preenchido
 * - notificações por e-mail não desativadas
 *
 * O backend também exige conteúdo publicado.
 */
export const notifyNewContent =
  createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((data: unknown) =>
      NotifySchema.parse(data),
    )
    .handler(async ({ data, context }) => {
      await assertAdmin(context);

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const { triggerEmailEvent } = await import(
        "./resend.server"
      );

      const content = await loadContent(
        supabaseAdmin,
        data.contentType,
        data.contentId,
      );

      // Proteção obrigatória do servidor.
      // Mesmo manipulando o frontend, rascunho não pode ser anunciado.
      if (content.status !== "active") {
        throw new Error(
          data.contentType === "course"
            ? "Envio bloqueado: publique o curso antes de avisar os alunos."
            : "Envio bloqueado: publique o eBook antes de avisar os alunos.",
        );
      }

      const already =
        await findPreviousNotification(
          supabaseAdmin,
          data.contentType,
          data.contentId,
        );

      if (already && !data.force) {
        return {
          success: false,
          alreadySent: true,
          sentAt: already.created_at,
          sentCount:
            Number(already.sent_count) || 0,
          recipients:
            Number(already.recipients_count) || 0,
          message:
            "Este conteúdo já foi anunciado por e-mail.",
        };
      }

      // Somente ALUNOS de verdade.
      const recipients =
        await loadEligibleStudents(supabaseAdmin);

      if (recipients.length === 0) {
        return {
          success: false,
          alreadySent: false,
          recipients: 0,
          sentCount: 0,
          error:
            "Nenhum aluno elegível para receber este e-mail.",
        };
      }

      const event =
        data.contentType === "ebook"
          ? "new_ebook"
          : "new_course";

      const link =
        data.contentType === "ebook"
          ? `https://ronneinaveia.com.br/app/ebooks/${content.id}`
          : `https://ronneinaveia.com.br/app/cursos/${content.id}`;

      const results = await Promise.allSettled(
        recipients.map((student: any) =>
          triggerEmailEvent({
            event,
            to: student.email,
            data: {
              name: student.name || "Aluno",
              title: content.title,
              description:
                content.description || undefined,
              link,
            },
            idempotencyKey:
              `${event}_${content.id}_${student.id}`,
          }),
        ),
      );

      const sentCount = results.filter(
        (result) =>
          result.status === "fulfilled",
      ).length;

      const firstError = results.find(
        (result) =>
          result.status === "rejected",
      ) as PromiseRejectedResult | undefined;

      await supabaseAdmin
        .from("content_notifications")
        .upsert(
          {
            content_type: data.contentType,
            content_id: content.id,
            title: content.title,
            recipients_count:
              recipients.length,
            sent_count: sentCount,
            created_by: context.userId,
          } as any,
          {
            onConflict:
              "content_type,content_id",
          },
        );

      return {
        success: sentCount > 0,
        alreadySent: false,
        recipients: recipients.length,
        sentCount,
        error:
          sentCount === 0
            ? String(
                firstError?.reason?.message ||
                  firstError?.reason ||
                  "",
              )
            : undefined,
      };
    });

/** Lista conteúdos já anunciados. */
export const listContentNotifications =
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      await assertAdmin(context);

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const { data, error } =
        await supabaseAdmin
          .from("content_notifications")
          .select(
            "content_type, content_id, title, recipients_count, sent_count, created_at",
          )
          .order(
            "created_at",
            { ascending: false },
          )
          .limit(500);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    });
