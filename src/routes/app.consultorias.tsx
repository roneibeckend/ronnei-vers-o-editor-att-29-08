import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/platform/Shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listConsultationProducts,
  getConsultationSlots,
  bookConsultation,
  listMyConsultations,
  submitConsultationBriefing,
  cancelMyConsultation,
} from "@/lib/consultations.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsultationBriefingForm } from "@/components/platform/ConsultationBriefingForm";
import { ConsultationBriefingSummary } from "@/components/platform/ConsultationBriefingSummary";
import type { ConsultationBriefing } from "@/lib/consultation-briefing";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, Loader2, Video, FileText, History, ExternalLink, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/app/consultorias")({
  head: () => ({
    meta: [
      { title: "Consultorias com o Ronnei — Ronnei na Veia" },
      {
        name: "description",
        content:
          "Agende uma consultoria individual por videochamada com o Ronnei: precificação, cardápio, operação e plano de crescimento do seu negócio de espetinhos.",
      },
      { property: "og:title", content: "Consultorias com o Ronnei" },
      {
        property: "og:description",
        content: "Escolha a duração, agende o horário e receba o link do Google Meet automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConsultationsPage,
});

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

function ConsultationsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["consultation-products"],
    queryFn: () => listConsultationProducts(),
  });

  const { data: history } = useQuery({
    queryKey: ["my-consultations"],
    queryFn: () => listMyConsultations(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["my-consultations"] });
    queryClient.invalidateQueries({ queryKey: ["consultation-slots"] });
  };

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const available = (products ?? []).filter((p: any) => p.status === "active");
  const soon = (products ?? []).filter((p: any) => p.status === "coming_soon");

  return (
    <div className="animate-in fade-in space-y-10 duration-500">
      <PageHeader
        title="Consultorias"
        subtitle="Uma conversa individual por videochamada com o Ronnei para destravar o seu negócio."
      />

      {available.length === 0 && soon.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          As consultorias serão liberadas em breve. Fique de olho na sua área de membros.
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {available.map((p: any) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Video className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {p.duration_minutes} minutos
              </span>
            </div>
            <h3 className="font-display text-lg font-bold leading-tight">{p.title}</h3>
            {p.subtitle && <p className="text-sm text-muted-foreground">{p.subtitle}</p>}
            {p.description && <p className="text-sm text-muted-foreground/90">{p.description}</p>}
            <div className="mt-auto space-y-3 pt-2">
              <p className="font-display text-xl font-bold">{money(p.price)}</p>
              <Button className="w-full" onClick={() => setSelected(p)}>
                <Calendar className="mr-2 h-4 w-4" />
                Escolher horário
              </Button>
            </div>
          </Card>
        ))}

        {soon.map((p: any) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5 opacity-75">
            <Badge variant="secondary" className="w-fit">
              EM BREVE
            </Badge>
            <h3 className="font-display text-lg font-bold leading-tight">{p.title}</h3>
            {p.subtitle && <p className="text-sm text-muted-foreground">{p.subtitle}</p>}
            <p className="mt-auto text-sm text-muted-foreground">Lançamento em breve.</p>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <History className="h-5 w-5 text-primary" />
          Minhas reuniões
        </h2>

        {!history?.length ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Você ainda não tem consultorias agendadas.
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((c: any) => (
              <ConsultationCard key={c.id} consultation={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <BookingDialog product={selected} onClose={() => setSelected(null)} onBooked={refresh} />
    </div>
  );
}

function ConsultationCard({ consultation, onChanged }: { consultation: any; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const saveBriefing = useServerFn(submitConsultationBriefing);
  const cancel = useServerFn(cancelMyConsultation);

  const save = useMutation({
    mutationFn: (value: ConsultationBriefing) => saveBriefing({ data: { id: consultation.id, briefingData: value } }),
    onSuccess: () => {
      toast.success("Briefing salvo. O Ronnei vai chegar preparado.");
      setEditing(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar o briefing."),
  });

  const drop = useMutation({
    mutationFn: () => cancel({ data: { id: consultation.id } }),
    onSuccess: () => {
      toast.success("Consultoria cancelada.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar."),
  });

  const isUpcoming = consultation.status === "scheduled";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{consultation.product_title}</h3>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {dateBR(consultation.scheduled_at)} · {consultation.duration_minutes} min
          </p>
        </div>
        <Badge variant={isUpcoming ? "default" : "secondary"}>
          {STATUS_LABEL[consultation.status] ?? consultation.status}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {isUpcoming && consultation.meet_link && (
          <Button asChild size="sm">
            <a href={consultation.meet_link} target="_blank" rel="noreferrer">
              <Video className="mr-2 h-4 w-4" />
              Entrar na reunião
            </a>
          </Button>
        )}
        {consultation.recording_url && (
          <Button asChild size="sm" variant="secondary">
            <a href={consultation.recording_url} target="_blank" rel="noreferrer">
              <PlayCircle className="mr-2 h-4 w-4" />
              Ver gravação
            </a>
          </Button>
        )}
        {isUpcoming && (
          <Button asChild size="sm" variant="outline">
            <a href={consultationCalendarUrl(consultation)} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Adicionar ao Google Agenda
            </a>
          </Button>
        )}
        {isUpcoming && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
              <FileText className="mr-2 h-4 w-4" />
              {consultation.briefing ? "Editar briefing" : "Preencher briefing"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={drop.isPending}
              onClick={() => drop.mutate()}
            >
              Cancelar
            </Button>
          </>
        )}
      </div>

      {isUpcoming && !consultation.briefing && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Briefing pendente — preencha antes da reunião para não perder tempo.
        </p>
      )}

      {editing ? (
        <ConsultationBriefingForm
          initial={consultation.briefing_data}
          submitting={save.isPending}
          onSubmit={(value) => save.mutate(value)}
        />
      ) : (
        <ConsultationBriefingSummary data={consultation.briefing_data} fallback={consultation.briefing} />
      )}
    </Card>
  );
}

function BookingDialog({
  product,
  onClose,
  onBooked,
}: {
  product: any | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [slot, setSlot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleDays, setVisibleDays] = useState(3);
  const [expandedTimes, setExpandedTimes] = useState(false);
  const book = useServerFn(bookConsultation);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["consultation-slots", product?.duration_minutes],
    queryFn: () => getConsultationSlots({ data: { durationMinutes: product.duration_minutes } }),
    enabled: Boolean(product),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of slots ?? []) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    // Oculta dias totalmente lotados (sem horários)
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [slots]);

  const dayList = grouped.slice(0, visibleDays);
  const activeDay = grouped.find(([d]) => d === selectedDate);
  const times = activeDay ? activeDay[1] : [];
  const visibleTimes = expandedTimes ? times : times.slice(0, 5);
  const suggested = grouped[0]?.[1]?.[0]?.startIso ?? null;

  const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(
      new Date(`${date}T12:00:00-03:00`),
    );

  const submit = useMutation({
    mutationFn: (value?: ConsultationBriefing) =>
      book({ data: { productId: product.id, startIso: slot!, briefingData: value } }),
    onSuccess: (res: any) => {
      toast.success(
        res?.meetLink
          ? "Consultoria agendada! O link do Google Meet foi enviado por e-mail."
          : "Consultoria agendada! Você receberá o link da reunião por e-mail.",
      );
      setSlot(null);
      setSelectedDate(null);
      onBooked();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao agendar."),
  });

  const step = slot ? 3 : selectedDate ? 2 : 1;

  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum horário disponível no momento. Tente novamente em alguns dias.
            </p>
          ) : step === 1 ? (
            <div>
              <p className="mb-1 text-sm font-semibold">Escolha a data</p>
              <p className="mb-3 text-xs text-muted-foreground">Horário de Brasília</p>
              <div className="grid grid-cols-3 gap-2">
                {dayList.map(([date, list]) => {
                  const isSuggested = list[0]?.startIso === suggested;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        setSelectedDate(date);
                        setExpandedTimes(false);
                      }}
                      className={`flex min-h-20 flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        isSuggested
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/60"
                      }`}
                    >
                      <span className="text-[11px] uppercase text-muted-foreground">
                        {fmtDay(date, { weekday: "short" })}
                      </span>
                      <span className="text-lg font-bold leading-tight">
                        {fmtDay(date, { day: "2-digit" })}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {fmtDay(date, { month: "short" })}
                      </span>
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {list.length} horário{list.length > 1 ? "s" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visibleDays < grouped.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setVisibleDays((v) => v + 3)}
                >
                  Ver mais datas
                </Button>
              )}
            </div>
          ) : step === 2 ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {fmtDay(selectedDate!, { weekday: "long", day: "2-digit", month: "long" })}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelectedDate(null)}
                >
                  Trocar data
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {visibleTimes.map((s: any) => (
                  <Button
                    key={s.startIso}
                    variant={s.startIso === suggested ? "default" : "outline"}
                    onClick={() => setSlot(s.startIso)}
                  >
                    {s.time}
                  </Button>
                ))}
              </div>
              {!expandedTimes && times.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setExpandedTimes(true)}
                >
                  Ver mais horários
                </Button>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {fmtDay(selectedDate!, { weekday: "short", day: "2-digit", month: "short" })} ·{" "}
                  {times.find((s: any) => s.startIso === slot)?.time}
                </p>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSlot(null)}>
                  Trocar horário
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Responda em etapas curtas para o Ronnei chegar preparado na sua reunião.
              </p>
              <ConsultationBriefingForm
                submitting={submit.isPending}
                submitLabel="Confirmar agendamento"
                onSubmit={(value) => submit.mutate(value)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
