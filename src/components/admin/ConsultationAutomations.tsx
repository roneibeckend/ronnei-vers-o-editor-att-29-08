import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Bell, CheckCircle2, Clock, Loader2, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getConsultationAutomations,
  runConsultationRemindersNow,
} from "@/lib/consultations-admin.functions";
import { isValidMeetLink, isValidCalendarEventId } from "@/lib/consultation-reminders";

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function ConsultationAutomations() {
  const load = useServerFn(getConsultationAutomations);
  const runNow = useServerFn(runConsultationRemindersNow);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["consultation-automations"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const run = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => {
      toast.success(
        `Rotina executada: ${r.sent8h} lembrete(s) de 8h, ${r.sent1h} de 1h, ${r.failed ?? 0} falha(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["consultation-automations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao executar a rotina."),
  });

  if (isLoading) {
    return (
      <div className="flex h-[240px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  const status = data?.job?.last_status ?? "never";
  const paused = Boolean(data?.job?.paused);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Bell className="h-4 w-4 text-[#ff6a00]" /> Rotina automática de lembretes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Executa a cada 15 minutos em <code>/api/public/consultation-reminders</code>. Envia
              lembrete 8 horas e 1 hora antes de cada reunião, sem duplicidade.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["consultation-automations"] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Executar agora
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Última execução" value={fmt(data?.lastRunAt)} icon={<Clock className="h-4 w-4" />} />
          <Stat label="Próxima execução" value={fmt(data?.nextRunAt)} icon={<Clock className="h-4 w-4" />} />
          <Stat
            label="Lembretes enviados (7 dias)"
            value={`${data?.sentCount ?? 0}`}
            hint={`8h: ${data?.sent8hCount ?? 0} · 1h: ${data?.sent1hCount ?? 0}`}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          />
          <Stat
            label="Falhas (7 dias)"
            value={`${data?.failureCount ?? 0}`}
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={status === "success" ? "default" : status === "error" ? "destructive" : "secondary"}>
            Status: {status === "success" ? "OK" : status === "error" ? "Erro" : status}
          </Badge>
          {paused && <Badge variant="destructive">Pausada: {data?.job?.pause_reason || "sem motivo"}</Badge>}
          {data?.job?.last_error && (
            <span className="text-destructive">Último erro: {data.job.last_error}</span>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold">Próximas reuniões e integrações</h3>
        <div className="mt-3 space-y-2">
          {(data?.upcoming ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reunião agendada.</p>
          )}
          {(data?.upcoming ?? []).map((c: any) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm"
            >
              <span className="font-medium">{fmt(c.scheduled_at)}</span>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={c.reminder_8h_sent_at ? "default" : "secondary"}>
                  8h {c.reminder_8h_sent_at ? "enviado" : "pendente"}
                </Badge>
                <Badge variant={c.reminder_1h_sent_at ? "default" : "secondary"}>
                  1h {c.reminder_1h_sent_at ? "enviado" : "pendente"}
                </Badge>
                <Badge variant={isValidCalendarEventId(c.google_event_id) ? "default" : "destructive"}>
                  Calendar {isValidCalendarEventId(c.google_event_id) ? "ok" : "faltando"}
                </Badge>
                <Badge variant={isValidMeetLink(c.meet_link) ? "default" : "destructive"}>
                  Meet {isValidMeetLink(c.meet_link) ? "ok" : "inválido"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold">Registro de falhas</h3>
        <div className="mt-3 space-y-2">
          {(data?.recentFailures ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma falha registrada nos últimos 7 dias.</p>
          )}
          {(data?.recentFailures ?? []).map((f: any) => (
            <div key={f.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <div className="font-medium">
                {fmt(f.created_at)} · {f.action}
              </div>
              <div className="text-muted-foreground">{f.details?.error || "Sem detalhes"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold">Auditoria de envios</h3>
        <div className="mt-3 space-y-2">
          {(data?.recentSent ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lembrete enviado nos últimos 7 dias.</p>
          )}
          {(data?.recentSent ?? []).map((l: any) => (
            <div key={l.id} className="rounded-lg border border-border/60 p-3 text-xs">
              {fmt(l.created_at)} · {l.action} · reunião {String(l.consultation_id).slice(0, 8)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
