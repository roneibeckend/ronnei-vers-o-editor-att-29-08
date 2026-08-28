// Entrega automática das gravações das consultorias (server-only).
//
// Fluxo: varre a pasta configurada do Google Drive, identifica a consultoria
// correspondente (nome do arquivo, evento do Calendar, aluno e horário),
// gera compartilhamento somente leitura, vincula ao agendamento, libera na
// área do aluno e envia o e-mail com a gravação + materiais.
//
// Tudo é registrado em public.consultation_recordings, com fila de
// reprocessamento automático quando o Google está indisponível.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { auditConsultation, completeConsultation, sendConsultationRecording } from "@/lib/consultations.server";

const MAX_ATTEMPTS = 8;
/** Janela em que uma gravação pode pertencer a uma reunião (Drive grava ao final). */
const MATCH_WINDOW_BEFORE_MS = 10 * 60_000; // gravação criada até 10min antes do fim
const MATCH_WINDOW_AFTER_MS = 8 * 3600_000; // ou até 8h depois

export type RecordingRow = {
  id: string;
  file_id: string;
  file_name: string;
  mime_type: string | null;
  web_view_link: string | null;
  drive_created_time: string | null;
  size_bytes: number | null;
  consultation_id: string | null;
  status: string;
  match_reason: string | null;
  error_message: string | null;
  attempts: number;
  next_attempt_at: string | null;
  shared_at: string | null;
  notified_at: string | null;
  created_at: string;
};

/* ------------------------------ Utilidades ------------------------------ */

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function backoffMinutes(attempts: number) {
  // 15min, 30min, 1h, 2h, 4h, 6h, 6h...
  const ladder = [15, 30, 60, 120, 240, 360];
  return ladder[Math.min(attempts, ladder.length - 1)] ?? 360;
}

async function scheduleRetry(row: { id: string; attempts: number }, message: string, status = "error") {
  const attempts = (row.attempts ?? 0) + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  await supabaseAdmin
    .from("consultation_recordings")
    .update({
      status: exhausted ? "failed" : status,
      attempts,
      error_message: message,
      next_attempt_at: exhausted
        ? null
        : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
    })
    .eq("id", row.id);
}

const isVideo = (mime: string | null | undefined) =>
  Boolean(mime && (mime.startsWith("video/") || mime === "application/vnd.google-apps.video"));

/* --------------------- 1. Descoberta de novos arquivos --------------------- */

async function discoverDriveFiles() {
  const { listFolderFiles } = await import("@/lib/google-drive.server");
  const files = await listFolderFiles(null, 100);
  let created = 0;

  for (const file of files) {
    if (!isVideo(file.mimeType)) continue;

    const { data: existing } = await supabaseAdmin
      .from("consultation_recordings")
      .select("id")
      .eq("file_id", file.id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("consultation_recordings")
        .update({
          file_name: file.name,
          mime_type: file.mimeType,
          web_view_link: file.webViewLink,
          drive_created_time: file.createdTime,
          size_bytes: file.size,
        })
        .eq("id", existing.id);
      continue;
    }

    const { error } = await supabaseAdmin.from("consultation_recordings").insert({
      file_id: file.id,
      file_name: file.name,
      mime_type: file.mimeType,
      web_view_link: file.webViewLink,
      drive_created_time: file.createdTime,
      size_bytes: file.size,
      status: "pending",
    });
    if (!error) created++;
  }

  return { scanned: files.length, created };
}

/* ------------------------- 2. Identificação (match) ------------------------- */

type Candidate = {
  id: string;
  user_id: string;
  product_title: string;
  client_name: string | null;
  client_email: string | null;
  scheduled_at: string;
  ends_at: string;
  status: string;
  google_event_id: string | null;
  meet_link: string | null;
  recording_url: string | null;
};

export async function matchRecording(row: RecordingRow): Promise<
  { ok: true; consultation: Candidate; reason: string } | { ok: false; reason: string }
> {
  const reference = row.drive_created_time ? +new Date(row.drive_created_time) : +new Date(row.created_at);
  const fileName = normalize(row.file_name);

  const { data } = await supabaseAdmin
    .from("consultations")
    .select(
      "id, user_id, product_title, client_name, client_email, scheduled_at, ends_at, status, google_event_id, meet_link, recording_url",
    )
    .in("status", ["scheduled", "completed", "no_show"])
    .gte("scheduled_at", new Date(reference - MATCH_WINDOW_AFTER_MS - 8 * 3600_000).toISOString())
    .lte("scheduled_at", new Date(reference + MATCH_WINDOW_BEFORE_MS).toISOString());

  const rows = (data ?? []) as Candidate[];
  if (!rows.length) return { ok: false, reason: "Nenhuma consultoria encontrada no período da gravação." };

  const scored = rows.map((c) => {
    let score = 0;
    const reasons: string[] = [];

    if (c.google_event_id && fileName.includes(normalize(c.google_event_id))) {
      score += 6;
      reasons.push("evento do Google Calendar");
    }
    if (fileName.includes(normalize(c.id).slice(0, 8))) {
      score += 6;
      reasons.push("identificador da consultoria");
    }

    const nameParts = normalize(c.client_name || "").split(" ").filter((p) => p.length >= 3);
    const matchedParts = nameParts.filter((p) => fileName.includes(p));
    if (nameParts.length && matchedParts.length) {
      score += matchedParts.length >= 2 ? 4 : 2;
      reasons.push("nome do aluno");
    }
    if (fileName.includes("consultoria")) score += 1;

    const endsAt = +new Date(c.ends_at);
    const delta = reference - endsAt;
    const inWindow = delta >= -MATCH_WINDOW_BEFORE_MS && delta <= MATCH_WINDOW_AFTER_MS;
    if (inWindow) {
      score += 3;
      reasons.push("horário da reunião");
    }

    return { candidate: c, score, distance: Math.abs(delta), inWindow, reasons };
  });

  const viable = scored
    .filter((s) => s.inWindow || s.score >= 6)
    .sort((a, b) => b.score - a.score || a.distance - b.distance);

  if (!viable.length) return { ok: false, reason: "Nenhuma reunião compatível com o horário da gravação." };

  const best = viable[0]!;
  const runnerUp = viable[1];

  if (best.score < 3) return { ok: false, reason: "Confiança insuficiente para identificar a consultoria." };
  if (runnerUp && runnerUp.score === best.score && Math.abs(runnerUp.distance - best.distance) < 10 * 60_000) {
    return { ok: false, reason: "Duas reuniões compatíveis no mesmo horário — identificação ambígua." };
  }
  if (best.candidate.recording_url) {
    return { ok: false, reason: "A consultoria identificada já possui outra gravação vinculada." };
  }

  return { ok: true, consultation: best.candidate, reason: `Identificada por ${best.reasons.join(", ")}.` };
}

