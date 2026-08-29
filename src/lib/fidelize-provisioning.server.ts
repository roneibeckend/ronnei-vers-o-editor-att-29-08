// Provisionamento automático de contas na Fidelize após pagamento aprovado.
// Toda chamada é auditada em public.fidelize_provisioning_logs e em system_logs.

import { fidelizeRequest, resolveFidelizePath, getFidelizeConfig } from "./fidelize.server";
import { logSystemEvent } from "./system-log.server";
import { FIDELIZE_PLAN_CATALOG, fidelizePlanLabel, isFidelizePlan, type FidelizePlan } from "./fidelize-plans";
import { isFidelizeAlreadyExists } from "./fidelize-messages";


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
  const rawMessage = call.error || response?.message || response?.error || null;
  // Conta já existente na Fidelize não é falha: vinculamos a conta existente ao aluno.
  const alreadyExists =
    !(call.success && response?.success !== false) &&
    call.httpCode > 0 &&
    isFidelizeAlreadyExists(call.httpCode, `${rawMessage ?? ""} ${call.rawBody ?? ""}`);
  const ok = (call.success && response?.success !== false) || alreadyExists;
  const modules = normalizeModules(response, input.plan);

  const update = {
    tenant_id: response?.tenant_id ?? null,
    fidelize_user_id: response?.user_id ?? null,
    login_url: response?.login_url ?? null,
    slug: response?.slug ?? null,
    modules: modules as never,
    response_payload: (call.data ?? { raw: call.rawBody }) as never,
    status: ok ? "success" : "failed",
    error_message: ok ? null : rawMessage || "Falha no provisionamento da Fidelize.",
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

/**
 * Reenvia os dados de acesso da conta Fidelize do aluno.
 * Tenta o endpoint de reenvio da Fidelize e, em seguida, dispara o e-mail de acesso.
 * Toda tentativa fica auditada em system_logs (source: "fidelize").
 */
export async function resendFidelizeAccess(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, plan, tenant_id, login_url, modules, status, request_payload, response_payload, order_id")
    .eq("user_id", userId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return { success: false, message: "Não encontramos uma conta Fidelize ativa para o seu cadastro." };
  }

  const record = row as Record<string, any>;
  const request = (record["request_payload"] || {}) as Record<string, any>;
  const previous = (record["response_payload"] || {}) as Record<string, any>;
  const email = request["email"] as string | undefined;
  const name = (request["name"] as string) || "Aluno";
  const plan = record["plan"] as FidelizePlan;

  if (!email) {
    return { success: false, message: "Não encontramos o e-mail usado na criação da sua conta. Fale com o suporte." };
  }

  const config = await getFidelizeConfig();
  let remote: any = null;
  let remoteOk = false;

  if (config) {
    const call = await fidelizeRequest<any>(resolveFidelizePath(config.baseUrl, "/resend-access"), {
      method: "POST",
      config,
      body: { email, tenant_id: record["tenant_id"] ?? null, source: "ronnei" },
      context: { operation: "resend_access", userId, logId: record["id"] },
    });
    remote = (call.data || {}) as Record<string, any>;
    // 404/405 significam que a Fidelize não expõe esse endpoint — seguimos com o nosso e-mail.
    remoteOk = call.success || call.httpCode === 404 || call.httpCode === 405;
  }

  const loginUrl = remote?.login_url || record["login_url"] || previous["login_url"] || "";
  const modules = Array.isArray(record["modules"]) ? (record["modules"] as string[]) : [];

  try {
    const { triggerEmailOnce } = await import("./resend.server");
    await triggerEmailOnce({
      event: "fidelize_access",
      to: email,
      data: {
        name,
        plan: fidelizePlanLabel(plan),
        login: remote?.login || email,
        temporary_password: remote?.temporary_password || "Use sua senha atual ou a opção “Esqueci minha senha”.",
        login_url: loginUrl,
        modules: modules.join(", "),
      },
      idempotencyKey: `fidelize_access_resend_${record["id"]}_${Date.now()}`,
    });
  } catch (emailError) {
    await logSystemEvent({
      level: "error",
      source: "fidelize",
      message: "Falha ao reenviar o e-mail de acesso da Fidelize.",
      details: { logId: record["id"], error: String((emailError as Error)?.message ?? emailError) },
      userId,
    });
    return {
      success: false,
      message: "Não conseguimos enviar o e-mail agora. Tente novamente em alguns minutos.",
    };
  }

  await logSystemEvent({
    level: "info",
    source: "fidelize",
    message: `Reenvio de acesso Fidelize solicitado pelo aluno (${email})`,
    details: { logId: record["id"], remoteOk, tenantId: record["tenant_id"] ?? null },
    userId,
  });

  return {
    success: true,
    message: `Enviamos os dados de acesso para ${email}. Verifique também a caixa de spam.`,
    email,
  };
}
