// Provisionamento automático de contas na Fidelize após pagamento aprovado.
// Toda chamada é auditada em public.fidelize_provisioning_logs e em system_logs.

import { fidelizeRequest, resolveFidelizePath, getFidelizeConfig } from "./fidelize.server";
import { logSystemEvent } from "./system-log.server";
import { FIDELIZE_PLAN_CATALOG, fidelizePlanLabel, isFidelizePlan, type FidelizePlan } from "./fidelize-plans";

export type ProvisionInput = {
  orderId: string;
  userId: string;
  plan: FidelizePlan;
  name: string;
  email: string;
  phone?: string | null;
  /** Conta de teste criada pelo admin (não dispara e-mail ao aluno). */
  isTest?: boolean;
};

export type ProvisionResult = {
  success: boolean;
  status: "success" | "failed" | "skipped";
  tenantId?: string | null;
  loginUrl?: string | null;
  error?: string | null;
  logId?: string | null;
  login?: string | null;
  temporaryPassword?: string | null;
  modules?: string[];
  durationMs?: number;
};

function normalizeModules(response: any, plan: FidelizePlan): string[] {
  const raw = response?.modules;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((m: any) => (typeof m === "string" ? m : m?.name || m?.label || String(m)));
  }
  return FIDELIZE_PLAN_CATALOG[plan].modules;
}

/**
 * Cria (ou recupera) a conta do aluno na Fidelize e dispara o e-mail de acesso.
 * Idempotente por `orderId` (id do pagamento).
 */
export async function provisionFidelizeAccount(input: ProvisionInput): Promise<ProvisionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!isFidelizePlan(input.plan)) {
    return { success: false, status: "failed", error: `Plano Fidelize inválido: ${input.plan}` };
  }

  // 1. Idempotência: já provisionado para este pedido?
  const { data: existing } = await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, status")
    .eq("order_id", input.orderId)
    .maybeSingle();

  if (existing && (existing as any).status === "success") {
    return { success: true, status: "skipped" };
  }

  const config = await getFidelizeConfig();
  if (!config) {
    return { success: false, status: "failed", error: "Integração Fidelize não configurada." };
  }
  const provisionPath = resolveFidelizePath(config.baseUrl, "/provision-account");

  const requestPayload = {
    name: input.name,
    email: input.email,
    phone: input.phone || "",
    plan: input.plan,
    source: "ronnei",
  };

  // 2. Registro inicial (auditoria mesmo em caso de falha total).
  const logRow = {
    order_id: input.orderId,
    user_id: input.userId,
    plan: input.plan,
    request_payload: requestPayload as never,
    status: "pending",
    is_test: Boolean(input.isTest),
    endpoint: provisionPath,
  };

  let logId: string | null = (existing as any)?.id ?? null;
  if (logId) {
    await supabaseAdmin
      .from("fidelize_provisioning_logs")
      .update({ ...logRow, updated_at: new Date().toISOString() } as never)
      .eq("id", logId);
  } else {
    const { data: created } = await supabaseAdmin
      .from("fidelize_provisioning_logs")
      .insert(logRow as never)
      .select("id")
      .maybeSingle();
    logId = (created as any)?.id ?? null;
  }

  // 3. Chamada ao endpoint de provisionamento.
  const call = await fidelizeRequest<any>(provisionPath, {
    method: "POST",
    body: requestPayload,
    config,
    context: { operation: "provision_account", orderId: input.orderId, userId: input.userId, isTest: Boolean(input.isTest) },
  });

  const response = (call.data || {}) as Record<string, any>;
  const ok = call.success && response?.success !== false;
  const modules = normalizeModules(response, input.plan);

  const update = {
    tenant_id: response?.tenant_id ?? null,
    fidelize_user_id: response?.user_id ?? null,
    login_url: response?.login_url ?? null,
    slug: response?.slug ?? null,
    modules: modules as never,
    response_payload: (call.data ?? { raw: call.rawBody }) as never,
    status: ok ? "success" : "failed",
    error_message: ok ? null : call.error || response?.message || "Falha no provisionamento da Fidelize.",
    duration_ms: call.durationMs,
    endpoint: provisionPath,
    updated_at: new Date().toISOString(),
  };

  if (logId) {
    await supabaseAdmin.from("fidelize_provisioning_logs").update(update as never).eq("id", logId);
  }

  await logSystemEvent({
    level: ok ? "info" : "error",
    source: "fidelize",
    message: ok
      ? `Conta Fidelize provisionada (${input.plan}) para ${input.email}`
      : `Falha ao provisionar conta Fidelize (${input.plan}) para ${input.email}`,
    details: {
      orderId: input.orderId,
      plan: input.plan,
      httpCode: call.httpCode,
      durationMs: call.durationMs,
      tenantId: update.tenant_id,
      error: update.error_message,
    },
    userId: input.userId,
  });

  if (!ok) {
    return { success: false, status: "failed", error: update.error_message };
  }

  // 4. E-mail com os dados de acesso (contas de teste não enviam e-mail).
  if (input.isTest) {
    return {
      success: true,
      status: "success",
      tenantId: update.tenant_id,
      loginUrl: update.login_url,
      logId,
      login: response?.login || input.email,
      temporaryPassword: response?.temporary_password || null,
      modules,
      durationMs: call.durationMs,
    };
  }

  try {
    const { triggerEmailOnce } = await import("./resend.server");
    await triggerEmailOnce({
      event: "fidelize_access",
      to: input.email,
      data: {
        name: input.name,
        plan: fidelizePlanLabel(input.plan),
        login: response?.login || input.email,
        temporary_password: response?.temporary_password || "",
        login_url: response?.login_url || "",
        modules: modules.join(", "),
      },
      idempotencyKey: `fidelize_access_${input.orderId}`,
    });
  } catch (emailError) {
    await logSystemEvent({
      level: "warning",
      source: "fidelize",
      message: "Conta Fidelize criada, mas o e-mail de acesso falhou.",
      details: { orderId: input.orderId, error: String((emailError as Error)?.message ?? emailError) },
      userId: input.userId,
    });
  }

  return {
    success: true,
    status: "success",
    tenantId: update.tenant_id,
    loginUrl: update.login_url,
    logId,
    modules,
    durationMs: call.durationMs,
  };
}

/** Remove uma conta de teste criada pelo painel (Fidelize + registro local). */
export async function deleteFidelizeTestAccount(logId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, is_test, tenant_id, fidelize_user_id, request_payload")
    .eq("id", logId)
    .maybeSingle();

  if (!row) return { success: false, error: "Registro não encontrado." };
  if (!(row as any).is_test) return { success: false, error: "Apenas contas de teste podem ser removidas." };

  const config = await getFidelizeConfig();
  let remoteMessage = "Conta removida apenas do histórico local.";

  if (config) {
    const identifier = (row as any).fidelize_user_id || (row as any).tenant_id;
    const call = await fidelizeRequest(resolveFidelizePath(config.baseUrl, "/provision-account"), {
      method: "DELETE",
      config,
      body: {
        tenant_id: (row as any).tenant_id ?? null,
        user_id: (row as any).fidelize_user_id ?? null,
        email: ((row as any).request_payload as any)?.email ?? null,
        source: "ronnei",
      },
      context: { operation: "delete_test_account", logId, identifier },
    });
    remoteMessage = call.success
      ? "Conta de teste removida na Fidelize."
      : `Fidelize não confirmou a exclusão (HTTP ${call.httpCode}). Registro local removido.`;
  }

  await supabaseAdmin.from("fidelize_provisioning_logs").delete().eq("id", logId);

  return { success: true, message: remoteMessage };
}
