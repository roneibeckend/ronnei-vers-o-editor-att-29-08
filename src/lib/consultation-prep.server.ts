// Preparação automática das consultorias (server-only).
// Monta o dossiê do cliente, persiste a preparação e envia o e-mail ao Ronnei.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildConsultationPrep,
  prepScriptToText,
  type ConsultationDossier,
  type ConsultationPrep,
  type PurchaseItem,
} from "@/lib/consultation-prep";
import { auditConsultation, formatBR } from "@/lib/consultations.server";

const money = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Histórico de compras + consultorias anteriores + briefing, em um único objeto. */
export async function loadConsultationDossier(consultationId: string): Promise<{
  row: any;
  dossier: ConsultationDossier;
}> {
  const { data: row } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();
  if (!row) throw new Error("Consultoria não encontrada.");

  const [{ data: profile }, { data: courses }, { data: ebooks }, { data: previous }] = await Promise.all([
    supabaseAdmin.from("profiles").select("name, email, phone").eq("id", row.user_id).maybeSingle(),
    supabaseAdmin
      .from("course_enrollments")
      .select("created_at, course_id, courses(title)")
      .eq("user_id", row.user_id),
    supabaseAdmin
      .from("ebook_enrollments")
      .select("created_at, ebook_id, ebooks(title)")
      .eq("user_id", row.user_id),
    supabaseAdmin
      .from("consultations")
      .select("id, product_title, scheduled_at, status, meeting_summary, action_plan")
      .eq("user_id", row.user_id)
      .neq("id", consultationId)
      .in("status", ["completed", "no_show"])
      .order("scheduled_at", { ascending: false })
      .limit(5),
  ]);

  const purchases: PurchaseItem[] = [
    ...((courses ?? []) as any[]).map((c) => ({
      title: c.courses?.title ?? c.course_id,
      type: "curso" as const,
      date: c.created_at,
    })),
    ...((ebooks ?? []) as any[]).map((e) => ({
      title: e.ebooks?.title ?? e.ebook_id,
      type: "ebook" as const,
      date: e.created_at,
    })),
  ];

  const dossier: ConsultationDossier = {
    clientName: row.client_name ?? profile?.name ?? "Aluno",
    clientEmail: row.client_email ?? profile?.email ?? null,
    clientPhone: row.client_phone ?? (profile as any)?.phone ?? null,
    productTitle: row.product_title,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    amount: row.amount ?? null,
    meetLink: row.meet_link ?? null,
    briefing: (row.briefing_data as any) ?? null,
    briefingText: row.briefing ?? null,
    purchases,
    previous: ((previous ?? []) as any[]).map((p) => ({
      id: p.id,
      title: p.product_title,
      date: p.scheduled_at,
      status: p.status,
      summary: p.meeting_summary,
      actionPlan: p.action_plan,
    })),
  };

  return { row, dossier };
}

/**
 * Gera (ou regenera) a preparação da reunião e guarda no banco.
 * Se o Ronnei ainda não escreveu um roteiro próprio, o roteiro sugerido
 * já entra no campo editável para ele apenas ajustar.
 */
export async function generateConsultationPrep(consultationId: string, actorId?: string | null) {
  const { row, dossier } = await loadConsultationDossier(consultationId);
  const prep = buildConsultationPrep(dossier);

  const patch: Record<string, unknown> = {
    prep_data: prep as never,
    prep_generated_at: new Date().toISOString(),
  };
  if (!String(row.meeting_script ?? "").trim()) patch["meeting_script"] = prepScriptToText(prep);

  await supabaseAdmin.from("consultations").update(patch as never).eq("id", consultationId);

  await auditConsultation({
    consultationId,
    actorId: actorId ?? null,
    actorRole: actorId ? "admin" : "system",
    action: "prep_generated",
    details: { alerts: prep.alerts.length, blocks: prep.script.length },
  });

  return { prep, dossier, row: { ...row, ...patch } };
}

