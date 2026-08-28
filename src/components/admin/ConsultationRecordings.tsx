import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getConsultationRecordingsPanel,
  runConsultationRecordingsNow,
  reprocessConsultationRecording,
} from "@/lib/consultations-admin.functions";

const fmt = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "—";

const STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  linked: { label: "Vinculada", variant: "default" },
  pending: { label: "Pendente", variant: "outline" },
  unmatched: { label: "Sem correspondência", variant: "secondary" },
  error: { label: "Erro", variant: "destructive" },
  failed: { label: "Falhou", variant: "destructive" },
};

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Video;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Card>
  );
}

export function ConsultationRecordings() {
  const qc = useQueryClient();
  const load = useServerFn(getConsultationRecordingsPanel);
  const runNow = useServerFn(runConsultationRecordingsNow);
  const reprocess = useServerFn(reprocessConsultationRecording);
  const [manual, setManual] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["consultation-recordings-panel"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["consultation-recordings-panel"] });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => {
      toast.success(
        `Rotina executada: ${r.discovered ?? 0} nova(s), ${r.linked ?? 0} vinculada(s), ${r.unmatched ?? 0} sem correspondência.`,
      );
      if (r.driveError) toast.error(`Google Drive: ${r.driveError}`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao executar a rotina."),
  });

  const reprocessMutation = useMutation({
    mutationFn: (vars: { fileId: string; consultationId?: string | null }) =>
      reprocess({ data: { fileId: vars.fileId, consultationId: vars.consultationId ?? null } }),
    onSuccess: () => {
      toast.success("Gravação reprocessada.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reprocessar."),
  });

  const registry = (data?.registry ?? []) as any[];
  const consultations = (data?.consultations ?? []) as any[];
  const counts = data?.counts;

  const groups = useMemo(
    () => ({
      linked: registry.filter((r) => r.status === "linked"),
      pending: registry.filter((r) => r.status === "pending"),
      unmatched: registry.filter((r) => r.status === "unmatched"),
      failed: registry.filter((r) => r.status === "error" || r.status === "failed"),
    }),
    [registry],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando gravações...
      </div>
    );
  }

  const consultationLabel = (id: string | null) => {
    if (!id) return null;
    const c = consultations.find((x) => x.id === id);
    return c ? `${c.client_name || "Aluno"} — ${c.product_title} (${fmt(c.scheduled_at)})` : id;
  };

  const renderRow = (row: any) => {
    const status = STATUS[row.status] ?? { label: row.status, variant: "outline" as const };
    return (
      <Card key={row.id} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{row.file_name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gravada em {fmt(row.drive_created_time)}
              {row.size_bytes ? ` · ${(Number(row.size_bytes) / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
            {row.consultation_id ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Vinculada a: <span className="font-medium">{consultationLabel(row.consultation_id)}</span>
              </p>
            ) : null}
            {row.match_reason ? <p className="mt-1 text-xs text-muted-foreground">{row.match_reason}</p> : null}
            {row.error_message ? (
              <p className="mt-1 text-xs text-destructive">
                {row.error_message}
                {row.attempts ? ` · tentativas: ${row.attempts}` : ""}
                {row.next_attempt_at ? ` · próxima tentativa: ${fmt(row.next_attempt_at)}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={status.variant}>{status.label}</Badge>
            {row.notified_at ? (
              <span className="text-[11px] text-muted-foreground">Aluno avisado {fmt(row.notified_at)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {row.web_view_link ? (
            <Button asChild size="sm" variant="outline">
              <a href={row.web_view_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir no Drive
              </a>
            </Button>
          ) : null}

          {row.status !== "linked" ? (
            <>
              <Select
                value={manual[row.file_id] ?? ""}
                onValueChange={(v) => setManual((prev) => ({ ...prev, [row.file_id]: v }))}
              >
                <SelectTrigger className="h-9 w-full sm:w-[320px]">
                  <SelectValue placeholder="Vincular manualmente a uma reunião" />
                </SelectTrigger>
                <SelectContent>
                  {consultations
                    .filter((c) => !c.recording_url)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.client_name || "Aluno"} — {c.product_title} ({fmt(c.scheduled_at)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={reprocessMutation.isPending}
                onClick={() =>
                  reprocessMutation.mutate({
                    fileId: row.file_id,
                    consultationId: manual[row.file_id] || null,
                  })
                }
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {manual[row.file_id] ? "Vincular e liberar" : "Reprocessar"}
              </Button>
            </>
          ) : null}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">Entrega automática das gravações</p>
          <p className="text-xs text-muted-foreground">
            Verificação do Google Drive a cada {data?.intervalMinutes ?? 60} minutos · última execução{" "}
            {fmt(data?.lastRunAt)} · próxima {fmt(data?.nextRunAt)}
          </p>
          {data?.job?.last_error ? (
            <p className="mt-1 text-xs text-destructive">Último erro: {data.job.last_error}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button size="sm" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-2 h-3.5 w-3.5" />
            )}
            Executar agora
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Video} label="Encontradas" value={counts?.total ?? 0} />
        <Metric icon={CheckCircle2} label="Vinculadas" value={counts?.linked ?? 0} />
        <Metric icon={Clock} label="Pendentes" value={counts?.pending ?? 0} />
        <Metric icon={AlertTriangle} label="Erros / falhas" value={counts?.failed ?? 0} />
      </div>

      {groups.failed.length ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-destructive">
            <AlertTriangle className="h-4 w-4" /> Erros de identificação / entrega
          </h3>
          {groups.failed.map(renderRow)}
        </section>
      ) : null}

      {groups.unmatched.length ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="h-4 w-4" /> Sem correspondência
          </h3>
          {groups.unmatched.map(renderRow)}
        </section>
      ) : null}

      {groups.pending.length ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-4 w-4" /> Pendentes
          </h3>
          {groups.pending.map(renderRow)}
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> Vinculadas e liberadas
        </h3>
        {groups.linked.length ? (
          groups.linked.map(renderRow)
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma gravação vinculada ainda.</p>
        )}
      </section>
    </div>
  );
}
