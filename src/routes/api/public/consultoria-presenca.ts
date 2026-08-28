import { createFileRoute } from "@tanstack/react-router";

/**
 * Confirmação de presença em 1 clique (link enviado por e-mail, sem login).
 * O token é um HMAC do id da consultoria — não expõe nem aceita dados do aluno.
 */

function page(title: string, message: string, ok: boolean) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/><title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0f10;color:#fafafa;
font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.card{max-width:420px;text-align:center;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px}
h1{font-size:20px;margin:0 0 12px}p{color:#a1a1aa;line-height:1.5;margin:0 0 24px}
a{display:inline-block;background:${ok ? "#f97316" : "#3f3f46"};color:#fff;text-decoration:none;
padding:12px 20px;border-radius:10px;font-weight:600}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p>
<a href="https://ronneinaveia.com.br/app/minhas-consultorias">Abrir minhas consultorias</a>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/public/consultoria-presenca")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("c");
        const token = url.searchParams.get("t");

        if (!id || !token) return page("Link inválido", "O link de confirmação está incompleto.", false);

        const { verifyAttendanceToken, confirmAttendance } = await import(
          "@/lib/consultation-attendance.server"
        );

        if (!verifyAttendanceToken(id, token)) {
          return page("Link inválido", "Este link de confirmação expirou ou não é válido.", false);
        }

        const result = await confirmAttendance(id, "student");
        if (!result.ok) {
          return page("Não foi possível confirmar", result.error, false);
        }

        return page(
          result.alreadyConfirmed ? "Presença já confirmada ✅" : "Presença confirmada ✅",
          "Obrigado! O Ronnei já está preparando o seu encontro. Nos vemos no horário marcado.",
          true,
        );
      },
    },
  },
});
