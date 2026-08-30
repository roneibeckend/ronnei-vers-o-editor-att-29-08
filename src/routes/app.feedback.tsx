import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/platform/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarCheck, Clock, Loader2, Video, X } from "lucide-react";
import {
  listMyFollowups,
  getFollowupSlots,
  scheduleFollowup,
  cancelFollowup,
} from "@/lib/consultation-followups.functions";

export const Route = createFileRoute("/app/feedback")({
  head: () => ({
    meta: [
      { title: "Reunião de feedback — Ronnei na Veia" },
      {
        name: "description",
        content:
          "Agende a reunião de feedback de 30 minutos, 30 dias após a sua consultoria, e mostre os resultados da aplicação do método.",
      },
      { property: "og:title", content: "Reunião de feedback pós-consultoria" },
      {
        property: "og:description",
        content: "Escolha um horário livre de 30 minutos e receba o link da videochamada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeedbackPage,
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

const dayBR = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00-03:00`));

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  pending: { label: "Aguardando agendamento", variant: "secondary" },
  scheduled: { label: "Agendado", variant: "default" },
  completed: { label: "Concluído", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "outline" },
};

function FeedbackPage() {
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState<any | null>(null);
  const fetchFollowups = useServerFn(listMyFollowups);

  const { data: followups, isLoading } = useQuery({
    queryKey: ["my-followups"],
    queryFn: () => fetchFollowups(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-followups"] });

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-500">
      <PageHeader
        title="Reunião de feedback"
        subtitle="30 dias depois da consultoria, uma conversa de 30 minutos para revisar o que você aplicou."
      />

      {!followups?.length ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Assim que uma consultoria for concluída, a sua reunião de feedback aparece aqui.
        </Card>
      ) : (
        <div className="space-y-3">
          {followups.map((f: any) => {
            const status = STATUS[f.status] ?? { label: f.status, variant: "outline" as const };
            return (
              <Card key={f.id} className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold leading-tight sm:text-lg">
                      {f.consultationTitle}
                    </h3>
                    {f.consultationDate && (
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Consultoria realizada em {dateBR(f.consultationDate)}
                      </p>
                    )}
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                {f.status === "scheduled" && f.meetingDate ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <CalendarCheck className="h-4 w-4 text-primary" />
                      {dateBR(f.meetingDate)} · 30 minutos
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.meetLink && (
                        <Button asChild size="sm">
                          <a href={f.meetLink} target="_blank" rel="noreferrer">
                            <Video className="mr-2 h-4 w-4" /> Entrar na reunião
                          </a>
                        </Button>
                      )}
                      <CancelButton followupId={f.id} onDone={refresh} />
                    </div>
                  </div>
                ) : f.status === "completed" ? (
                  <p className="text-sm text-muted-foreground">
                    Reunião de feedback concluída. Obrigado pelo retorno!
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 text-primary" />
                      {f.available
                        ? "Liberado: escolha o melhor horário."
                        : `Liberado em ${f.daysLeft} dia${f.daysLeft === 1 ? "" : "s"} (${dayBR(f.followupDate)}).`}
                    </p>
                    <Button className="w-full sm:w-auto" disabled={!f.available} onClick={() => setBooking(f)}>
                      <CalendarCheck className="mr-2 h-4 w-4" />
                      Agendar feedback
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <FollowupBookingDialog followup={booking} onClose={() => setBooking(null)} onBooked={refresh} />
    </div>
  );
}

function CancelButton({ followupId, onDone }: { followupId: string; onDone: () => void }) {
  const cancel = useServerFn(cancelFollowup);
  const mutation = useMutation({
    mutationFn: () => cancel({ data: { followupId } }),
    onSuccess: () => {
      toast.success("Reunião cancelada. Você pode escolher outro horário.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar."),
  });

  return (
    <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
      Cancelar
    </Button>
  );
}

function FollowupBookingDialog({
  followup,
  onClose,
  onBooked,
}: {
  followup: any | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const fetchSlots = useServerFn(getFollowupSlots);
  const book = useServerFn(scheduleFollowup);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["followup-slots"],
    queryFn: () => fetchSlots(),
    enabled: Boolean(followup),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of (slots ?? []) as any[]) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  const times = grouped.find(([d]) => d === selectedDate)?.[1] ?? [];

  const submit = useMutation({
    mutationFn: (startIso: string) => book({ data: { followupId: followup.id, startIso } }),
    onSuccess: () => {
      toast.success("Feedback agendado! O convite foi enviado por e-mail.");
      setSelectedDate(null);
      onBooked();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao agendar."),
  });

  return (
    <Dialog
      open={Boolean(followup)}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedDate(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolha o horário (30 min)</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum horário livre no momento. Tente novamente mais tarde.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Dia</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {grouped.slice(0, 12).map(([date, list]) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`rounded-xl border p-3 text-left text-sm transition ${
                      selectedDate === date ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="block font-semibold capitalize">{dayBR(date)}</span>
                    <span className="text-xs text-muted-foreground">{list.length} horários</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedDate && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Horário</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {times.map((slot: any) => (
                    <Button
                      key={slot.startIso}
                      variant="outline"
                      size="sm"
                      disabled={submit.isPending}
                      onClick={() => submit.mutate(slot.startIso)}
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {submit.isPending && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirmando o agendamento...
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
