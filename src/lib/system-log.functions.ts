import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clientLogSchema = z.object({
  level: z.enum(["error", "warning", "info", "debug"]).default("error"),
  source: z.string().max(80).default("client"),
  message: z.string().min(1).max(2000),
  details: z.record(z.string(), z.unknown()).optional(),
  route: z.string().max(300).optional(),
});

// Limitador simples por IP (best-effort) para evitar inundação de logs por visitantes.
const logHits = new Map<string, { count: number; resetAt: number }>();
function allowLog(ip: string) {
  const now = Date.now();
  const entry = logHits.get(ip);
  if (!entry || now > entry.resetAt) {
    logHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}

/** Registra eventos/erros do navegador na tabela de logs. */
export const recordClientLog = createServerFn({ method: "POST" })
  .validator((data: unknown) => clientLogSchema.parse(data))
  .handler(async ({ data }) => {

    const { getRequest } = await import("@tanstack/react-start/server");
    const { logSystemEvent } = await import("./system-log.server");

    let userAgent: string | null = null;
    let ip: string | null = null;
    try {
      const req = getRequest();
      userAgent = req.headers.get("user-agent");
      ip =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
    } catch {
      /* noop */
    }

    await logSystemEvent({
      level: data.level,
      source: data.source,
      message: data.message,
      details: { ...(data.details ?? {}), route: data.route ?? null },
      userAgent,
      ipAddress: ip,
    });

    return { success: true };
  });

/** Limpa o histórico de logs (somente admin). */
export const clearSystemLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (!isAdmin) throw new Error("Acesso negado: apenas administradores.");

    const { error } = await supabaseAdmin
      .from("system_logs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) throw new Error(error.message);

    return { success: true };
  });
