import { supabase } from "@/integrations/supabase/client";

/**
 * Valida a sessão local contra o servidor.
 *
 * Importante para o PWA instalado: uma falha de rede (offline, 5xx, timeout)
 * NÃO deve derrubar o login. Só encerramos a sessão quando o servidor diz
 * explicitamente que o token é inválido/expirado/revogado.
 */
export type SessionCheck = "valid" | "invalid" | "unknown";

function isAuthRejection(error: unknown): boolean {
  const err = error as { status?: number; code?: string; message?: string } | null;
  if (!err) return false;

  const status = typeof err.status === "number" ? err.status : undefined;
  if (status === 401 || status === 403) return true;

  const code = (err.code || "").toLowerCase();
  if (
    code.includes("token") ||
    code.includes("session") ||
    code.includes("jwt") ||
    code === "user_not_found"
  ) {
    return true;
  }

  const message = (err.message || "").toLowerCase();
  if (/failed to fetch|network|timeout|load failed|offline/.test(message)) return false;

  return /invalid|expired|revoked|not\s*found|missing/.test(message) && /token|jwt|session|user/.test(message);
}

export async function checkSession(): Promise<SessionCheck> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return "invalid";

  try {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) return "valid";
    if (error && isAuthRejection(error)) return "invalid";
    // Rede indisponível ou erro transitório: mantém a sessão local.
    return "unknown";
  } catch {
    return "unknown";
  }
}
