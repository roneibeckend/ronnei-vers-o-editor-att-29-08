import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck, ShieldAlert, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword } from "@/lib/password-validation";
import { completeAuthFromUrl } from "@/lib/auth-callback";

const LAST_RESET_EMAIL_KEY = "last_reset_email";

type ResendStatus = "idle" | "loading" | "success" | "error";

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
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendCount, setResendCount] = useState(0);

  // Pré-preenche o e-mail usado no envio anterior (login ou outras telas).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_RESET_EMAIL_KEY);
      if (saved) setResendEmail(saved);
    } catch {
      /* localStorage pode estar indisível */
    }
  }, []);

  const validateEmail = (value: string) => {
    if (!value.trim()) return "Informe o e-mail da sua conta.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Informe um e-mail válido.";
    return null;
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resendStatus === "loading") return;

    const validationError = validateEmail(resendEmail);
    if (validationError) {
      setResendStatus("error");
      setResendError(validationError);
      return;
    }

    setResendStatus("loading");
    setResendError(null);

    try {
      const email = resendEmail.trim();
      try {
        localStorage.setItem(LAST_RESET_EMAIL_KEY, email);
      } catch {
        /* ignora */
      }

      const { publicOrigin } = await import("@/lib/auth-callback");
      const { sendPasswordResetEmail } = await import("@/lib/auth-recovery.functions");
      const result = await sendPasswordResetEmail({ data: { email, origin: publicOrigin() } });

      if (!result.ok) {
        // Erros de Resend/Supabase: domínio não verificado, chave inválida, rate limit, etc.
        setResendStatus("error");
        setResendError(
          result.error ||
            "Não foi possível enviar o e-mail agora. Verifique se o e-mail está correto ou tente novamente em alguns instantes."
        );
        return;
      }

      setResendStatus("success");
      setResendCount((c) => c + 1);
    } catch (err: any) {
      setResendStatus("error");
      setResendError(err?.message || "Erro inesperado ao enviar o e-mail. Tente novamente.");
    }
  };

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

  const openResendFromForm = () => {
    setResendError(null);
    setResendStatus(resendEmail.trim() ? "idle" : "idle");
    setError("Solicite um novo link de redefinição informando seu e-mail.");
  };

  const ResendSuccessBlock = () => (
    <div className="space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold text-white">E-mail reenviado!</h2>
        <p className="text-sm leading-relaxed text-white/80">
          Enviamos um novo link de redefinição para <strong className="text-white">{resendEmail}</strong>.
        </p>
      </div>
      <ul className="space-y-2 text-left text-xs text-white/70">
        <li className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          Verifique sua caixa de entrada — o e-mail pode levar alguns minutos para chegar.
        </li>
        <li className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            Não esqueça de olhar a pasta <strong className="text-white">Spam/Lixo eletrônico</strong>; às vezes o e-mail é filtrado por engano.
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          O link é válido por <strong className="text-white">1 hora</strong> e só pode ser usado uma vez.
        </li>
      </ul>
      <button
        type="button"
        onClick={() => {
          setResendStatus("idle");
          setResendError(null);
        }}
        className="text-xs text-white/60 underline hover:text-white"
      >
        Reenviar para outro e-mail
      </button>
    </div>
  );

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 safe-top safe-bottom">
      <section className="glass w-full max-w-md space-y-5 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
        {error ? (
          <div className="space-y-4">
            <div className="space-y-2 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-yellow-500" />
              <h1 className="text-lg font-bold text-white">Link inválido ou expirado</h1>
              <p className="text-xs leading-relaxed text-white/60">{error}</p>
              <p className="text-xs leading-relaxed text-white/50">
                Links de redefinição valem por 1 hora e só podem ser usados uma vez. Informe seu e-mail
                abaixo para receber um novo link.
              </p>
            </div>

            {resendStatus === "success" ? (
              <ResendSuccessBlock />
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm">Seu e-mail</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => {
                        setResendEmail(e.target.value);
                        if (resendStatus === "error") {
                          setResendStatus("idle");
                          setResendError(null);
                        }
                      }}
                      placeholder="voce@email.com"
                      className={`w-full rounded-xl border bg-secondary/50 px-10 py-3 outline-none focus:border-primary ${
                        resendStatus === "error" && resendError?.includes("e-mail")
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-white/10"
                      }`}
                      required
                      autoComplete="email"
                      disabled={resendStatus === "loading"}
                    />
                  </div>
                  {resendStatus === "error" && resendError && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {resendError}
                    </p>
                  )}
                </label>

                <button type="submit" disabled={resendStatus === "loading"} className="btn-fire w-full">
                  {resendStatus === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                    </>
                  ) : resendCount > 0 ? (
                    "Reenviar novamente"
                  ) : (
                    "Reenviar e-mail de redefinição"
                  )}
                </button>
              </form>
            )}

            <Link to="/login" className="block text-center text-xs text-white/60 underline hover:text-white">
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

            <button
              type="button"
              onClick={openResendFromForm}
              className="w-full text-center text-xs text-white/50 underline hover:text-white"
            >
              Problemas com este link? Reenviar e-mail
            </button>
          </>
        )}
      </section>
    </main>
  );
}
