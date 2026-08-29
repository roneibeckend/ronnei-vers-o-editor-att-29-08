// Consulta o provisionamento real do tenant na Fidelize para obter os
// recursos (plan_modules) efetivamente incluídos no plano contratado.

import { fidelizeRequest, resolveFidelizePath, getFidelizeConfig } from "./fidelize.server";

export type FidelizeTenantModules = {
  success: boolean;
  planModules: string[];
  /** Inclui liberações manuais extras (não descreve o plano). */
  extraModules: string[];
  plan: string | null;
  error: string | null;
};

export async function getFidelizeTenantModules(tenantId: string): Promise<FidelizeTenantModules> {
  const empty = { planModules: [], extraModules: [], plan: null };

  const config = await getFidelizeConfig();
  if (!config) {
    return { success: false, ...empty, error: "Integração Fidelize não configurada." };
  }

  const path = resolveFidelizePath(config.baseUrl, `/provisioning/${encodeURIComponent(tenantId)}`);
  const call = await fidelizeRequest<any>(path, {
    method: "GET",
    config,
    context: { operation: "tenant_modules", tenantId },
  });

  if (!call.success) {
    return { success: false, ...empty, error: call.error || `HTTP ${call.httpCode}` };
  }

  const body = (call.data || {}) as Record<string, any>;
  const payload = (body["data"] && typeof body["data"] === "object" ? body["data"] : body) as Record<string, any>;

  const toKeys = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === "string" ? item : item?.key || item?.slug || item?.name || ""))
          .filter((item): item is string => Boolean(item))
      : [];

  const planModules = toKeys(payload["plan_modules"]);
  const allModules = toKeys(payload["modules"]);
  const extraModules = allModules.filter((m) => !planModules.includes(m));

  return {
    success: true,
    planModules,
    extraModules,
    plan: (payload["plan"] as string) ?? null,
    error: null,
  };
}
