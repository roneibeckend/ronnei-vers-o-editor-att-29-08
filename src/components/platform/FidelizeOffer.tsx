import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listFidelizePlans } from "@/lib/fidelize-products.functions";
import { createAsaasPaymentLink } from "@/lib/asaas.functions";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { getAffiliateRef } from "@/hooks/use-affiliate-tracking";

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export function useFidelizePlans() {
  const fetchPlans = useServerFn(listFidelizePlans);
  return useQuery({
    queryKey: ["fidelize-plans-public"],
    queryFn: () => fetchPlans(),
    staleTime: 1000 * 60 * 5,
  });
}

/** Lista os planos Fidelize ativos com checkout dentro da área de membros. */
export function FidelizeOffer({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useFidelizePlans();
  const createPaymentLink = useServerFn(createAsaasPaymentLink);
  const { openPayment } = usePaymentModal();
  const [busy, setBusy] = useState<string | null>(null);

  const plans = (data || []).filter((p: any) => p.active);

  const handleBuy = async (plan: any) => {
    try {
      setBusy(plan.plan);
      const result: any = await createPaymentLink({
        data: {
          products: [
            {
              productId: plan.plan,
              productType: "fidelize",
              title: plan.label,
              description: plan.description,
              value: plan.price,
            },
          ],
          affiliateRef: getAffiliateRef() || undefined,
          paymentType: "recurring",
        },
      });
      if (result?.url) {
        openPayment(result.url, plan.label, plan.plan, "fidelize", {
          value: result.value,
          transactionId: result.id,
        });
      } else {
        toast.error("Não foi possível iniciar o pagamento.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum plano Fidelize disponível no momento.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
      {plans.map((plan: any) => (
        <Card
          key={plan.plan}
          className={`group relative flex flex-col overflow-hidden p-0 transition-colors ${
            plan.highlight ? "border-primary/60 shadow-lg shadow-primary/10" : "hover:border-primary/40"
          }`}
        >
          <div className="relative aspect-video w-full overflow-hidden">
            <img
              src={plan.cover}
              alt={`Capa do ${plan.label}`}
              loading="lazy"
              width={1024}
              height={576}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <div className="absolute left-3 top-3 flex gap-2">
              <Badge variant="secondary" className="gap-1 backdrop-blur">
                <Sparkles className="h-3 w-3" /> Fidelize
              </Badge>
              {plan.highlight && <Badge className="backdrop-blur">Mais escolhido</Badge>}
            </div>
            <p className="absolute bottom-2 left-3 right-3 truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {plan.tagline}
            </p>
          </div>

          <CardHeader className="space-y-1 pt-4">
            <CardTitle className="text-lg">{plan.label}</CardTitle>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-4 pb-5">
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold leading-none">{brl(plan.price)}</p>
              <span className="pb-0.5 text-xs text-muted-foreground">/mês · assinatura mensal</span>
            </div>
            {!compact && (
              <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
                {plan.modules.map((m: string) => (
                  <li key={m} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {m}
                  </li>
                ))}
              </ul>
            )}
            {compact && (
              <p className="text-xs text-muted-foreground">
                {plan.modules.slice(0, 3).join(" · ")}
                {plan.modules.length > 3 ? ` · +${plan.modules.length - 3}` : ""}
              </p>
            )}
            <Button className="mt-auto w-full" onClick={() => handleBuy(plan)} disabled={busy === plan.plan}>
              {busy === plan.plan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {plan.ctaLabel || "Contratar agora"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
