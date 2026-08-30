import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarCheck, CheckCircle2, Clock, TrendingUp, Users } from "lucide-react";
import { listFollowupsAdmin, updateFollowupResult } from "@/lib/consultation-followups.functions";

export const Route = createFileRoute("/admin/acompanhamentos")({
  head: () => ({
    meta: [
      { title: "Acompanhamentos pós-consultoria — Admin" },
      {
        name: "description",
        content:
          "Painel dos feedbacks pós-consultoria: pendentes, agendados, concluídos, taxa de comparecimento e de implementação do método.",
      },
      { property: "og:title", content: "Acompanhamentos pós-consultoria" },
      { property: "og:description", content: "Gestão das reuniões de feedback de 30 dias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FollowupsAdminPage,
});

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const TABS = [
  { key: "pending", label: "Pendentes" },
  { key: "scheduled", label: "Agendados" },
  { key: "completed", label: "Concluídos" },
] as const;

function FollowupsAdminPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const fetchList = useServerFn(listFollowupsAdmin);
  const saveResult = useServerFn(updateFollowupResult);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-followups"],
    queryFn: () => fetchList(),
  });

  const update = useMutation({
    mutationFn: (payload: any) => saveResult({ data: payload }),
    onSuccess: () => {
      toast.success("Resultado salvo.");
      queryClient.invalidateQueries({ queryKey: ["admin-followups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const metrics = data?.metrics;
  const items = (data?.items ?? []).filter((i: any) => i.status === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black">Acompanhamentos pós-consultoria</h1>
        <p className="text-sm text-muted-foreground">
          Reuniões de feedback de 30 minutos, liberadas 30 dias após cada consultoria realizada.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric icon={Clock} label="Pendentes" value={metrics?.pending ?? 0} />
        <Metric icon={CalendarCheck} label="Agendados" value={metrics?.scheduled ?? 0} />
        <Metric icon={CheckCircle2} label="Concluídos" value={metrics?.completed ?? 0} />
        <Metric
          icon={Users}
          label="Comparecimento"
          value={metrics?.attendanceRate === null || metrics?.attendanceRate === undefined ? "—" : `${metrics.attendanceRate}%`}
        />
        <Metric
          icon={TrendingUp}
          label="Implementação"
          value={
            metrics?.implementationRate === null || metrics?.implementationRate === undefined
              ? "—"
              : `${metrics.implementationRate}%`
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum registro nesta aba.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <Card key={item.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold leading-tight">{item.studentName}</p>
                  <p className="text-xs text-muted-foreground">{item.studentEmail}</p>
                  <p className="mt-1 text-sm">{item.consultationTitle}</p>
                  {item.consultationDate && (
                    <p className="text-xs text-muted-foreground">
                      Consultoria: {dateBR(item.consultationDate)}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <Badge variant="secondary">Feedback: {item.followupDate}</Badge>
                  {item.meetingDate && <p className="mt-1">Reunião: {dateBR(item.meetingDate)}</p>}
                </div>
              </div>

              {(item.status === "scheduled" || item.status === "completed") && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={item.attended === true ? "default" : "outline"}
                    onClick={() => update.mutate({ followupId: item.id, attended: true, status: "completed" })}
                  >
                    Compareceu
                  </Button>
                  <Button
                    size="sm"
                    variant={item.attended === false ? "default" : "outline"}
                    onClick={() => update.mutate({ followupId: item.id, attended: false, status: "completed" })}
                  >
                    Faltou
                  </Button>
                  <Button
                    size="sm"
                    variant={item.methodImplemented === true ? "default" : "outline"}
                    onClick={() => update.mutate({ followupId: item.id, methodImplemented: true })}
                  >
                    Aplicou o método
                  </Button>
                  <Button
                    size="sm"
                    variant={item.methodImplemented === false ? "default" : "outline"}
                    onClick={() => update.mutate({ followupId: item.id, methodImplemented: false })}
                  >
                    Não aplicou
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black">{value}</p>
    </Card>
  );
}