/** E-mails que devem receber a preparação (admins da plataforma). */
export async function resolveConsultantEmails(): Promise<string[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = ((roles ?? []) as any[]).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabaseAdmin.from("profiles").select("email").in("id", ids);
  return Array.from(
    new Set(
      ((profiles ?? []) as any[])
        .map((p) => String(p.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  );
}

function prepEmailHtml(dossier: ConsultationDossier, prep: ConsultationPrep) {
  const box = (title: string, inner: string) =>
    `<h2 style="font-size:15px;margin:22px 0 8px;color:#111;">${title}</h2>${inner}`;

  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1c;">
  <div style="max-width:620px;margin:0 auto;padding:26px 24px;background:#fff;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff6a00;margin:0 0 6px;font-weight:bold;">Preparação da consultoria</p>
    <h1 style="font-size:20px;margin:0 0 4px;">${esc(dossier.clientName)} · ${esc(dossier.productTitle)}</h1>
    <p style="font-size:14px;color:#555;margin:0;">${esc(formatBR(dossier.scheduledAt))} · ${dossier.durationMinutes} min · ${esc(money(dossier.amount))}</p>

    ${box(
      "Resumo executivo",
      prep.executiveSummary
        .map((p) => `<p style="font-size:14px;line-height:1.6;margin:0 0 8px;">${esc(p)}</p>`)
        .join(""),
    )}

    ${box(
      "Dados do cliente",
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">${prep.identified
        .map(
          (i) =>
            `<tr><td style="padding:6px 8px 6px 0;color:#6b6b70;width:38%;vertical-align:top;">${esc(i.label)}</td><td style="padding:6px 0;">${esc(i.value)}</td></tr>`,
        )
        .join("")}</table>`,
    )}

    ${box(
      "Roteiro sugerido",
      prep.script
        .map(
          (s) =>
            `<p style="font-size:13.5px;margin:10px 0 4px;"><strong>${esc(s.title)}</strong> <span style="color:#6b6b70;">(${s.minutes} min)</span></p><ul style="margin:0 0 6px 18px;padding:0;font-size:13.5px;line-height:1.6;">${s.bullets
              .map((b) => `<li>${esc(b)}</li>`)
              .join("")}</ul>`,
        )
        .join(""),
    )}

    ${
      prep.alerts.length
        ? box(
            "Pontos de atenção",
            `<ul style="margin:0 0 6px 18px;padding:0;font-size:13.5px;line-height:1.6;color:#a13b12;">${prep.alerts
              .map((a) => `<li>${esc(a)}</li>`)
              .join("")}</ul>`,
          )
        : ""
    }

    ${
      dossier.meetLink
        ? `<p style="margin:24px 0 0;"><a href="${esc(dossier.meetLink)}" style="display:inline-block;background:#ff6a00;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;font-size:14px;">Entrar no Google Meet</a></p>`
        : `<p style="font-size:13px;color:#a13b12;margin:24px 0 0;">Link do Meet ainda não gerado para esta reunião.</p>`
    }

    <p style="font-size:12px;color:#6b6b70;margin:18px 0 0;">O relatório completo da reunião segue em anexo (PDF), quando disponível.</p>
  </div>
</body></html>`;
}

/**
 * Envia a preparação ao Ronnei (e a quem mais for indicado), com resumo
 * executivo, dados do cliente, link do Meet e o PDF da reunião em anexo.
 */
export async function sendConsultationPrepEmail(input: {
  consultationId: string;
  recipients?: string[];
  pdf?: { filename: string; base64: string } | null;
  actorId?: string | null;
  /** Não reenvia se já enviado (usado pelo cron). */
  once?: boolean;
}) {
  const { row, dossier } = await loadConsultationDossier(input.consultationId);

  if (input.once && row.prep_sent_at) return { skipped: true as const, reason: "já enviado" };

  const prep: ConsultationPrep = (row.prep_data as any) ?? (await generateConsultationPrep(input.consultationId)).prep;

  const recipients = (input.recipients?.length ? input.recipients : await resolveConsultantEmails())
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  if (!recipients.length) {
    await auditConsultation({
      consultationId: input.consultationId,
      action: "prep_emailed",
      status: "warn",
      details: { error: "nenhum e-mail de admin configurado" },
    });
    return { sent: false as const, error: "Nenhum e-mail de administrador encontrado." };
  }

  const { sendResendEmail } = await import("@/lib/resend.server");

  try {
    await sendResendEmail({
      to: Array.from(new Set(recipients)),
      subject: `Preparação da consultoria — ${dossier.clientName} · ${formatBR(dossier.scheduledAt)}`,
      html: prepEmailHtml(dossier, prep),
      tags: [{ name: "tipo", value: "preparacao_consultoria" }],
      attachments: input.pdf ? [{ filename: input.pdf.filename, content: input.pdf.base64 }] : undefined,
    });
  } catch (err) {
    await auditConsultation({
      consultationId: input.consultationId,
      action: "prep_emailed",
      status: "error",
      details: { error: (err as Error)?.message, recipients },
    });
    return { sent: false as const, error: (err as Error)?.message ?? "Falha ao enviar a preparação." };
  }

  await supabaseAdmin
    .from("consultations")
    .update({ prep_sent_at: new Date().toISOString() } as never)
    .eq("id", input.consultationId);

  await auditConsultation({
    consultationId: input.consultationId,
    actorId: input.actorId ?? null,
    actorRole: input.actorId ? "admin" : "system",
    action: "prep_emailed",
    details: { recipients, attached: Boolean(input.pdf) },
  });

  return { sent: true as const, recipients };
}

/**
 * Rotina do cron: gera e envia a preparação das reuniões que acontecem
 * nas próximas 12 horas e ainda não foram preparadas.
 */
export async function runConsultationPrep(hoursAhead = 12) {
  const now = Date.now();
  const { data: upcoming } = await supabaseAdmin
    .from("consultations")
    .select("id, prep_sent_at")
    .eq("status", "scheduled")
    .is("prep_sent_at", null)
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", new Date(now + hoursAhead * 3600_000).toISOString());

  let prepared = 0;
  let failed = 0;

  for (const c of (upcoming ?? []) as any[]) {
    try {
      await generateConsultationPrep(c.id);
      const res = await sendConsultationPrepEmail({ consultationId: c.id, once: true });
      if ("sent" in res && res.sent) prepared++;
      else if ("error" in res && res.error) failed++;
    } catch (err) {
      failed++;
      await auditConsultation({
        consultationId: c.id,
        action: "prep_generated",
        status: "error",
        details: { error: (err as Error)?.message },
      });
    }
  }

  return { checked: upcoming?.length ?? 0, prepared, failed };
}
