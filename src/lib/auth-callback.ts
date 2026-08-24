import { supabase } from "@/integrations/supabase/client";

const PUBLISHED_ORIGIN = "https://sizzle-profit-hub.lovable.app";

/**
 * Origem pública usada nos links enviados por e-mail (confirmação, recuperação).
 * Em desenvolvimento local o Supabase rejeitaria `localhost`, então usamos a URL publicada.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return PUBLISHED_ORIGIN;
  const { origin, hostname } = window.location;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname)) return PUBLISHED_ORIGIN;
  return origin;
}

/** URL de retorno dos links de e-mail do Supabase Auth. */
export function authCallbackUrl(redirectTo?: string): string {
  const base = `${publicOrigin()}/auth/callback`;
  return redirectTo ? `${base}?redirectTo=${encodeURIComponent(redirectTo)}` : base;
}

export type AuthCallbackResult =
  | { status: "success"; redirectTo: string }
  | { status: "error"; message: string };

function readParams(): URLSearchParams {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  hash.forEach((value, key) => {
    if (!search.has(key)) search.set(key, value);
  });
  return search;
}

function safePath(value: string | null): string {
  if (!value) return "/app";
  // Somente caminhos internos — evita open redirect.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

/**
 * Conclui o fluxo de autenticação a partir da URL atual.
 * Suporta os três formatos que o Supabase pode entregar:
 *  - `#access_token=...&refresh_token=...` (verify + redirect clássico)
 *  - `?code=...` (PKCE)
 *  - `?token_hash=...&type=signup|recovery|email_change|magiclink` (link de verificação novo)
 */
export async function completeAuthFromUrl(): Promise<AuthCallbackResult> {
  const params = readParams();
  const redirectTo = safePath(params.get("redirectTo"));

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) {
    return { status: "error", message: decodeURIComponent(errorDescription.replace(/\+/g, " ")) };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const code = params.get("code");
  const tokenHash = params.get("token_hash") ?? params.get("token");
  const type = params.get("type");

  try {
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });
      if (error) throw error;
    }
  } catch (err: any) {
    return { status: "error", message: err?.message ?? "Não foi possível validar o link de confirmação." };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return {
      status: "error",
      message:
        "O link foi aberto, mas nenhuma sessão foi criada. Ele pode ter expirado ou já ter sido usado. Faça login normalmente.",
    };
  }

  // Limpa tokens da barra de endereço.
  try {
    window.history.replaceState({}, "", window.location.pathname);
  } catch {
    /* ignora */
  }

  return { status: "success", redirectTo };
}
