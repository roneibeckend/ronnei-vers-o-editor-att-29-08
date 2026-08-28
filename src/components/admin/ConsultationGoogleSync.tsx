import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getGoogleSyncIssues, retryGoogleSync } from "@/lib/consultations-admin.functions";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function ConsultationGoogleSync() {
  const load = useServerFn(getGoogleSyncIssues);
  const retry = useServerFn(retryGoogleSync);
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["consultation-google-sync"],
    queryFn: () => load(),
    refetchInterval: 120_000,
  });

  const reprocess = useMutation({
    mutationFn: (ids: string[]) => retry({ data: { ids } }),
    onSuccess: (r: any) => {
      if (r.recovered) toast.success(`${r.recovered} reunião(ões) recuperada(s).`);
      if (r.failed) toast.error(`${r.failed} continuam com erro. Verifique a integração do Google.`);
      queryClient.invalidateQueries({ queryKey: ["consultation-google-sync"] });
      queryClient.invalidateQueries({ queryKey: ["admin-consultations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reprocessar."),
    onSettled: () => setRunning(null),
  });

  const issues = data?.issues ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Falhas de integração com o Google
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reuniões já confirmadas que ficaram sem evento no Google Agenda, sem link do Meet ou sem
            e-mail de confirmação. Use “Tentar novamente” para reprocessar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["consultation-google-sync"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          {issues.length > 0 && (
            <Button
              size="sm"
              disabled={reprocess.isPending}
              onClick={() => {
                setRunning("all");
                reprocess.mutate(issues.map((i: any) => i.id));
              }}
            >
              {reprocess.isPending && running === "all" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reprocessar todas ({issues.length})
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#ff6a00]" />
          </div>
        )}

        {!isLoading && issues.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Nenhuma pendência: todas as reuniões confirmadas têm evento,
            Meet e e-mail enviados.
          </p>
        )}

        {issues.map((i: any) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">
                {i.client_name || i.client_email || "Aluno"} · {i.product_title}
                {i.sessions_total > 1 ? ` (encontro ${i.session_index}/${i.sessions_total})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{fmt(i.scheduled_at)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {i.problems.map((p: string) => (
                  <Badge key={p} variant="destructive" className="text-[11px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={reprocess.isPending}
              onClick={() => {
                setRunning(i.id);
                reprocess.mutate([i.id]);
              }}
            >
              {reprocess.isPending && running === i.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Tentar novamente
            </Button>
          </div>
        ))}
      </div>

      {(data?.errors ?? []).length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold">Últimos erros registrados</h4>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(data?.errors ?? []).map((e: any) => (
              <p key={e.id}>
                {fmt(e.created_at)} · {e.action} ·{" "}
                <span className="text-destructive">
                  {(e.details as any)?.error ?? "erro sem detalhe"}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
