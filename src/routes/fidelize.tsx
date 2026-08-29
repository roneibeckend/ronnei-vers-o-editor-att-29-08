import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listFidelizePlans } from "@/lib/fidelize-products.functions";

const SITE = "https://ronneinaveia.com.br";

export const Route = createFileRoute("/fidelize")({
  head: () => ({
    meta: [
      { title: "Fidelize — Programa de fidelidade para o seu delivery" },
      {
        name: "description",
        content:
          "Escolha o plano Fidelize ideal: cartão fidelidade digital, campanhas automáticas, cupons e relatórios para fazer o cliente voltar sempre.",
      },
      { property: "og:title", content: "Fidelize — Programa de fidelidade para o seu delivery" },
      {
        property: "og:description",
        content: "Planos Starter, Pro e Premium do Fidelize com ativação automática após o pagamento.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE}/fidelize` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE}/fidelize` }],
  }),
  component: FidelizePlansPage,
});

function FidelizePlansPage() {
  const fetchPlans = useServerFn(listFidelizePlans);
  const { data, isLoading } = useQuery({ queryKey: ["fidelize-plans-public"], queryFn: () => fetchPlans() });

  const plans = (data || []).filter((p) => p.active);

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Planos Fidelize</h1>
        <p className="mt-3 text-muted-foreground">
          Fidelidade digital para o seu negócio. Conta criada automaticamente assim que o pagamento é aprovado.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <p className="text-center text-muted-foreground">Nenhum plano disponível no momento.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.plan} className="flex flex-col">
              <CardHeader>
                <CardTitle>{plan.label}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-3xl font-bold">
                  R$ {plan.price.toFixed(2).replace(".", ",")}
                </p>
                <ul className="flex-1 space-y-2 text-sm text-muted-foreground">
                  {plan.modules.map((m) => (
                    <li key={m} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> {m}
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <Link to="/fidelize/$plan" params={{ plan: plan.plan }}>
                    Assinar {plan.label}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