/* ---------------- 3-6. Compartilhar, vincular, liberar, avisar ---------------- */

async function deliverRecording(row: RecordingRow, consultation: Candidate, reason: string) {
  const { shareFileReadonly } = await import("@/lib/google-drive.server");

  // Compartilhamento seguro somente leitura
  const shared = await shareFileReadonly(row.file_id);
  const url = shared.webViewLink || row.web_view_link || `https://drive.google.com/file/d/${row.file_id}/view`;

  // Vincula ao agendamento e libera na área do aluno
  const { data: updated, error } = await supabaseAdmin
    .from("consultations")
    .update({ recording_url: url, recording_file_id: row.file_id })
    .eq("id", consultation.id)
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao vincular a gravação: ${error.message}`);

  // Garante conclusão + materiais liberados (sem duplicar e-mail de conclusão)
  if (updated.status === "scheduled") {
    await completeConsultation(consultation.id, { actorRole: "system", notify: false }).catch(() => undefined);
  }

  const { data: fresh } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("id", consultation.id)
    .maybeSingle();

  const target = (fresh ?? updated) as Record<string, unknown>;
  const materials = Array.isArray(target["materials"])
    ? (target["materials"] as { title: string; url: string }[])
    : [];

  // E-mail automático (idempotente por consultoria)
  let notifiedAt: string | null = null;
  if (!target["recording_sent_at"]) {
    await sendConsultationRecording({
      ...(target as never),
      recording_url: url,
      materials,
    } as never);
    notifiedAt = new Date().toISOString();
  }

  await supabaseAdmin
    .from("consultation_recordings")
    .update({
      consultation_id: consultation.id,
      status: "linked",
      match_reason: reason,
      error_message: null,
      next_attempt_at: null,
      shared_at: new Date().toISOString(),
      notified_at: notifiedAt ?? row.notified_at,
      web_view_link: url,
    })
    .eq("id", row.id);

  await auditConsultation({
    consultationId: consultation.id,
    action: "recording_auto_linked",
    status: "ok",
    details: { fileId: row.file_id, fileName: row.file_name, reason, notified: Boolean(notifiedAt), url },
  });

  return url;
}

/* ---------------------- Rotina automática (cron 1h) ---------------------- */

export async function syncConsultationRecordings(options: { fileId?: string } = {}) {
  const nowIso = new Date().toISOString();
  let scanned = 0;
  let discovered = 0;
  let driveError: string | null = null;

  if (!options.fileId) {
    try {
      const result = await discoverDriveFiles();
      scanned = result.scanned;
      discovered = result.created;
    } catch (err) {
      driveError = (err as Error)?.message ?? "Falha ao acessar o Google Drive";
      await auditConsultation({
        action: "recordings_drive_scan",
        status: "error",
        details: { error: driveError },
      });
      // Google indisponível: a fila continua sendo processada na próxima rodada.
    }
  }

  // Fila de processamento/reprocessamento
  let query = supabaseAdmin
    .from("consultation_recordings")
    .select("*")
    .in("status", ["pending", "unmatched", "error"])
    .order("drive_created_time", { ascending: true })
    .limit(25);

  if (options.fileId) query = supabaseAdmin.from("consultation_recordings").select("*").eq("file_id", options.fileId);

  const { data: queue } = await query;

  let linked = 0;
  let unmatched = 0;
  let failed = 0;

  for (const row of (queue ?? []) as RecordingRow[]) {
    if (!options.fileId && row.next_attempt_at && row.next_attempt_at > nowIso) continue;

    try {
      const match = await matchRecording(row);
      if (!match.ok) {
        unmatched++;
        await scheduleRetry(row, match.reason, "unmatched");
        await auditConsultation({
          action: "recording_unmatched",
          status: "warn",
          details: { fileId: row.file_id, fileName: row.file_name, reason: match.reason },
        });
        continue;
      }

      await deliverRecording(row, match.consultation, match.reason);
      linked++;
    } catch (err) {
      failed++;
      const message = (err as Error)?.message ?? "Erro desconhecido";
      await scheduleRetry(row, message, "error");
      await auditConsultation({
        consultationId: row.consultation_id,
        action: "recording_delivery_failed",
        status: "error",
        details: { fileId: row.file_id, error: message },
      });
    }
  }

  return {
    scanned,
    discovered,
    queued: queue?.length ?? 0,
    linked,
    unmatched,
    failed,
    driveError,
  };
}
