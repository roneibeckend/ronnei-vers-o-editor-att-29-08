import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isEmailCapacityError,
  isEmailSendingDisabledError,
  isEmailSendingEnabled,
  triggerEmailEvent,
} from "@/lib/resend.server";

const BATCH_SIZE = 20;
const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 20, 60];

type ClaimedRecipient = {
  recipient_id: string;
  campaign_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  attempts: number;
  event: string;
  content_type: "course" | "ebook";
  content_id: string;
  campaign_title: string;
  payload: Record<string, any> | null;
};

const db = supabaseAdmin as any;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function countRecipients(campaignId: string, status: string, retryableOnly = false) {
  let query = db
    .from("content_email_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", status);

  if (retryableOnly) query = query.lt("attempts", MAX_ATTEMPTS);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function refreshCampaignSummary(campaignId: string) {
  const { data: campaign, error: campaignError } = await db
    .from("content_email_campaigns")
    .select("id, content_type, content_id, title, created_by, total_recipients")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) return null;

  const [sent, failed, queued, processing, retryableFailed] = await Promise.all([
    countRecipients(campaignId, "sent"),
    countRecipients(campaignId, "failed"),
    countRecipients(campaignId, "queued"),
    countRecipients(campaignId, "processing"),
    countRecipients(campaignId, "failed", true),
  ]);

  const hasPendingWork = queued > 0 || processing > 0 || retryableFailed > 0;
  const finalStatus = hasPendingWork
    ? "processing"
    : failed > 0
      ? "completed_with_errors"
      : "completed";

  const completedAt = hasPendingWork ? null : new Date().toISOString();

  const { data: lastFailed } = failed
    ? await db
        .from("content_email_recipients")
        .select("last_error")
        .eq("campaign_id", campaignId)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  await db
    .from("content_email_campaigns")
    .update({
      status: finalStatus,
      sent_count: sent,
      failed_count: failed,
      completed_at: completedAt,
      last_error: lastFailed?.last_error || null,
    })
    .eq("id", campaignId);

  if (!hasPendingWork) {
    await db.from("content_notifications").upsert(
      {
        content_type: campaign.content_type,
        content_id: campaign.content_id,
        title: campaign.title,
        recipients_count: Number(campaign.total_recipients) || 0,
        sent_count: sent,
        created_by: campaign.created_by,
      },
      { onConflict: "content_type,content_id" },
    );
  }

  return { campaignId, status: finalStatus, sent, failed, queued, processing, retryableFailed };
}

async function processRecipient(row: ClaimedRecipient) {
  const currentAttempts = Number(row.attempts || 0);
  const nextAttempts = currentAttempts + 1;
  const payload = row.payload || {};

  try {
    const result: any = await triggerEmailEvent({
      event: row.event,
      to: row.email,
      data: {
        name: row.name || "Aluno",
        title: row.campaign_title,
        description: payload.description || undefined,
        link:
          payload.link ||
          (row.content_type === "ebook"
            ? `https://ronneinaveia.com.br/app/ebooks/${row.content_id}`
            : `https://ronneinaveia.com.br/app/cursos/${row.content_id}`),
      },
      idempotencyKey: `content_campaign_${row.campaign_id}_${row.recipient_id}`,
      _retry: true,
    });

    const { error } = await db
      .from("content_email_recipients")
      .update({
        status: "sent",
        attempts: nextAttempts,
        provider_message_id: result?.id || null,
        last_error: null,
        next_retry_at: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", row.recipient_id);

    if (error) throw new Error(error.message);

    return {
      sent: true,
      failed: false,
      capacityLimited: false,
      sendingDisabled: false,
    };
  } catch (error: any) {
    const sendingDisabled =
      isEmailSendingDisabledError(error);

    if (sendingDisabled) {
      await db
        .from("content_email_recipients")
        .update({
          status: "queued",
          attempts: currentAttempts,
          last_error:
            error?.message ||
            "Envios de e-mail desativados.",
          next_retry_at: null,
        })
        .eq("id", row.recipient_id);

      return {
        sent: false,
        failed: false,
        capacityLimited: false,
        sendingDisabled: true,
      };
    }

    const capacityLimited = isEmailCapacityError(error);
    const effectiveAttempts = capacityLimited ? currentAttempts : nextAttempts;
    const exhausted = !capacityLimited && effectiveAttempts >= MAX_ATTEMPTS;
    const backoffMinutes = RETRY_BACKOFF_MINUTES[
      Math.min(Math.max(effectiveAttempts - 1, 0), RETRY_BACKOFF_MINUTES.length - 1)
    ];

    const nextRetryAt = exhausted
      ? null
      : new Date(
          Date.now() +
            (capacityLimited ? 12 * 60 * 60_000 : backoffMinutes * 60_000),
        ).toISOString();

    await db
      .from("content_email_recipients")
      .update({
        status: "failed",
        attempts: effectiveAttempts,
        last_error: error?.message || "Falha desconhecida no envio.",
        next_retry_at: nextRetryAt,
      })
      .eq("id", row.recipient_id);

    return {
      sent: false,
      failed: true,
      capacityLimited,
      sendingDisabled: false,
    };
  }
}

export async function processContentEmailCampaignBatch(limit = BATCH_SIZE) {
  if (!(await isEmailSendingEnabled())) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      capacityLimited: false,
      sendingDisabled: true,
      campaignId: null,
    };
  }

  const { data, error } = await db.rpc("claim_content_email_recipients", {
    p_limit: limit,
  });

  if (error) throw new Error(error.message);

  const claimed = (data || []) as ClaimedRecipient[];

  if (claimed.length === 0) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      capacityLimited: false,
      sendingDisabled: false,
      campaignId: null,
    };
  }

  const campaignId = claimed[0].campaign_id;
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let capacityLimited = false;
  let sendingDisabled = false;

  for (let index = 0; index < claimed.length; index += CONCURRENCY) {
    const group = claimed.slice(index, index + CONCURRENCY);
    const results = await Promise.all(group.map(processRecipient));

    processed += group.length;
    sent += results.filter((r) => r.sent).length;
    failed += results.filter((r) => r.failed).length;

    if (results.some((r) => r.sendingDisabled)) {
      sendingDisabled = true;

      const remaining =
        claimed.slice(index + group.length);

      if (remaining.length > 0) {
        await db
          .from("content_email_recipients")
          .update({
            status: "queued",
            next_retry_at: null,
          })
          .in(
            "id",
            remaining.map(
              (item) => item.recipient_id,
            ),
          )
          .eq("status", "processing");
      }

      await db
        .from("content_email_campaigns")
        .update({
          last_error:
            "Envios de e-mail desativados. Campanha aguardando reativação.",
        })
        .eq("id", campaignId);

      break;
    }

    if (results.some((r) => r.capacityLimited)) {
      capacityLimited = true;
      const remaining = claimed.slice(index + group.length);

      if (remaining.length > 0) {
        await db
          .from("content_email_recipients")
          .update({ status: "queued", next_retry_at: null })
          .in("id", remaining.map((item) => item.recipient_id))
          .eq("status", "processing");
      }

      await db
        .from("content_email_campaigns")
        .update({
          next_run_at: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
          last_error:
            "Capacidade/quota do provedor atingida. Campanha pausada automaticamente por 12 horas.",
        })
        .eq("id", campaignId);

      break;
    }

    if (index + group.length < claimed.length) await sleep(250);
  }

  const summary = await refreshCampaignSummary(campaignId);

  return {
    processed,
    sent,
    failed,
    capacityLimited,
    sendingDisabled,
    campaignId,
    summary,
  };
}
