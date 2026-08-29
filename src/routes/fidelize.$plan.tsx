import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { listFidelizePlans } from "@/lib/fidelize-products.functions";
import { useCheckout } from "@/hooks/use-checkout";

const SITE = "https://ronneinaveia.com.br";

export const Route = createFileRoute("/fidelize/$plan")({
  head: ({ params }) => {
    const name = `Fidelize ${params.plan.charAt(0).toUpperCase()}${params.plan.slice(1)}`;
    return {
      meta: [
        { title: `${name} — Programa de fidelidade | Ronnei na Veia` },
        {
          name: "description",
          content: `Contrate o ${name} e ative seu programa de fidelidade digital. Conta criada automaticamente após a aprovação do pagamento.`,
        },
        { property: "og:title", content: `${name} — Programa de fidelidade` },
        { property: "og:description", content: `Contrate o ${name} e comece a fidelizar seus clientes hoje.` },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `${SITE}/fidelize/${params.plan}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `${SITE}/fidelize/${params.plan}` }],
    };
  },
  component: FidelizePlanPage,
});

function FidelizePlanPage() {
  const { plan } = useParams({ from: "/fidelize/$plan" });
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listFidelizePlans);
  const { openCheckout } = useCheckout();
  const [loading, setLoading] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["fidelize-plans-public"], queryFn: () => fetchPlans() });
  const info = (data || []).find((p) => p.plan === plan);

  const handleBuy = async () => {
    if (!info) return;
    try {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate({ to: "/login", search: { redirectTo: `/fidelize/${plan}` } as never });
        return;
      }
      openCheckout({
        productId: plan,
        productType: "fidelize",
        title: info.label,
        cover: (info as any).cover ?? null,
        description: info.description,
        benefits: info.modules,
        value: info.price,
        recurring: true,
      });
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!info || !info.active) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Plano indisponível</h1>
        <p className="mt-3 text-muted-foreground">Este plano Fidelize não está disponível para contratação no momento.</p>
        <Button className="mt-6" onClick={() => navigate({ to: "/fidelize" })}>
          Ver planos disponíveis
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{info.label}</CardTitle>
          <p className="text-muted-foreground">{info.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-4xl font-bold">
            R$ {info.price.toFixed(2).replace(".", ",")}
            <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">/mês · assinatura mensal</span>
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {info.modules.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> {m}
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" onClick={handleBuy} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Contratar agora
          </Button>
          <p className="text-xs text-muted-foreground">
            Após a aprovação do pagamento, sua conta Fidelize é criada automaticamente e os dados de acesso chegam por
            e-mail.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
