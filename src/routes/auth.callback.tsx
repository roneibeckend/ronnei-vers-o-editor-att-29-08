import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, BadgeCheck, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { completeAuthFromUrl } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirmando seu acesso — Espetinho na Veia" },
      { name: "description", content: "Validando o link de confirmação da sua conta Espetinho na Veia." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await completeAuthFromUrl();
      if (cancelled) return;
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setDone(true);
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate({ to: result.redirectTo, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6">
      <section className="glass w-full max-w-md space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center">
        {error ? (
          <>
            <ShieldAlert className="mx-auto h-8 w-8 text-yellow-500" />
            <h1 className="text-lg font-bold text-white">Não foi possível confirmar</h1>
            <p className="text-xs leading-relaxed text-white/60">{error}</p>
            <Link
              to="/login"
              className="btn-fire inline-flex min-h-[44px] w-full items-center justify-center rounded-xl font-bold"
            >
              Ir para o login
            </Link>
          </>
        ) : done ? (
          <>
            <BadgeCheck className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="text-lg font-bold text-white">E-mail confirmado</h1>
            <p className="text-xs text-white/60">Levando você para a área de membros…</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-fire" />
            <h1 className="text-lg font-bold text-white">Confirmando seu acesso…</h1>
            <p className="text-xs text-white/60">Isso leva apenas alguns segundos.</p>
          </>
        )}
      </section>
    </main>
  );
}
