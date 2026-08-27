import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Importação de alunos vindos da Kiwify.
 *
 * - Cria a conta no Auth quando o e-mail ainda não existe (senha aleatória).
 * - Atualiza nome, telefone e CPF no perfil (CPF sempre opcional).
 * - Matricula no curso/e-book escolhido, quando informado.
 * - Opcionalmente envia e-mail de definição de senha.
 * - Registra tudo em admin_audit_log.
 */

const rowSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
  name: z.string().trim().max(150).optional().nullable(),
  cpf: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});

const inputSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  productType: z.enum(["course", "ebook"]).optional().nullable(),
  productId: z.string().min(1).optional().nullable(),
  sendPasswordEmail: z.boolean().default(false),
  sendWelcomeEmail: z.boolean().default(false),
  /** Dispara o e-mail "Acesso liberado" do produto para quem foi matriculado. */
  sendAccessEmail: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

type RowResult = {
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message: string;
  cpfIgnored?: boolean;
  enrolled?: boolean;
};

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function validCpf(value?: string | null) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export const importKiwifyStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const enrollTable = data.productType === "course" ? "course_enrollments" : "ebook_enrollments";
    const enrollColumn = data.productType === "course" ? "course_id" : "ebook_id";
    const shouldEnroll = Boolean(data.productType && data.productId);

    // Nome e link do produto para o e-mail "Acesso liberado".
    let productName = "";
    let productLink = "";
    if (shouldEnroll && data.sendAccessEmail && !data.dryRun) {
      const { LINKS } = await import("@/emails/layout");
      const table = data.productType === "course" ? "courses" : "ebooks";
      const { data: product } = await db.from(table).select("title").eq("id", data.productId).maybeSingle();
      productName = product?.title ?? (data.productType === "course" ? "Curso" : "E-book");
      // As rotas do aluno usam o id do produto.
      productLink =
        data.productType === "course"
          ? `${LINKS.dashboard}/cursos/${data.productId}`
          : `${LINKS.dashboard}/ebooks/${data.productId}`;
    }

    const results: RowResult[] = [];

    for (const row of data.rows) {
      const email = row.email;
      const cpf = digits(row.cpf);
      const phone = digits(row.phone);
      const name = row.name?.trim() || email.split("@")[0];

      try {
        if (cpf && !validCpf(cpf)) {
          results.push({ email, status: "error", message: "CPF inválido na planilha." });
          continue;
        }

        // CPF já usado por outro aluno? Importamos o restante e avisamos.
        let cpfToSave: string | null = cpf || null;
        let cpfIgnored = false;
        if (cpfToSave) {
          const { data: cpfOwner } = await db
            .from("profiles")
            .select("id, email")
            .eq("cpf", cpfToSave)
            .maybeSingle();
          if (cpfOwner && cpfOwner.email !== email) {
            cpfToSave = null;
            cpfIgnored = true;
          }
        }

        const { data: existing } = await db
          .from("profiles")
          .select("id, name, phone, cpf")
          .eq("email", email)
          .maybeSingle();

        if (data.dryRun) {
          let willEnroll = shouldEnroll;
          if (shouldEnroll && existing?.id) {
            const { data: alreadyEnrolled } = await db
              .from(enrollTable)
              .select("id")
              .eq("user_id", existing.id)
              .eq(enrollColumn, data.productId)
              .maybeSingle();
            if (alreadyEnrolled) willEnroll = false;
          }
          results.push({
            email,
            status: existing ? "updated" : "created",
            message: existing
              ? `Perfil existente será atualizado${willEnroll ? " + matrícula" : shouldEnroll ? " (já matriculado)" : ""}.`
              : "Novo aluno será criado.",
            cpfIgnored,
            enrolled: willEnroll,
          });
          continue;
        }


        let userId: string | null = existing?.id ?? null;
        let created = false;

        if (!userId) {
          const password = `Kw-${crypto.randomUUID()}`;
          const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, imported_from: "kiwify" },
          });

          if (createError || !createdUser?.user) {
            // Conta pode existir no Auth sem perfil correspondente.
            const message = createError?.message ?? "Falha ao criar usuário.";
            if (!/already/i.test(message)) throw new Error(message);
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
            if (!found) throw new Error(message);
            userId = found.id;
          } else {
            userId = createdUser.user.id;
            created = true;
          }
        }

        const payload: Record<string, any> = {
          id: userId,
          email,
          name: existing?.name || name,
          updated_at: new Date().toISOString(),
        };
        if (phone && !existing?.phone) payload.phone = phone;
        if (cpfToSave && !existing?.cpf) payload.cpf = cpfToSave;

        const { error: profileError } = await db.from("profiles").upsert(payload);
        if (profileError) throw new Error(profileError.message);

        let enrolled = false;
        if (shouldEnroll && userId) {
          const { data: alreadyEnrolled } = await db
            .from(enrollTable)
            .select("id")
            .eq("user_id", userId)
            .eq(enrollColumn, data.productId)
            .maybeSingle();
          if (!alreadyEnrolled) {
            const { error: enrollError } = await db
              .from(enrollTable)
              .insert({ user_id: userId, [enrollColumn]: data.productId });
            if (enrollError) throw new Error(enrollError.message);
            enrolled = true;
          }
        }

        if (data.sendPasswordEmail) {
          try {
            const { BRAND } = await import("@/emails/layout");
            const { triggerEmailEvent } = await import("@/lib/resend.server");
            const { data: link } = await supabaseAdmin.auth.admin.generateLink({
              type: "recovery",
              email,
              options: { redirectTo: `${BRAND.site}/auth/callback` },
            });
            const resetUrl = (link as any)?.properties?.action_link;
            if (resetUrl) {
              await triggerEmailEvent({
                event: "password_reset",
                to: email,
                data: { name, reset_url: resetUrl, link: resetUrl },
                idempotencyKey: `kiwify-import-${userId}`,
              });
            }
          } catch {
            /* falha de e-mail não invalida a importação */
          }
        }

        // "Acesso liberado" do produto: enviado a quem realmente ganhou acesso agora.
        if (data.sendAccessEmail && enrolled && productName) {
          try {
            const { triggerEmailEvent } = await import("@/lib/resend.server");
            await triggerEmailEvent({
              event: "access_granted",
              to: email,
              data: {
                name,
                product_name: productName,
                amount: "—",
                date: new Date().toLocaleDateString("pt-BR"),
                access_link: productLink,
                link: productLink,
              },
              idempotencyKey: `kiwify-import-access-${userId}-${data.productId}`,
            });
          } catch {
            /* falha de e-mail não invalida a importação */
          }
        }

        if (data.sendWelcomeEmail) {
          try {
            const { LINKS } = await import("@/emails/layout");
            const { triggerEmailEvent } = await import("@/lib/resend.server");
            await triggerEmailEvent({
              event: "welcome",
              to: email,
              data: { name, dashboard_url: LINKS.dashboard, link: LINKS.dashboard },
              idempotencyKey: `kiwify-import-welcome-${userId}`,
            });
          } catch {
            /* falha de e-mail não invalida a importação */
          }
        }

        results.push({
          email,
          status: created ? "created" : "updated",
          message: cpfIgnored
            ? "Importado — CPF ignorado (já cadastrado em outro aluno)."
            : created
              ? "Aluno criado."
              : "Perfil atualizado.",
          cpfIgnored,
          enrolled,
        });
      } catch (err: any) {
        results.push({ email, status: "error", message: err?.message || "Falha na importação." });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      errors: results.filter((r) => r.status === "error").length,
      cpfIgnored: results.filter((r) => r.cpfIgnored).length,
      enrolled: results.filter((r) => r.enrolled).length,
    };

    if (!data.dryRun) {
      await db.from("admin_audit_log").insert({
        action: "kiwify_import",
        actor_id: context.userId,
        product_type: data.productType ?? null,
        product_id: data.productId ?? null,
        reason: "Importação de alunos da Kiwify",
        details: { summary, emails: results.map((r) => ({ email: r.email, status: r.status })) },
      });

      const { logSystemEvent } = await import("@/lib/system-log.server");
      await logSystemEvent({
        level: summary.errors ? "warning" : "info",
        source: "importacao-kiwify",
        message: `Importação Kiwify: ${summary.created} criados, ${summary.updated} atualizados, ${summary.errors} erros`,
        details: summary,
        userId: context.userId,
      });
    }

    return { summary, results, dryRun: data.dryRun };
  });
