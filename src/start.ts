import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Evita inundar system_logs quando o mesmo erro se repete em loop (ex.: polling).
const recentErrors = new Map<string, number>();
const ERROR_LOG_THROTTLE_MS = 60_000;

function shouldLogError(error: unknown): boolean {
  const key = String(
    (error as { stack?: string } | null)?.stack ?? (error as { message?: string } | null)?.message ?? error,
  ).slice(0, 300);
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last && now - last < ERROR_LOG_THROTTLE_MS) return false;
  recentErrors.set(key, now);
  if (recentErrors.size > 50) {
    for (const [k, t] of recentErrors) {
      if (now - t > ERROR_LOG_THROTTLE_MS) recentErrors.delete(k);
    }
  }
  return true;
}

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    if (shouldLogError(error)) {
      try {
        const { logSystemError } = await import("./lib/system-log.server");
        await logSystemError("server", "Erro não tratado no servidor", error);
      } catch {
        /* logging nunca quebra a resposta */
      }
    }

    const acceptsJson = request.headers.get("accept")?.includes("application/json");
    const isServerFn = request.headers.get("x-tsr-server-fn") ||
                       (request.url.includes("/__server") || request.url.includes("/_server"));

    if (acceptsJson || isServerFn) {
      const message = (error as { message?: string })?.message ?? "Erro no servidor";
      return new Response(JSON.stringify({ error: message, stack: undefined }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
