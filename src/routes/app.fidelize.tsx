import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/platform/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FidelizeOffer } from "@/components/platform/FidelizeOffer";
import {
  getMyFidelizeAccount,
  resendMyFidelizeAccess,
  revealMyFidelizeCredentials,
  getMyFidelizeAccessUrl,
  cancelMyFidelizeSubscription,
  requestMyFidelizeReactivation,
} from "@/lib/fidelize-account.functions";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { FIDELIZE_PLAN_CATALOG, fidelizePlanLabel, isFidelizePlan } from "@/lib/fidelize-plans";
import { friendlyFidelizeError } from "@/lib/fidelize-messages";


export const Route = createFileRoute("/app/fidelize")({
  head: () => ({
    meta: [
      { title: "Minha conta Fidelize | Ronnei na Veia" },
      {
        name: "description",
        content:
          "Acompanhe seu plano Fidelize, data de ativação, status da conta e módulos liberados, e acesse a plataforma em um clique.",
      },
      { property: "og:title", content: "Minha conta Fidelize | Ronnei na Veia" },
      {
        property: "og:description",
        content: "Plano contratado, status da conta e módulos liberados da sua conta Fidelize.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FidelizePage,
});

const STATUS_MAP: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  success: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-600", icon: CheckCircle2 },
  pending: { label: "Em processamento", className: "bg-amber-500/15 text-amber-600", icon: Clock },
  failed: { label: "Falha na ativação", className: "bg-destructive/15 text-destructive", icon: ShieldAlert },
};

const SUBSCRIPTION_MAP: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Assinatura ativa", className: "bg-emerald-500/15 text-emerald-600", icon: CheckCircle2 },
  overdue: { label: "Assinatura vencida", className: "bg-amber-500/15 text-amber-700", icon: Clock },
  canceled: { label: "Assinatura cancelada", className: "bg-destructive/15 text-destructive", icon: XCircle },
  pending: { label: "Aguardando pagamento", className: "bg-muted text-muted-foreground", icon: Clock },
};

function FidelizePage() {
  const fetchAccount = useServerFn(getMyFidelizeAccount);
  const resendAccess = useServerFn(resendMyFidelizeAccess);
  const revealCredentials = useServerFn(revealMyFidelizeCredentials);
  const getAccessUrl = useServerFn(getMyFidelizeAccessUrl);
  const queryClient = useQueryClient();
  const [resending, setResending] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState<"cancel" | "reactivate" | null>(null);
  const cancelSubscription = useServerFn(cancelMyFidelizeSubscription);
  const requestReactivation = useServerFn(requestMyFidelizeReactivation);
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const { openPayment } = usePaymentModal();
  const [credentials, setCredentials] = useState<{
    temporaryPassword: string | null;
    autoLoginUrl: string | null;
  } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["fidelize-account"],
    queryFn: () => fetchAccount(),
    refetchInterval: (query) => ((query.state.data as any)?.status === "pending" ? 15000 : false),
  });

  const handleReveal = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (credentials?.temporaryPassword) {
      setShowPassword(true);
      return;
    }
    setRevealing(true);
    try {
      const result: any = await revealCredentials();
      setCredentials({
        temporaryPassword: result?.temporaryPassword ?? null,
        autoLoginUrl: result?.autoLoginUrl ?? null,
      });
      if (result?.temporaryPassword) setShowPassword(true);
      else toast.info(result?.message || "Senha temporária indisponível.");
    } catch {
      toast.error("Não foi possível exibir a senha agora.");
    } finally {
      setRevealing(false);
    }
  };


  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  // Abre uma URL em nova aba de forma segura (sem depender de popup tardio).
  const openInTab = (tab: Window | null, url: string) => {
    if (tab && !tab.closed) {
      try {
        tab.opener = null;
      } catch {
        /* alguns navegadores bloqueiam a atribuição */
      }
      tab.location.replace(url);
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Login único: pede ao servidor a melhor URL de acesso (autologin → magic-link → login).
  const handleAccess = async () => {
    // Sem "noopener" aqui: precisamos do handle da aba para navegá-la depois.
    const tab = window.open("about:blank", "_blank");
    setOpening(true);
    try {
      const result: any = await getAccessUrl();
      const url: string | null = result?.url ?? data?.loginUrl ?? null;
      if (!url) {
        tab?.close();
        toast.error(result?.message || "Não foi possível abrir a Fidelize agora.");
        return;
      }
      if (result?.method === "autologin" || result?.method === "magic-link") {
        toast.success("Entrando na Fidelize automaticamente — sem senha.");
      } else if (result?.message) {
        toast.info(result.message);
      }
      openInTab(tab, url);
    } catch {
      if (data?.loginUrl) openInTab(tab, data.loginUrl);
      else {
        tab?.close();
        toast.error("Não foi possível abrir a Fidelize agora. Tente novamente.");
      }
    } finally {
      setOpening(false);
    }
  };


  const handleResend = async () => {
    setResending(true);
    try {
      const result: any = await resendAccess();
      if (result?.success) {
        toast.success(result.message || "Enviamos os dados de acesso para o seu e-mail.");
        queryClient.invalidateQueries({ queryKey: ["fidelize-account"] });
      } else {
        toast.error(result?.message || "Não foi possível reenviar o acesso agora.");
      }
    } catch {
      toast.error("Não foi possível reenviar o acesso agora. Tente novamente em alguns minutos.");
    } finally {
      setResending(false);
    }
  };


  const handleCancelSubscription = async () => {
    const ok = window.confirm(
      "Tem certeza que deseja cancelar sua assinatura Fidelize? A cobrança mensal deixa de existir e você mantém o acesso até o fim do período já pago.",
    );
    if (!ok) return;
    setSubscriptionBusy("cancel");
    try {
      const result: any = await cancelSubscription();
      if (result?.success) {
        toast.success(result.message || "Assinatura cancelada.");
        queryClient.invalidateQueries({ queryKey: ["fidelize-account"] });
      } else {
        toast.error(result?.message || "Não foi possível cancelar agora.");
      }
    } catch {
      toast.error("Não foi possível cancelar agora. Tente novamente em alguns minutos.");
    } finally {
      setSubscriptionBusy(null);
    }
  };

  const handleReactivate = async () => {
    setSubscriptionBusy("reactivate");
    try {
      const intent: any = await requestReactivation();
      const plan = intent?.plan || data?.plan;
      if (!plan) {
        toast.error(intent?.message || "Não encontramos seu plano para reativar.");
        return;
      }
      const result: any = await createPaymentLink({
        data: {
          products: [{ productId: plan, productType: "fidelize", title: fidelizePlanLabel(plan) }],
          paymentType: "recurring",
        },
      });
      if (result?.url) {
        openPayment(result.url, fidelizePlanLabel(plan), plan, "fidelize", {
          value: result.value,
          transactionId: result.id,
          onClose: () => queryClient.invalidateQueries({ queryKey: ["fidelize-account"] }),
        });
      } else {
        toast.error("Não foi possível iniciar a reativação.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível reativar agora.");
    } finally {
      setSubscriptionBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fidelize" subtitle="Programa de fidelidade para o seu negócio." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Sparkles className="h-9 w-9 text-primary" />
            <div>
              <p className="text-lg font-semibold">Escolha seu plano Fidelize</p>
              <p className="text-sm text-muted-foreground">
                Após a aprovação do pagamento, sua conta é criada automaticamente e os dados de acesso chegam no seu
                e-mail.
              </p>
            </div>
          </CardContent>
        </Card>
        <FidelizeOffer />
      </div>
    );
  }

  const status = STATUS_MAP[data.status] ?? STATUS_MAP["pending"]!;
  const StatusIcon = status.icon;
  const subscriptionState = (data as any).subscriptionStatus ?? "active";
  const subscription = SUBSCRIPTION_MAP[subscriptionState] ?? SUBSCRIPTION_MAP["active"]!;
  const SubscriptionIcon = subscription.icon;
  const isCanceled = subscriptionState === "canceled";
  const isOverdue = subscriptionState === "overdue";
  const planInfo = isFidelizePlan(data.plan) ? FIDELIZE_PLAN_CATALOG[data.plan] : null;
  const planFeatures = data.modules.length > 0 ? data.modules : (planInfo?.modules ?? []);
  const nextPlan =
    planInfo?.plan === "starter"
      ? FIDELIZE_PLAN_CATALOG.pro
      : planInfo?.plan === "pro"
        ? FIDELIZE_PLAN_CATALOG.premium
        : null;
  const nextPlanExtras = nextPlan
    ? nextPlan.modules.filter((m) => !planFeatures.some((f) => f.toLowerCase() === m.toLowerCase()))
    : [];


  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta Fidelize" subtitle="Plano, status e módulos liberados." />

      <Card>
        <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <CardTitle className="text-xl break-words">{fidelizePlanLabel(data.plan)}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ativado em {new Date(data.activatedAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Badge className={status.className}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              {status.label}
            </Badge>
            {data.status === "success" && (
              <Badge className={subscription.className}>
                <SubscriptionIcon className="mr-1 h-3.5 w-3.5" />
                {subscription.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.status === "failed" && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {friendlyFidelizeError(data.errorMessage)} Nossa equipe já foi avisada — fale com o suporte se precisar de
              agilidade.
            </p>
          )}
          {data.status === "pending" && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">
              Estamos criando sua conta na Fidelize. Isso leva alguns instantes — esta página atualiza sozinha.
            </p>
          )}

          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-semibold">Seus dados de acesso</p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">E-mail (login)</p>
                <p className="break-all text-sm font-medium">{data.email ?? "Não informado"}</p>
              </div>
              {data.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => copy(data.email!, "Login")}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar login
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Senha temporária</p>
                <p className="break-all font-mono text-sm font-medium">
                  {credentials?.temporaryPassword
                    ? showPassword
                      ? credentials.temporaryPassword
                      : "•".repeat(Math.max(8, credentials.temporaryPassword.length))
                    : "••••••••"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={handleReveal}
                  disabled={revealing || data.status !== "success"}
                >
                  {revealing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : showPassword ? (
                    <EyeOff className="mr-2 h-4 w-4" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  {showPassword ? "Ocultar" : "Mostrar senha"}
                </Button>
                {showPassword && credentials?.temporaryPassword && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(credentials.temporaryPassword!, "Senha")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">URL de acesso</p>
                <p className="break-all text-sm font-medium">{data.loginUrl ?? "Disponível no e-mail de acesso"}</p>
              </div>
              {data.loginUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => copy(data.loginUrl!, "Link de acesso")}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar URL
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              A mesma senha enviada por e-mail. Recomendamos trocá-la no primeiro acesso à Fidelize.
            </p>
          </div>


          {data.status === "success" && !data.migratedToFidelize && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Assinatura mensal</p>
                <Badge className={subscription.className}>
                  <SubscriptionIcon className="mr-1 h-3.5 w-3.5" />
                  {subscription.label}
                </Badge>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {(data as any).lastPaymentAt && (
                  <p>
                    Último pagamento confirmado em{" "}
                    {new Date((data as any).lastPaymentAt).toLocaleDateString("pt-BR")}
                  </p>
                )}
                {(data as any).nextDueDate && !isCanceled && (
                  <p>Próximo vencimento em {new Date((data as any).nextDueDate).toLocaleDateString("pt-BR")}</p>
                )}
                {isOverdue && (data as any).overdueSince && (
                  <p className="text-amber-700">
                    Em atraso desde {new Date((data as any).overdueSince).toLocaleDateString("pt-BR")}
                  </p>
                )}
                {isCanceled && data.subscriptionCanceledAt && (
                  <p>Cancelada em {new Date(data.subscriptionCanceledAt).toLocaleDateString("pt-BR")}</p>
                )}
              </div>
              {isOverdue && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">
                  Identificamos uma fatura em atraso. Assim que o Asaas confirmar o pagamento, sua assinatura volta a
                  ficar ativa automaticamente.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {isCanceled ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={handleReactivate}
                    disabled={subscriptionBusy !== null}
                  >
                    {subscriptionBusy === "reactivate" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Reativar assinatura
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive sm:w-auto"
                    onClick={handleCancelSubscription}
                    disabled={subscriptionBusy !== null}
                  >
                    {subscriptionBusy === "cancel" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Cancelar assinatura
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O status acima é sincronizado automaticamente com o Asaas — cancelamentos e pagamentos só mudam o
                estado depois da confirmação do gateway.
              </p>
            </div>
          )}

          {(planInfo || planFeatures.length > 0) && (
            <div className="rounded-xl border p-4">
              <p className="text-sm font-semibold">O que o seu plano faz por você</p>
              {planInfo?.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{planInfo.description}</p>
              ) : null}
              {planFeatures.length > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Inclui {planFeatures.slice(0, -1).join(", ")}
                  {planFeatures.length > 1 ? " e " : ""}
                  {planFeatures[planFeatures.length - 1]}.
                </p>
              ) : null}
            </div>
          )}

          {nextPlan && nextPlanExtras.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">
                Dá para ir além com o {nextPlan.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {nextPlan.description} Além do que você já tem, o plano libera{" "}
                {nextPlanExtras.slice(0, -1).join(", ")}
                {nextPlanExtras.length > 1 ? " e " : ""}
                {nextPlanExtras[nextPlanExtras.length - 1]}.
              </p>
              <Button
                variant="outline"
                className="mt-3 w-full sm:w-auto"
                disabled={opening || data.status !== "success"}
                onClick={handleAccess}
              >
                Fazer upgrade na Fidelize
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}


          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              disabled={opening || data.status !== "success"}
              onClick={handleAccess}
            >
              {opening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Acessar Fidelize
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleResend}
              disabled={resending || data.status !== "success"}
            >
              {resending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reenviar acesso
            </Button>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
            Login único: ao clicar em “Acessar Fidelize” você entra automaticamente, sem digitar senha.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            O reenvio vai para o e-mail usado na compra.
          </p>

          {data.migratedToFidelize ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Assinatura gerenciada pela Fidelize
              </p>
              <p className="mt-1 text-muted-foreground">
                {data.lifecycleStatus === "canceled"
                  ? "Sua conta foi cancelada na Fidelize."
                  : data.lifecycleStatus === "reactivated"
                  ? `Sua assinatura foi reativada na Fidelize${
                      data.lifecyclePlan ? ` (${fidelizePlanLabel(data.lifecyclePlan as never)})` : ""
                    }.`
                  : `Você alterou seu plano diretamente na Fidelize${
                      data.lifecyclePlan ? ` (${fidelizePlanLabel(data.lifecyclePlan as never)})` : ""
                    }.`}{" "}
                {data.subscriptionCanceledAt
                  ? "A cobrança recorrente aqui no Ronnei na Veia foi encerrada automaticamente — você não será cobrado em duplicidade."
                  : "A cobrança recorrente aqui no Ronnei na Veia foi encerrada."}{" "}
                A partir de agora, a Fidelize é responsável pela sua assinatura, cobranças e mudanças de plano.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-700">
                <ShieldAlert className="h-4 w-4" />
                Antes de mudar de plano na Fidelize
              </p>
              <p className="mt-1 text-amber-700/90">
                Se você fizer upgrade, downgrade ou cancelar diretamente na Fidelize, sua assinatura contratada aqui
                será <strong>encerrada automaticamente</strong> e a cobrança recorrente do Ronnei na Veia deixa de
                existir. A partir daí, a Fidelize passa a ser responsável pela sua assinatura e pelas novas cobranças —
                sem cobrança duplicada.
              </p>
            </div>
          )}
        </CardContent>


      </Card>
    </div>
  );
}
