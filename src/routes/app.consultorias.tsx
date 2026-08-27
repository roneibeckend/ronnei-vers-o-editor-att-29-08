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
import { Textarea } from "@/components/ui/textarea";
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
  const [briefing, setBriefing] = useState(consultation.briefing ?? "");
  const [editing, setEditing] = useState(false);
  const saveBriefing = useServerFn(submitConsultationBriefing);
  const cancel = useServerFn(cancelMyConsultation);

  const save = useMutation({
    mutationFn: () => saveBriefing({ data: { id: consultation.id, briefing } }),
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
        {consultation.calendar_html_link && (
          <Button asChild size="sm" variant="outline">
            <a href={consultation.calendar_html_link} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Google Agenda
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
  const [briefing, setBriefing] = useState("");
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
    return Array.from(map.entries()).slice(0, 14);
  }, [slots]);

  const submit = useMutation({
    mutationFn: () =>
      book({ data: { productId: product.id, startIso: slot!, briefing: briefing.trim() || undefined } }),
    onSuccess: (res: any) => {
      toast.success(
        res?.meetLink
          ? "Consultoria agendada! O link do Google Meet foi enviado por e-mail."
          : "Consultoria agendada! Você receberá o link da reunião por e-mail.",
      );
      setSlot(null);
      setBriefing("");
      onBooked();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao agendar."),
  });

  const briefingOk = !product?.briefing_required || briefing.trim().length >= 20;

  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">1. Escolha o horário (horário de Brasília)</p>
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum horário disponível no momento. Tente novamente em alguns dias.
              </p>
            ) : (
              <div className="space-y-3">
                {grouped.map(([date, list]) => (
                  <div key={date}>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      }).format(new Date(`${date}T12:00:00-03:00`))}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((s) => (
                        <Button
                          key={s.startIso}
                          size="sm"
                          variant={slot === s.startIso ? "default" : "outline"}
                          onClick={() => setSlot(s.startIso)}
                        >
                          {s.time}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">
              2. Briefing {product?.briefing_required ? "(obrigatório)" : "(opcional)"}
            </p>
            <Textarea
              rows={5}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Ex.: vendo espetinhos há 6 meses, faturo R$ 8 mil/mês, não sei precificar e minha margem está apertada..."
            />
            <p className="mt-1 text-xs text-muted-foreground">Mínimo de 20 caracteres.</p>
          </div>

          <Button
            className="w-full"
            disabled={!slot || !briefingOk || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar agendamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
