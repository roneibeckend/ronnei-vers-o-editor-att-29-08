import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, ExternalLink, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FidelizeOffer } from "@/components/platform/FidelizeOffer";
import { getMyFidelizeAccount } from "@/lib/fidelize-account.functions";
import { FIDELIZE_PLAN_CATALOG, fidelizePlanLabel, isFidelizePlan } from "@/lib/fidelize-plans";

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

function FidelizePage() {
  const fetchAccount = useServerFn(getMyFidelizeAccount);
  const { data, isLoading } = useQuery({
    queryKey: ["fidelize-account"],
    queryFn: () => fetchAccount(),
    refetchInterval: (query) => ((query.state.data as any)?.status === "pending" ? 15000 : false),
  });

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
  const modules =
    data.modules.length > 0
      ? data.modules
      : isFidelizePlan(data.plan)
        ? FIDELIZE_PLAN_CATALOG[data.plan].modules
        : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta Fidelize" subtitle="Plano, status e módulos liberados." />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{fidelizePlanLabel(data.plan)}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ativado em {new Date(data.activatedAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <Badge className={status.className}>
            <StatusIcon className="mr-1 h-3.5 w-3.5" />
            {status.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.status === "failed" && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              Não conseguimos concluir a ativação automática{data.errorMessage ? `: ${data.errorMessage}` : "."} Nossa
              equipe já foi avisada — fale com o suporte se precisar de agilidade.
            </p>
          )}
          {data.status === "pending" && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">
              Estamos criando sua conta na Fidelize. Isso leva alguns instantes — esta página atualiza sozinha.
            </p>
          )}

          {modules.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Módulos liberados</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <li key={m} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button asChild disabled={!data.loginUrl} className="w-full sm:w-auto">
            <a href={data.loginUrl ?? "#"} target="_blank" rel="noopener noreferrer">
              Acessar Fidelize
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
