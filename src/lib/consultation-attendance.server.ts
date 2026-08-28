/**
 * Presença, falta (no-show) e remarcação com taxa — helpers server-only.
 *
 * Fluxo:
 * 1. 24h antes o aluno recebe um e-mail pedindo a confirmação de presença
 *    (botão de 1 clique, sem login).
 * 2. Faltando 4h sem confirmação, o Ronnei é avisado (painel + push + e-mail)
 *    para chamar o aluno manualmente.
 * 3. Faltou ou precisou remarcar? A primeira remarcação do pedido é gratuita;
 *    da segunda em diante o aluno paga a taxa antes de o horário mudar.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  RESCHEDULE_FEE_BRL,
  RESCHEDULE_FEE_HOLD_MINUTES,
  formatFee,
  rescheduleRequiresFee,
  rescheduleFeeDecision,
} from "@/lib/consultation-policy";

const SITE = "https://ronneinaveia.com.br";

/* ----------------------------- Token 1 clique ----------------------------- */

function attendanceSecret() {
  const secret = process.env["REPORT_INTERNAL_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("Segredo interno não configurado.");
  return secret;
}

export function signAttendanceToken(consultationId: string) {
  return createHmac("sha256", attendanceSecret())
    .update(`attendance:${consultationId}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyAttendanceToken(consultationId: string, token: string | null | undefined) {
  if (!token) return false;
  try {
    const expected = Buffer.from(signAttendanceToken(consultationId));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export function attendanceConfirmUrl(consultationId: string) {
  return `${SITE}/api/public/consultoria-presenca?c=${consultationId}&t=${signAttendanceToken(consultationId)}`;
}

/* ------------------------------- Confirmação ------------------------------- */

/** Registra a confirmação de presença do aluno (idempotente). */
export async function confirmAttendance(consultationId: string, actorRole = "student") {
  const { auditConsultation } = await import("@/lib/consultations.server");
  const { data: row } = await supabaseAdmin
    .from("consultations")
    .select("id, status, scheduled_at, attendance_confirmed_at, product_title")
    .eq("id", consultationId)
    .maybeSingle();

  if (!row) return { ok: false as const, error: "Consultoria não encontrada." };
  if ((row as any).attendance_confirmed_at) {
    return { ok: true as const, alreadyConfirmed: true, row };
  }
  if (row.status !== "scheduled") {
    return { ok: false as const, error: "Esta consultoria não está mais agendada." };
  }

  await supabaseAdmin
    .from("consultations")
    .update({ attendance_confirmed_at: new Date().toISOString() } as never)
    .eq("id", consultationId);

  await auditConsultation({
    consultationId,
    actorRole,
    action: "attendance_confirmed",
  });

  return { ok: true as const, alreadyConfirmed: false, row };
}

/** Envia o pedido de confirmação de presença e carimba o envio. */
export async function requestAttendanceConfirmation(row: {
  id: string;
  client_email: string | null;
  client_name?: string | null;
  product_title: string;
  scheduled_at: string;
  duration_minutes: number;
  meet_link?: string | null;
}) {
  const { sendConsultationAttendanceRequest } = await import("@/lib/consultations.server");
  await sendConsultationAttendanceRequest(row as never, attendanceConfirmUrl(row.id));
  await supabaseAdmin
    .from("consultations")
    .update({ attendance_requested_at: new Date().toISOString() } as never)
    .eq("id", row.id);
  return { requested: true };
}

/** Avisa o Ronnei sobre um aluno que não confirmou presença. */
export async function alertUnconfirmedAttendance(row: {
  id: string;
  client_name?: string | null;
  scheduled_at: string;
  product_title: string;
}) {
  const { notifyAdmin } = await import("@/lib/admin-notify.server");
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(row.scheduled_at));

  return notifyAdmin({
    type: "system",
    severity: "warning",
    title: `⚠️ Sem confirmação — ${row.client_name || "Aluno"} (${when})`,
    body: `${row.product_title}: o aluno ainda não confirmou presença. Chame no WhatsApp para garantir a reunião.`,
    entityType: "consultation",
    entityId: row.id,
    link: "/admin/consultorias",
    dedupKey: `consultation-unconfirmed:${row.id}`,
    metadata: { consultationId: row.id, scheduledAt: row.scheduled_at },
  });
}

/* ------------------------------- Remarcação ------------------------------- */

/** Quantas remarcações já foram feitas neste pedido (combo inteiro). */
export async function orderRescheduleCount(row: { id: string; booking_group?: string | null }) {
  if (!row.booking_group) {
    const { data } = await supabaseAdmin
      .from("consultations")
      .select("reschedule_count")
      .eq("id", row.id)
      .maybeSingle();
    return Number((data as any)?.reschedule_count ?? 0);
  }
  const { data } = await supabaseAdmin
    .from("consultations")
    .select("reschedule_count")
    .eq("booking_group", row.booking_group);
  return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.reschedule_count ?? 0), 0);
}

/**
 * A próxima remarcação deste encontro é paga?
 * Falta sem aviso queima a cortesia; cancelamento pelo consultor é sempre grátis.
 */
export async function rescheduleNeedsFee(row: {
  id: string;
  booking_group?: string | null;
  status?: string | null;
  no_show_excused?: boolean | null;
  cancelled_by?: string | null;
}) {
  return (await rescheduleFeeInfo(row)).requiresFee;
}

/** Detalha a decisão de taxa (usada no painel do aluno). */
export async function rescheduleFeeInfo(row: {
  id: string;
  booking_group?: string | null;
  status?: string | null;
  no_show_excused?: boolean | null;
  cancelled_by?: string | null;
}) {
  const used = await orderRescheduleCount(row);
  return { used, ...rescheduleFeeDecision(row, used) };
}

/**
 * Move o encontro de horário: atualiza a linha, o evento/Meet no Google e
 * avisa o aluno. Usado tanto na remarcação gratuita quanto na paga.
 */
export async function applyConsultationReschedule(
  row: any,
  startIso: string,
  endIso: string,
  opts: { actorId?: string | null; actorRole?: string; paid?: boolean; paymentId?: string | null } = {},
) {
  const { rescheduleGoogleMeeting, sendConsultationRescheduled, auditConsultation } = await import(
    "@/lib/consultations.server"
  );

  const previousIso = row.scheduled_at as string;

  const { error } = await supabaseAdmin
    .from("consultations")
    .update({
      scheduled_at: startIso,
      ends_at: endIso,
      status: "scheduled",
      reschedule_count: Number(row.reschedule_count ?? 0) + 1,
      attendance_confirmed_at: null,
      attendance_requested_at: null,
      no_show_at: null,
      reminder_24h_sent_at: null,
      reminder_8h_sent_at: null,
      reminder_1h_sent_at: null,
      pending_reschedule_at: null,
      pending_reschedule_ends_at: null,
      pending_reschedule_payment_id: null,
      pending_reschedule_payment_url: null,
      pending_reschedule_expires_at: null,
      ...(opts.paid ? { reschedule_fee_paid_at: new Date().toISOString() } : {}),
    } as never)
    .eq("id", row.id);

  if (error) throw new Error(`Falha ao reagendar: ${error.message}`);

  const google = await rescheduleGoogleMeeting(row as never, startIso, endIso);

  const updated = {
    ...row,
    scheduled_at: startIso,
    ends_at: endIso,
    meet_link: (google as any)?.meetLink ?? row.meet_link,
  };

  await sendConsultationRescheduled(updated as never, previousIso);

  await auditConsultation({
    consultationId: row.id,
    actorId: opts.actorId ?? null,
    actorRole: opts.actorRole ?? "student",
    action: opts.paid ? "rescheduled_paid" : "rescheduled",
    details: {
      from: previousIso,
      to: startIso,
      paid: !!opts.paid,
      paymentId: opts.paymentId ?? null,
      google: (google as any)?.ok ?? null,
    },
  });

  return { rescheduled: true, scheduledAt: startIso, meetLink: updated.meet_link };
}

/** Gera a cobrança da taxa de remarcação e guarda o horário pretendido. */
export async function createRescheduleFeeCharge(input: {
  row: any;
  userId: string;
  startIso: string;
  endIso: string;
}) {
  const { asaasFetchJson, asaasHeaders, asaasErrorMessage, getAsaasConfig, buildExternalReference } =
    await import("@/lib/asaas.server");
  const { auditConsultation } = await import("@/lib/consultations.server");
  const { apiKey, baseUrl } = await getAsaasConfig();

  const response = await asaasFetchJson(`${baseUrl}/paymentLinks`, {
    method: "POST",
    headers: asaasHeaders(apiKey),
    body: JSON.stringify({
      name: "Taxa de remarcacao de consultoria",
      description: `Taxa de remarcação — ${input.row.product_title}`.slice(0, 450),
      value: RESCHEDULE_FEE_BRL,
      billingType: "UNDEFINED",
      chargeType: "DETACHED",
      dueDateLimitDays: 1,
      notificationEnabled: true,
      externalReference: buildExternalReference({
        productType: "consultation_fee",
        productId: String(input.row.product_id ?? "reschedule"),
        userId: input.userId,
        consultationId: input.row.id,
      }),
    }),
  });

  if (!response.ok || !response.json) throw new Error(asaasErrorMessage(response));

  const paymentUrl = response.json.url as string;
  const expiresAt = new Date(Date.now() + RESCHEDULE_FEE_HOLD_MINUTES * 60_000).toISOString();

  await supabaseAdmin
    .from("consultations")
    .update({
      pending_reschedule_at: input.startIso,
      pending_reschedule_ends_at: input.endIso,
      pending_reschedule_payment_id: response.json.id as string,
      pending_reschedule_payment_url: paymentUrl,
      pending_reschedule_expires_at: expiresAt,
    } as never)
    .eq("id", input.row.id);

  await auditConsultation({
    consultationId: input.row.id,
    actorId: input.userId,
    actorRole: "student",
    action: "reschedule_fee_created",
    details: { startIso: input.startIso, amount: RESCHEDULE_FEE_BRL },
  });

  return {
    requiresPayment: true as const,
    paymentUrl,
    amount: RESCHEDULE_FEE_BRL,
    amountLabel: formatFee(),
    expiresAt,
  };
}

/** Webhook: taxa paga → aplica a remarcação pendente. */
export async function applyPaidReschedule(consultationId: string, paymentId: string) {
  const { auditConsultation } = await import("@/lib/consultations.server");
  const { data: row } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();

  if (!row) return { ok: false as const, error: "Consultoria não encontrada." };

  const startIso = (row as any).pending_reschedule_at as string | null;
  const endIso = (row as any).pending_reschedule_ends_at as string | null;

  if (!startIso || !endIso) {
    // Pagamento chegou depois do prazo: registramos crédito e avisamos o admin.
    await supabaseAdmin
      .from("consultations")
      .update({ reschedule_fee_paid_at: new Date().toISOString() } as never)
      .eq("id", consultationId);
    await auditConsultation({
      consultationId,
      action: "reschedule_fee_orphan",
      status: "warn",
      details: { paymentId },
    });
    return { ok: false as const, error: "Não havia remarcação pendente para este pagamento." };
  }

  const { isSlotFree } = await import("@/lib/consultations.server");
  if (!(await isSlotFree(startIso, endIso, row.id))) {
    await auditConsultation({
      consultationId,
      action: "reschedule_fee_slot_taken",
      status: "error",
      details: { paymentId, startIso },
    });
    return { ok: false as const, error: "O horário escolhido não está mais livre." };
  }

  const result = await applyConsultationReschedule(row, startIso, endIso, {
    actorRole: "system",
    paid: true,
    paymentId,
  });
  return { ok: true as const, ...result };
}
