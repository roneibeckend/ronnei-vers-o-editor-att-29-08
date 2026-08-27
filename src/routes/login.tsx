import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
const brandLockup = { url: "/brand-lockup.webp" };
import { Flame, Mail, Lock, ArrowRight, Loader2, User, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IMG } from "@/lib/platform-data";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { validatePassword } from "@/lib/password-validation";
import { checkSession } from "@/lib/session-guard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Espetinho na Veia | Área de Membros" },
      { name: "description", content: "Acesse sua área de membros da plataforma Espetinho na Veia e continue seus cursos e e-books." },
      { property: "og:title", content: "Login — Espetinho na Veia" },
      { property: "og:description", content: "Área de membros exclusiva com cursos, e-books e materiais para lucrar com espetinhos." },
    ],
  }),
  component: LoginPage,
});

type Mode = "login" | "signup";

// Provedores desativados até que as credenciais sejam configuradas.
const ENABLE_EMAIL_LOGIN = true;
const ENABLE_GOOGLE_LOGIN = false;
const ENABLE_FACEBOOK_LOGIN = false;
const ENABLE_APPLE_LOGIN = false;

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Se já estiver logado, manda direto para a página inicial
  useEffect(() => {
    // Capturar referência do afiliado da URL para persistir após login/signup
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const redirectTo = urlParams.get('redirectTo');
    
    if (ref) {
      localStorage.setItem('affiliate_referrer_code', ref);
    }

    // Erro/cancelamento retornado por provedores OAuth (query ou hash)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const oauthError = urlParams.get("error") || hashParams.get("error");
    if (oauthError) {
      const desc = urlParams.get("error_description") || hashParams.get("error_description") || "";
      if (/access_denied|cancel/i.test(oauthError + desc)) {
        toast.info("Login cancelado", { description: "Você cancelou a autenticação com o provedor." });
      } else {
        toast.error("Falha na autenticação social", { description: desc || oauthError });
      }
    }

    // Valida a sessão de verdade (getSession não checa o token no servidor),
    // mas só encerra o login quando o servidor rejeita o token. Offline/rede
    // instável (comum no PWA instalado) mantém a sessão salva.
    checkSession().then(async (check) => {
      console.log("LOOPDBG login check", check, "redirectTo", redirectTo);
      if (check === "invalid") {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignora */
        }
        return;
      }
      if (check === "unknown") return;
      const target = redirectTo || "/inicio";
      navigate({ to: target, replace: true });
    });



    // Após o retorno do OAuth (Facebook), a sessão pode chegar de forma assíncrona
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: redirectTo || "/inicio", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);



  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/inicio`,
      });
      if (result.error) {
        toast.error("Não foi possível entrar com Google", { description: String(result.error?.message ?? result.error) });
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      // Tokens já setados; segue pra plataforma
      const urlParams = new URLSearchParams(window.location.search);
      const redirectTo = urlParams.get('redirectTo');
      navigate({ to: redirectTo || "/inicio" });
    } catch (err) {

      toast.error("Erro ao conectar com Google");
      console.error(err);
      setLoading(false);
    }
  };

  // Apple: OAuth nativo do Supabase (broker não suporta Apple neste projeto)
  const handleApple = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const redirectTo = urlParams.get('redirectTo');
      const callback = `${window.location.origin}/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: callback },
      });
      if (error) {
        toast.error("Não foi possível entrar com Apple", { description: error.message });
        setLoading(false);
      }
    } catch (err) {
      toast.error("Erro ao conectar com Apple");
      console.error(err);
      setLoading(false);
    }
  };


  // Facebook: OAuth nativo do Supabase, preservando redirectTo
  const handleFacebook = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const redirectTo = urlParams.get('redirectTo');
      const callback = `${window.location.origin}/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "facebook",
        options: { redirectTo: callback },
      });
      if (error) {
        toast.error("Não foi possível entrar com Facebook", { description: error.message });
        setLoading(false);
      }
    } catch (err) {
      toast.error("Erro ao conectar com Facebook");
      console.error(err);
      setLoading(false);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === "signup") {
      if (!name.trim()) {
        toast.error("O nome completo é obrigatório.");
        return;
      }
      if (!phone.trim()) {
        toast.error("O número de telefone é obrigatório.");
        return;
      }
      
      const validation = validatePassword(password);
      if (!validation.isValid) {
        toast.error("Senha inválida", { description: validation.message });
        return;
      }

      // Proteção contra senhas vazadas em bases públicas de credenciais.
      try {
        const { checkLeakedPassword } = await import("@/lib/leaked-password.functions");
        const result = await checkLeakedPassword({ data: { password } });
        if (result?.leaked) {
          toast.error("Senha comprometida", {
            description:
              "Esta senha já apareceu em vazamentos de dados públicos. Escolha outra senha para proteger sua conta.",
          });
          return;
        }
      } catch (leakErr) {
        console.error("[Auth] Falha ao verificar senha vazada:", leakErr);
      }
    }


    setLoading(true);
    try {
      if (mode === "signup") {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              name,
              phone: phone.replace(/\D/g, "") // Enviar apenas dígitos
            },
          },
        });
        if (error) throw error;

        // Dispara e-mail de boas-vindas (não bloqueia o fluxo)
        try {
          const { sendWelcomeEmailPublic } = await import("@/lib/email-triggers.functions");
          await sendWelcomeEmailPublic({ data: { email } });
        } catch (emailErr) {
          console.error("[Auth] Erro ao disparar e-mail de boas-vindas:", emailErr);
        }

        let session = data.session;

        // Com a confirmação de cadastro desativada no Supabase, o aluno deve
        // receber uma sessão imediatamente. Se ela ainda não tiver chegado,
        // fazemos uma tentativa de login sem iniciar qualquer fluxo de confirmação.
        if (!session) {
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({ email, password });

          if (signInError) throw signInError;
          session = signInData.session;
        }

        if (!session) {
          throw new Error("Não foi possível iniciar sua sessão após o cadastro.");
        }

        toast.success("Conta criada!", { description: "Você já pode acessar sua área de membros." });

        // Remove qualquer dado em cache de um usuário anterior neste navegador
        await queryClient.cancelQueries();
        queryClient.clear();

        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get('redirectTo');
        navigate({ to: redirectTo || "/inicio", replace: true });

      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");

        await queryClient.cancelQueries();
        queryClient.clear();

        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get('redirectTo');
        navigate({ to: redirectTo || "/inicio" });
      }
    } catch (err: any) {

      const msg = err?.message ?? "Falha ao processar solicitação";
      console.error("[Auth Error]", { mode, msg, err });
      
      if (/invalid login credentials/i.test(msg)) {
        if (mode === "signup") {
          toast.error("Erro ao criar conta", { description: "Por favor, verifique os dados informados ou tente outro e-mail." });
        } else {
          toast.error("E-mail ou senha incorretos");
        }
      } else if (/already registered/i.test(msg) || /user already/i.test(msg)) {
        toast.error("E-mail já cadastrado", { description: "Faça login em vez de criar conta." });
        setMode("login");
      } else if (/password/i.test(msg)) {
        toast.error("Problema com a senha", { 
          description: msg.includes("weak") 
            ? "Sua senha é muito fraca. Tente misturar letras e números." 
            : "Senha inválida. Certifique-se de que ela atende aos requisitos."
        });
      } else if (/rate limit/i.test(msg) || /too many requests/i.test(msg)) {
        toast.error("Muitas tentativas", { description: "Aguarde alguns instantes e tente novamente." });
      } else {
        const contextMsg = mode === "signup" ? "Erro no cadastro" : "Erro no login";
        toast.error(contextMsg, { description: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading) return;
    if (!resetEmail.trim()) {
      toast.info("Informe seu e-mail", { description: "Digite o e-mail da sua conta para receber o link de recuperação." });
      return;
    }

    const email = resetEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail inválido", { description: "Digite um endereço de e-mail válido." });
      return;
    }

    setLoading(true);
    try {
      try {
        localStorage.setItem("last_reset_email", email);
      } catch {
        /* ignora */
      }
      const { publicOrigin } = await import("@/lib/auth-callback");
      const { sendPasswordResetEmail } = await import("@/lib/auth-recovery.functions");
      const result = await sendPasswordResetEmail({ data: { email, origin: publicOrigin() } });
      if (!result.ok) {
        throw new Error(result.error || "Não foi possível enviar o e-mail agora. Tente novamente em alguns instantes.");
      }
      setResetSent(true);
    } catch (err: any) {
      toast.error("Não foi possível enviar o e-mail", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const openResetModal = () => {
    setResetEmail(email.trim());
    setResetSent(false);
    setResetOpen(true);
  };


  const isSignup = mode === "signup";

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2 safe-top safe-bottom">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={IMG.chef} alt="Preparando espetinhos na brasa" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-widest text-white/80 backdrop-blur">
            <Flame className="h-3.5 w-3.5" /> Área de membros
          </div>
          <h2 className="font-display text-4xl font-bold leading-tight text-white">
            Aprenda, coloque em prática e transforme espetinhos em uma <span className="text-gradient-fire">fonte de renda</span>.
          </h2>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <img
              src={brandLockup.url}
              alt="Ronnei na Veia"
              width={1920}
              height={640}
              decoding="async"
              className="h-14 w-auto max-w-[260px] object-contain object-left"
            />
          </div>

          <h1 className="font-display text-3xl font-bold">
            {isSignup ? "Crie sua conta de aluno" : "Acesse sua área de membros"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignup
              ? "Preencha seus dados para começar."
              : "Entre para continuar seus cursos, e-books e materiais."}
          </p>

          {ENABLE_GOOGLE_LOGIN && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.12A6.98 6.98 0 015.5 12c0-.74.12-1.45.34-2.12V7.04H2.18A11 11 0 001 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 0 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              Continuar com Google
            </button>
          )}

          {ENABLE_FACEBOOK_LOGIN && (
            <button
              type="button"
              onClick={handleFacebook}
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/>
              </svg>
              Continuar com Facebook
            </button>
          )}

          {ENABLE_APPLE_LOGIN && (
            <button
              type="button"
              onClick={handleApple}
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/80 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M16.36 12.78c.03 2.9 2.54 3.86 2.57 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.34-2.96 2.36-1.3.03-1.71-.77-3.19-.77s-1.94.75-3.17.8c-1.27.05-2.24-1.26-3.05-2.43-1.66-2.4-2.93-6.78-1.22-9.73.85-1.47 2.36-2.4 4-2.42 1.25-.03 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.09 3.72M13.99 3.9c.68-.83 1.14-1.98 1.01-3.13-.98.04-2.16.65-2.87 1.48-.63.73-1.19 1.9-1.04 3.02 1.09.09 2.21-.55 2.9-1.37"/>
              </svg>
              Continuar com Apple
            </button>
          )}





          {!ENABLE_EMAIL_LOGIN && (
            <p className="mt-6 rounded-xl border border-white/10 bg-secondary/40 p-4 text-center text-sm text-muted-foreground">
              O acesso por e-mail e senha está temporariamente indisponível. Use o botão acima para entrar.
            </p>
          )}

          {ENABLE_EMAIL_LOGIN && (
          <>
          {(ENABLE_GOOGLE_LOGIN || ENABLE_FACEBOOK_LOGIN || ENABLE_APPLE_LOGIN) && (
            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
              <div className="h-px flex-1 bg-white/10" />
              ou com e-mail
              <div className="h-px flex-1 bg-white/10" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm">Nome completo</span>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                      required
                      autoComplete="name"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm">WhatsApp / Telefone</span>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(00) 00000-0000"
                      className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                      required
                    />
                  </div>
                </label>
              </>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm">E-mail</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                  required
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm">Senha</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                  required
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>
            </label>

            <button type="submit" disabled={loading} className="btn-fire w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Aguarde…
                </>
              ) : isSignup ? (
                <>
                  Criar conta <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Entrar na plataforma <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {!isSignup && (
              <button
                type="button"
                onClick={openResetModal}
                disabled={loading}
                className="w-full text-center text-xs text-muted-foreground hover:text-gold hover:underline"
              >
                Esqueci minha senha
              </button>
            )}
          </form>

          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Recuperar senha</DialogTitle>
                <DialogDescription>
                  Digite o e-mail da sua conta e enviaremos um link seguro para criar uma nova senha.
                </DialogDescription>
              </DialogHeader>

              {!resetSent ? (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm">E-mail</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full rounded-xl border border-white/10 bg-secondary/50 px-10 py-3 outline-none focus:border-primary"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </label>

                  <DialogFooter>
                    <button
                      type="button"
                      onClick={() => setResetOpen(false)}
                      disabled={loading}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-secondary/50 px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading || !resetEmail.trim()}
                      className="btn-fire inline-flex items-center gap-2 px-4 py-2.5"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Enviar link
                    </button>
                  </DialogFooter>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-100">
                    E-mail enviado com sucesso! Verifique sua caixa de entrada (e o spam) para criar uma nova senha.
                  </div>
                  <DialogFooter>
                    <button
                      type="button"
                      onClick={() => setResetOpen(false)}
                      className="btn-fire w-full"
                    >
                      Entendido
                    </button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                Já tem conta?{" "}
                <button className="text-gold hover:underline" onClick={() => setMode("login")}>
                  Entrar
                </button>
              </>
            ) : (
              <>
                Ainda não é aluno?{" "}
                <button className="text-gold hover:underline" onClick={() => setMode("signup")}>
                  Criar conta grátis
                </button>
              </>
            )}
          </p>
          </>
          )}

          <p className="mt-2 text-center text-xs text-muted-foreground">
            <button onClick={() => window.history.back()} className="hover:underline">← Voltar</button>
          </p>
        </div>
      </div>
    </div>
  );
}
