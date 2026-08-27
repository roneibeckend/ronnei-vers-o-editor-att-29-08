import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword } from "@/lib/password-validation";
import { completeAuthFromUrl } from "@/lib/auth-callback";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Espetinho na Veia" },
      { name: "description", content: "Crie uma nova senha para acessar sua área de membros do Espetinho na Veia." },
      { property: "og:title", content: "Redefinir senha — Espetinho na Veia" },
      { property: "og:description", content: "Defina uma nova senha e recupere o acesso à sua área de membros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setReady(true);
        return;
      }
      const result = await completeAuthFromUrl();
      if (cancelled) return;
      if (result.status === "error") setError(result.message);
      else setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const validation = validatePassword(password);
    if (!validation.isValid) {
      toast.error("Senha inválida", { description: validation.message });
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success("Senha atualizada!", { description: "Use a nova senha para entrar." });
      navigate({ to: "/inicio", replace: true });
    } catch (err: any) {
      toast.error("Não foi possível atualizar a senha", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 safe-top safe-bottom">
      <section className="glass w-full max-w-md space-y-5 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
        {error ? (
          <div className="space-y-4 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-yellow-500" />
            <h1 className="text-lg font-bold text-white">Link inválido ou expirado</h1>
            <p className="text-xs leading-relaxed text-white/60">{error}</p>
            <Link to="/login" className="btn-fire inline-flex min-h-[44px] w-full items-center justify-center rounded-xl font-bold">
              Voltar ao login
            </Link>
          </div>
        ) : !ready ? (
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-fire" />
            <p className="text-xs text-white/60">Validando seu link de recuperação…</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" />
              <h1 className="font-display text-xl font-bold text-white">Criar nova senha</h1>
              <p className="text-xs text-white/60">Escolha uma senha forte para proteger sua conta.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm">Nova senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm">Confirmar nova senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <button type="submit" disabled={loading} className="btn-fire w-full">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
