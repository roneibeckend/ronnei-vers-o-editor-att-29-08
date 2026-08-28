import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/platform/Shell";
import { listMyConsultations } from "@/lib/consultations.functions";
import { ConsultationBriefingSummary } from "@/components/platform/ConsultationBriefingSummary";
import { consultationCalendarUrl } from "@/lib/google-calendar-link";
import { VideoPlayer } from "@/components/platform/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock,
  Video,
  ExternalLink,
  PlayCircle,
  FileText,
  Paperclip,
  Loader2,
  MessageSquareQuote,
  ListChecks,
} from "lucide-react";
import type { ConsultationBriefing } from "@/lib/consultation-briefing";

export const Route = createFileRoute("/app/minhas-consultorias")({
  head: () => ({
    meta: [
      { title: "Minhas consultorias — Ronnei na Veia" },
      {
        name: "description",
        content:
          "Acompanhe suas consultorias: horário, link da reunião, briefing enviado, observações do Ronnei, gravação e materiais complementares.",
      },
      { property: "og:title", content: "Minhas consultorias" },
      {
        property: "og:description",
        content: "Status, link do Meet, gravação e materiais das suas consultorias em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyConsultationsPage,
});

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Aguardando pagamento", variant: "outline" },
  scheduled: { label: "Agendada", variant: "default" },
  completed: { label: "Concluída", variant: "secondary" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  no_show: { label: "Não compareceu", variant: "destructive" },
};

type Material = { title: string; url: string };

function MaterialsList({ materials }: { materials: Material[] }) {
  if (!materials.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" /> Materiais complementares
      </p>
      <ul className="space-y-1.5">
        {materials.map((m, i) => (
          <li key={`${m.url}-${i}`}>
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <FileText className="h-4 w-4" />
              {m.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsultationCard({ row }: { row: any }) {
  const [showRecording, setShowRecording] = useState(false);
  const status = STATUS[row.status] ?? { label: row.status, variant: "outline" as const };
  const materials: Material[] = Array.isArray(row.materials) ? row.materials : [];
  const isUpcoming = row.status === "scheduled" && +new Date(row.scheduled_at) > Date.now();

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{row.product_title}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" />
            {dateBR(row.scheduled_at)} · {row.duration_minutes} min
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={status.variant}>{status.label}</Badge>
          {row.amount ? <span className="text-xs text-muted-foreground">{money(row.amount)}</span> : null}
        </div>
      </div>

      {row.status === "cancelled" && row.cancel_reason ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{row.cancel_reason}</p>
      ) : null}

      {isUpcoming && row.meet_link ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild className="flex-1 sm:flex-none">
            <a href={row.meet_link} target="_blank" rel="noopener noreferrer">
              <Video className="mr-2 h-4 w-4" /> Entrar na reunião
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={consultationCalendarUrl(row)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> Adicionar ao Google Agenda
            </a>
          </Button>
        </div>
      ) : null}

      {row.action_plan ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <ListChecks className="h-3.5 w-3.5" /> Plano de ação
          </p>
          <p className="whitespace-pre-wrap text-sm">{row.action_plan}</p>
        </div>
      ) : null}

      {row.student_notes ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <MessageSquareQuote className="h-3.5 w-3.5" /> Observações do Ronnei
          </p>
          <p className="whitespace-pre-wrap text-sm">{row.student_notes}</p>
        </div>
      ) : null}

      {row.recording_url ? (
        <div className="space-y-3">
          {showRecording ? (
            <VideoPlayer
              src={row.recording_url}
              videoId={`consult-${row.id}`}
              title={`Gravação — ${row.product_title}`}
              className="overflow-hidden rounded-lg"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant={showRecording ? "outline" : "default"} onClick={() => setShowRecording((v) => !v)}>
              <PlayCircle className="mr-2 h-4 w-4" />
              {showRecording ? "Fechar gravação" : "Assistir gravação"}
            </Button>
            <Button asChild variant="outline">
              <a href={row.recording_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir no Drive
              </a>
            </Button>
          </div>
        </div>
      ) : row.status === "completed" ? (
        <p className="text-sm text-muted-foreground">
          A gravação será liberada aqui assim que estiver disponível.
        </p>
      ) : null}

      <MaterialsList materials={materials} />

      {row.briefing_data ? (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm font-medium">Briefing enviado</summary>
          <div className="mt-3">
            <ConsultationBriefingSummary data={row.briefing_data as ConsultationBriefing} fallback={row.briefing} />
          </div>
        </details>
      ) : row.briefing ? (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm font-medium">Briefing enviado</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.briefing}</p>
        </details>
      ) : null}
    </Card>
  );
}

function MyConsultationsPage() {
  const fetchMine = useServerFn(listMyConsultations);
  const { data, isLoading } = useQuery({ queryKey: ["my-consultations"], queryFn: () => fetchMine() });

  const rows = (data ?? []) as any[];
  const upcoming = rows.filter((r) => r.status === "scheduled" || r.status === "pending_payment");
  const past = rows.filter((r) => !["scheduled", "pending_payment"].includes(r.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas consultorias"
        subtitle="Reuniões agendadas, gravações, observações e materiais liberados pelo Ronnei."
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas consultorias...
        </div>
      ) : rows.length === 0 ? (
        <Card className="space-y-3 p-6 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não possui consultorias.</p>
          <Button asChild>
            <Link to="/app/consultorias">Ver consultorias disponíveis</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {upcoming.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximas</h2>
              {upcoming.map((row) => (
                <ConsultationCard key={row.id} row={row} />
              ))}
            </section>
          ) : null}

          {past.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Histórico</h2>
              {past.map((row) => (
                <ConsultationCard key={row.id} row={row} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
