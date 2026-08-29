import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyFidelizePlanModules } from "@/lib/fidelize-account.functions";
import {
  describeFeatures,
  groupFeatures,
  canonicalFeatureKey,
  FIDELIZE_PLAN_FEATURE_KEYS,
} from "@/lib/fidelize-features";
import { FIDELIZE_PLAN_CATALOG, isFidelizePlan } from "@/lib/fidelize-plans";

const VISIBLE_LIMIT = 8;

interface Props {
  plan: string | null;
  /** Só consulta a Fidelize quando a conta está ativa. */
  enabled: boolean;
  onUpgrade: () => void;
  upgradeDisabled?: boolean;
}

export function FidelizePlanFeatures({ plan, enabled, onUpgrade, upgradeDisabled }: Props) {
  const fetchModules = useServerFn(getMyFidelizePlanModules);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["fidelize-plan-modules"],
    queryFn: () => fetchModules(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const planInfo = isFidelizePlan(plan) ? FIDELIZE_PLAN_CATALOG[plan] : null;
  const nextPlan =
    planInfo?.plan === "starter"
      ? FIDELIZE_PLAN_CATALOG.pro
      : planInfo?.plan === "pro"
        ? FIDELIZE_PLAN_CATALOG.premium
        : null;

  const remoteKeys = (data as any)?.planModules as string[] | undefined;
  const fallbackKeys = plan ? (FIDELIZE_PLAN_FEATURE_KEYS[plan] ?? []) : [];
  const keys = remoteKeys && remoteKeys.length > 0 ? remoteKeys : fallbackKeys;
  const features = describeFeatures(keys);
  const visible = expanded ? features : features.slice(0, VISIBLE_LIMIT);
  const grouped = groupFeatures(visible);

  const currentCanonical = new Set(features.map((f) => f.key));
  const nextExtras = nextPlan
    ? describeFeatures(
        (FIDELIZE_PLAN_FEATURE_KEYS[nextPlan.plan] ?? []).filter(
          (k) => !currentCanonical.has(canonicalFeatureKey(k)),
        ),
      )
    : [];

  return (
    <>
      <div className="rounded-xl border p-4">
        <p className="text-sm font-semibold">O que o seu plano faz por você</p>
        {planInfo?.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{planInfo.description}</p>
        ) : null}

        {isLoading ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : isError && features.length === 0 ? (
          <div className="mt-3 flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">Não conseguimos carregar os recursos do seu plano agora.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Tentar novamente
            </Button>
          </div>
        ) : features.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Seu plano está ativo e todos os recursos contratados já estão liberados na plataforma da Fidelize.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-4">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {items.map((feature) => (
                      <li key={feature.key} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{feature.label}</span>
                          <span className="block text-xs text-muted-foreground">{feature.description}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {features.length > VISIBLE_LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 px-0 text-primary hover:bg-transparent"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Ver menos" : `Ver todos os ${features.length} recursos`}
              </Button>
            )}
          </>
        )}
      </div>

      {nextPlan && nextExtras.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Dá para ir além com o {nextPlan.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nextPlan.description} Além do que você já tem, o plano libera:
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {nextExtras.map((feature) => (
              <li key={feature.key} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{feature.label}</span>
                  <span className="block text-xs text-muted-foreground">{feature.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="mt-3 w-full sm:w-auto" disabled={upgradeDisabled} onClick={onUpgrade}>
            Fazer upgrade na Fidelize
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
