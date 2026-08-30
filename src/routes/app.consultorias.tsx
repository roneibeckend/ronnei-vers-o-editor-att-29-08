import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/platform/Shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { gtmBeginCheckout, gtmPurchase, gtmConsultationScheduled } from "@/lib/gtm";
import {
  listConsultationProducts,
  getConsultationSlots,
  reserveConsultation,
  getConsultationReservation,
  listMyConsultations,
  submitConsultationBriefing,
  cancelMyConsultation,
  rescheduleMyConsultation,
  confirmMyAttendance,
  getMyReschedulePolicy,



} from "@/lib/consultations.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsultationBriefingForm } from "@/components/platform/ConsultationBriefingForm";
import { ConsultationBriefingSummary } from "@/components/platform/ConsultationBriefingSummary";
import type { ConsultationBriefing } from "@/lib/consultation-briefing";
import { consultationCalendarUrl } from "@/lib/google-calendar-link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, Loader2, Video, FileText, History, ExternalLink, PlayCircle, CreditCard, Timer, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/consultorias")({
  validateSearch: (search: Record<string, unknown>): { credito?: string } =>
    typeof search.credito === "string" ? { credito: search.credito } : {},
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
  awaiting_payment: "Aguardando pagamento",
  pending_payment: "Aguardando pagamento",
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

function ConsultationsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [activeCreditId, setActiveCreditId] = useState<string | null>(null);
  const { credito } = Route.useSearch();

  const { data: products, isLoading } = useQuery({
    queryKey: ["consultation-products"],
    queryFn: () => listConsultationProducts(),
  });

  const { data: history } = useQuery({
    queryKey: ["my-consultations"],
    queryFn: () => listMyConsultations(),
  });

  // Créditos de consultoria já pagos (compra pelo checkout/upsell) aguardando agendamento.
  const { data: credits } = useQuery({
    queryKey: ["consultation-credits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultation_credits")
        .select("id, product_id, product_title, amount, created_at")
        .eq("status", "available")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["my-consultations"] });
    queryClient.invalidateQueries({ queryKey: ["consultation-slots"] });
    queryClient.invalidateQueries({ queryKey: ["consultation-credits"] });
  };

  const startWithCredit = (credit: any) => {
    const product = (products ?? []).find((p: any) => p.id === credit.product_id);
    if (!product) {
      toast.error("Consultoria indisponível no momento. Fale com o suporte.");
      return;
    }
    setActiveCreditId(credit.id);
    setSelected(product);
  };

  // Chegando do checkout com ?credito=..., já abre o agendamento.
  useEffect(() => {
    if (!credito || !credits?.length || !products?.length || selected) return;
    const credit = credits.find((c: any) => c.id === credito);
    if (credit) startWithCredit(credit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credito, credits, products]);

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

      {(credits ?? []).length > 0 && (
        <section className="space-y-3">
          {(credits ?? []).map((credit: any) => (
            <Card
              key={credit.id}
              className="flex flex-col gap-3 border-primary/40 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <Badge className="w-fit">Consultoria paga</Badge>
                <h3 className="font-display text-lg font-bold leading-tight">{credit.product_title}</h3>
                <p className="text-sm text-muted-foreground">
                  Pagamento confirmado. Escolha o horário e preencha o briefing para confirmar sua agenda.
                </p>
              </div>
              <Button onClick={() => startWithCredit(credit)}>
                <Calendar className="mr-2 h-4 w-4" />
                Escolher horário
              </Button>
            </Card>
          ))}
        </section>
      )}


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

      <BookingDialog
        product={selected}
        creditId={activeCreditId}
        onClose={() => {
          setSelected(null);
          setActiveCreditId(null);
        }}
        onBooked={refresh}
      />
    </div>
  );
}

function ConsultationCard({ consultation, onChanged }: { consultation: any; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
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
  const isAwaitingPayment = consultation.status === "awaiting_payment";
  const isNoShow = consultation.status === "no_show";
  const cancelledByConsultant =
    consultation.status === "cancelled" && consultation.cancelled_by === "admin";
  const canReschedule = isUpcoming || isNoShow || cancelledByConsultant;

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
        <Badge variant={isUpcoming ? "default" : isAwaitingPayment ? "outline" : "secondary"}>
          {STATUS_LABEL[consultation.status] ?? consultation.status}
        </Badge>
      </div>

      {isAwaitingPayment && (
        <div className="space-y-3">
          <HoldCountdown deadline={consultation.hold_expires_at} />
          <p className="text-sm text-muted-foreground">
            Conclua o pagamento para confirmar a reunião. Sem o pagamento, o horário volta para a agenda.
          </p>
          <div className="flex flex-wrap gap-2">
            {consultation.payment_url && (
              <Button asChild size="sm">
                <a href={consultation.payment_url} target="_blank" rel="noreferrer">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagar agora
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={drop.isPending}
              onClick={() => drop.mutate()}
            >
              Cancelar reserva
            </Button>
          </div>
        </div>
      )}

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
        {!isUpcoming && canReschedule && (
          <Button size="sm" variant="outline" onClick={() => setRescheduling(true)}>
            <Calendar className="mr-2 h-4 w-4" />
            Escolher novo horário
          </Button>
        )}
        {isUpcoming && (
          <>
            <AttendanceButton consultation={consultation} onDone={onChanged} />
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
              <FileText className="mr-2 h-4 w-4" />
              {consultation.briefing ? "Editar briefing" : "Preencher briefing"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRescheduling(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              Reagendar
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

      {isNoShow && (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600">
          Este encontro foi marcado como falta. Você pode escolher um novo horário — como não houve aviso
          prévio, a remarcação tem taxa. Se aconteceu um imprevisto, fale com o suporte.
        </p>
      )}

      {cancelledByConsultant && (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600">
          Precisamos cancelar este encontro
          {consultation.cancel_reason ? ` (${consultation.cancel_reason})` : ""}. Você pode remarcar sem
          nenhuma taxa ou falar com o suporte para tratar outra solução.
        </p>
      )}

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

      <RescheduleDialog
        consultation={consultation}
        open={rescheduling}
        onClose={() => setRescheduling(false)}
        onDone={onChanged}
      />
    </Card>
  );
}

/** Confirmação de presença em 1 clique (mesma ação do e-mail de 24h antes). */
function AttendanceButton({ consultation, onDone }: { consultation: any; onDone: () => void }) {
  const confirm = useServerFn(confirmMyAttendance);
  const mutation = useMutation({
    mutationFn: () => confirm({ data: { id: consultation.id } }),
    onSuccess: () => {
      toast.success("Presença confirmada. Nos vemos no horário marcado!");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível confirmar."),
  });

  if (consultation.attendance_confirmed_at) {
    return (
      <Badge variant="secondary" className="gap-1 self-center">
        <ShieldCheck className="h-3.5 w-3.5" />
        Presença confirmada
      </Badge>
    );
  }

  return (
    <Button size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
      Confirmar presença
    </Button>
  );
}


/** Reagenda um encontro específico mantendo a mesma compra. */
function RescheduleDialog({
  consultation,
  open,
  onClose,
  onDone,
}: {
  consultation: any;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const reschedule = useServerFn(rescheduleMyConsultation);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["consultation-slots", consultation.duration_minutes],
    queryFn: () => getConsultationSlots({ data: { durationMinutes: consultation.duration_minutes } }),
    enabled: open,
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

  const policyFn = useServerFn(getMyReschedulePolicy);
  const { data: policy } = useQuery({
    queryKey: ["reschedule-policy", consultation.id],
    queryFn: () => policyFn({ data: { id: consultation.id } }),
    enabled: open,
  });

  const move = useMutation({
    mutationFn: (startIso: string) => reschedule({ data: { id: consultation.id, startIso } }),
    onSuccess: (result: any) => {
      if (result?.requiresPayment) {
        toast.info(`Taxa de ${result.amountLabel} gerada. Finalize o pagamento para confirmar o novo horário.`);
        window.open(result.paymentUrl, "_blank", "noopener");
      } else {
        toast.success("Encontro reagendado. Enviamos o novo horário e o link do Meet por e-mail.");
      }
      onClose();
      setDate(null);
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reagendar."),
  });

  const times = grouped.find(([d]) => d === date)?.[1] ?? [];
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(
      new Date(`${d}T12:00:00-03:00`),
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reagendar encontro</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Horário atual: <span className="font-medium text-foreground">{dateBR(consultation.scheduled_at)}</span>
          {" · "}
          {consultation.duration_minutes} min. A compra e os demais encontros do combo permanecem os mesmos.
        </p>

        {policy && (
          <div
            className={`rounded-md p-3 text-sm ${
              policy.requiresFee ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"
            }`}
          >
            {policy.requiresFee ? (
              <>
                <CreditCard className="mr-1 inline h-4 w-4" />
                {policy.reason === "no_show"
                  ? "Como você faltou sem avisar, esta remarcação tem taxa de "
                  : "Você já usou a remarcação de cortesia deste pedido. Esta remarcação tem taxa de "}
                <strong>{policy.feeLabel}</strong> — o novo horário fica reservado após o pagamento.
              </>
            ) : policy.reason === "consultant_cancelled" ? (
              <>
                <ShieldCheck className="mr-1 inline h-4 w-4" />
                O cancelamento partiu da nossa parte — esta remarcação é <strong>gratuita</strong>.
              </>
            ) : (
              <>
                <ShieldCheck className="mr-1 inline h-4 w-4" />
                Você ainda tem <strong>1 remarcação gratuita</strong> neste pedido. Da próxima em diante,
                a remarcação tem taxa de <strong>{policy.feeLabel}</strong>.
              </>
            )}
          </div>
        )}

        {policy?.pendingPaymentUrl && (
          <a
            href={policy.pendingPaymentUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md bg-primary/10 p-3 text-sm font-medium text-primary underline"
          >
            Há uma taxa de remarcação aguardando pagamento — finalizar agora
          </a>
        )}


        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum horário disponível no momento.</p>
        ) : !date ? (
          <div className="grid grid-cols-3 gap-2">
            {grouped.slice(0, 9).map(([d, list]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-border p-3 text-center transition hover:border-primary/60"
              >
                <span className="text-[11px] uppercase text-muted-foreground">{fmtDay(d, { weekday: "short" })}</span>
                <span className="text-lg font-bold leading-tight">{fmtDay(d, { day: "2-digit" })}</span>
                <span className="text-[11px] text-muted-foreground">{fmtDay(d, { month: "short" })}</span>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {list.length} horário{list.length > 1 ? "s" : ""}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">
                {fmtDay(date, { weekday: "long", day: "2-digit", month: "long" })}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setDate(null)}>
                Trocar data
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {times.map((s: any) => (
                <Button
                  key={s.startIso}
                  variant="outline"
                  disabled={move.isPending}
                  onClick={() => move.mutate(s.startIso)}
                >
                  {move.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : s.time}
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function useCountdown(deadline: string | null | undefined) {
  const [left, setLeft] = useState(() => (deadline ? +new Date(deadline) - Date.now() : 0));

  useEffect(() => {
    if (!deadline) return;
    setLeft(+new Date(deadline) - Date.now());
    const id = setInterval(() => setLeft(+new Date(deadline) - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const total = Math.max(0, Math.floor(left / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return { expired: deadline ? left <= 0 : false, label: `${mm}:${ss}`, msLeft: left };
}

function HoldCountdown({ deadline }: { deadline: string | null | undefined }) {
  const { expired, label } = useCountdown(deadline);
  if (!deadline) return null;
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
        expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
      }`}
    >
      <Timer className="h-4 w-4" />
      {expired ? "Reserva expirada — o horário foi liberado." : `Horário reservado por ${label}`}
    </div>
  );
}

function BookingDialog({
  product,
  onClose,
  onBooked,
  creditId,
}: {
  product: any | null;
  onClose: () => void;
  onBooked: () => void;
  /** Crédito já pago (upsell): dispensa novo pagamento nesta reserva. */
  creditId?: string | null;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleDays, setVisibleDays] = useState(3);
  const [expandedTimes, setExpandedTimes] = useState(false);
  const [briefing, setBriefing] = useState<ConsultationBriefing | null>(null);
  const [reservation, setReservation] = useState<any | null>(null);
  const reserve = useServerFn(reserveConsultation);
  const fetchReservation = useServerFn(getConsultationReservation);

  // Combo: no máximo 1 hora por dia, então uma consultoria de 3h vira 3 encontros.
  const sessionMinutes = Math.min(product?.duration_minutes ?? 60, 60);
  const sessionsTotal = Math.max(1, Math.ceil((product?.duration_minutes ?? 60) / 60));

  const { data: slots, isLoading } = useQuery({
    queryKey: ["consultation-slots", product?.duration_minutes],
    queryFn: () => getConsultationSlots({ data: { durationMinutes: product.duration_minutes } }),
    enabled: Boolean(product),
  });

  const reset = () => {
    setPicked([]);
    setSelectedDate(null);
    setBriefing(null);
    setReservation(null);
    setExpandedTimes(false);
  };

  const pickedDates = useMemo(
    () => new Set(picked.map((iso) => (slots ?? []).find((s: any) => s.startIso === iso)?.date)),
    [picked, slots],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of slots ?? []) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries()).filter(([date, list]) => list.length > 0 && !pickedDates.has(date));
  }, [slots, pickedDates]);

  const dayList = grouped.slice(0, visibleDays);
  const activeDay = grouped.find(([d]) => d === selectedDate);
  const times = activeDay ? activeDay[1] : [];
  const visibleTimes = expandedTimes ? times : times.slice(0, 5);
  const suggested = grouped[0]?.[1]?.[0]?.startIso ?? null;

  const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(
      new Date(`${date}T12:00:00-03:00`),
    );

  const pickTime = (iso: string) => {
    setPicked((prev) => [...prev, iso].sort());
    setSelectedDate(null);
    setExpandedTimes(false);
  };

  // 6. Enviar para checkout — cria a reserva temporária e o link de pagamento.
  const submit = useMutation({
    mutationFn: () =>
      reserve({
        data: {
          productId: product.id,
          startIsos: picked,
          briefingData: briefing ?? undefined,
          creditId: creditId ?? undefined,
        },
      }),
    onSuccess: (res: any) => {
      // Consultoria já paga no checkout: confirma na hora, sem novo pagamento.
      if (res?.status === "scheduled") {
        gtmPurchase({
          productId: product.id,
          productType: "consultation",
          productName: product.title,
          value: Number(res?.amount ?? 0),
          transactionId: String(res?.id ?? ""),
        });
        gtmConsultationScheduled({
          consultationId: String(res?.id ?? ""),
          productName: product.title,
          scheduledAt: res?.scheduledAt,
          sessions: res?.sessionsTotal ?? sessionsTotal,
          transactionId: String(res?.id ?? ""),
        });
        toast.success("Consultoria confirmada! O link do Meet foi enviado por e-mail.");
        onBooked();
        reset();
        onClose();
        return;
      }

      setReservation(res);
      onBooked();
      gtmBeginCheckout({
        productId: product.id,
        productType: "consultation",
        productName: product.title,
        value: Number(res?.amount ?? 0),
        transactionId: res?.paymentLinkId ?? String(res?.id ?? ""),
      });
      if (res?.paymentUrl) window.open(res.paymentUrl, "_blank", "noopener");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar a reserva."),
  });

  // 7. Após pagamento aprovado — o webhook confirma; aqui apenas acompanhamos.
  const { data: liveReservation } = useQuery({
    queryKey: ["consultation-reservation", reservation?.id],
    queryFn: () => fetchReservation({ data: { id: reservation.id } }),
    enabled: Boolean(reservation?.id),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (liveReservation?.status === "scheduled") {
      const orderId =
        (liveReservation as any)?.paymentLinkId ??
        (reservation as any)?.paymentLinkId ??
        String(liveReservation?.id ?? "");
      const orderValue = Number(
        (liveReservation as any)?.amount ?? (reservation as any)?.amount ?? 0,
      );
      gtmPurchase({
        productId: product.id,
        productType: "consultation",
        productName: product.title,
        value: orderValue,
        transactionId: orderId,
      });
      gtmConsultationScheduled({
        consultationId: String(liveReservation?.id ?? ""),
        productName: product.title,
        scheduledAt: (liveReservation as any)?.scheduledAt ?? (liveReservation as any)?.scheduled_at,
        sessions: (liveReservation as any)?.sessionsTotal ?? sessionsTotal,
        transactionId: orderId,
      });
      toast.success("Pagamento aprovado! Sua consultoria está confirmada e o link do Meet foi enviado por e-mail.");
      onBooked();
      reset();
      onClose();
    }
  }, [liveReservation?.status]);

  const holdDeadline = liveReservation?.holdExpiresAt ?? reservation?.holdExpiresAt ?? null;
  const paymentUrl = liveReservation?.paymentUrl ?? reservation?.paymentUrl ?? null;

  const complete = picked.length >= sessionsTotal;
  const step = reservation ? 5 : briefing ? 4 : complete ? 3 : selectedDate ? 2 : 1;


  return (
    <Dialog
      open={Boolean(product)}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {step <= 4 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Etapa {step} de 4 · {["Data", "Horário", "Briefing", "Resumo"][step - 1]}
            </p>
          )}

          {isLoading && step === 1 ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : grouped.length === 0 && step === 1 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum horário disponível no momento. Tente novamente em alguns dias.
            </p>
          ) : step === 1 ? (
            <div>
              <p className="mb-1 text-sm font-semibold">
                {sessionsTotal > 1
                  ? `Escolha a data do encontro ${picked.length + 1} de ${sessionsTotal}`
                  : "Escolha a data"}
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Horário de Brasília
                {sessionsTotal > 1
                  ? ` · ${sessionMinutes} min por dia, em dias diferentes`
                  : ""}
              </p>
              {picked.length > 0 && (
                <div className="mb-3 space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
                  {picked.map((iso, i) => (
                    <p key={iso} className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Encontro {i + 1}: {dateBR(iso)}
                      </span>
                    </p>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => setPicked([])}
                  >
                    Recomeçar seleção
                  </Button>
                </div>
              )}

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
                    onClick={() => pickTime(s.startIso)}
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
          ) : step === 3 ? (
            <div>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5 text-sm font-semibold">
                  {picked.map((iso, i) => (
                    <p key={iso} className="truncate">
                      {sessionsTotal > 1 ? `Encontro ${i + 1}: ` : ""}
                      {dateBR(iso)}
                    </p>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setPicked([])}>
                  Trocar horários
                </Button>
              </div>

              <p className="mb-3 text-xs text-muted-foreground">
                Responda em etapas curtas para o Ronnei chegar preparado na sua reunião.
              </p>
              <ConsultationBriefingForm
                submitLabel="Revisar reserva"
                onSubmit={(value) => setBriefing(value)}
              />
            </div>
          ) : step === 4 ? (
            <div className="space-y-4">
              <Card className="space-y-2 p-4 text-sm">
                <p className="font-display text-base font-bold">Resumo da reserva</p>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Consultoria</span>
                  <span className="text-right font-medium">{product?.title}</span>
                </div>
                <div className="space-y-1 border-t pt-2">
                  <p className="text-muted-foreground">
                    {sessionsTotal > 1 ? `Cronograma (${sessionsTotal} encontros de ${sessionMinutes} min)` : "Data e hora"}
                  </p>
                  {picked.map((iso, i) => (
                    <div key={iso} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {sessionsTotal > 1 ? `Encontro ${i + 1}` : "Horário"}
                      </span>
                      <span className="text-right font-medium">
                        {dateBR(iso)} · {sessionMinutes} min
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Duração</span>
                  <span className="text-right font-medium">
                    {sessionsTotal > 1
                      ? `${product?.duration_minutes} min no total · ${sessionMinutes} min por encontro`
                      : `${product?.duration_minutes} minutos`}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Briefing</span>
                  <span className="font-medium">Preenchido ✓</span>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-display text-lg font-bold">{money(product?.price)}</span>
                </div>
              </Card>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Ao continuar, o horário fica reservado por 30 minutos para você concluir o pagamento. A reunião só
                é confirmada (com Google Meet e e-mail) após a aprovação.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" disabled={submit.isPending} onClick={() => submit.mutate()}>
                  {submit.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Reservar e pagar
                </Button>
                <Button variant="outline" onClick={() => setBriefing(null)}>
                  Editar briefing
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <HoldCountdown deadline={holdDeadline} />

              <Card className="space-y-2 p-4 text-sm">
                <p className="font-display text-base font-bold">Reserva criada</p>
                <p className="text-muted-foreground">{product?.title}</p>

                <div className="space-y-1 border-t pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cronograma
                  </p>
                  {((liveReservation?.sessions ?? reservation.sessions ?? []) as any[]).map((s, i) => (
                    <div key={s.id ?? i} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {(liveReservation?.sessions ?? reservation.sessions ?? []).length > 1
                          ? `Encontro ${s.index ?? i + 1}`
                          : "Horário"}
                      </span>
                      <span className="text-right font-medium">
                        {dateBR(s.scheduledAt)} · {s.durationMinutes ?? sessionMinutes} min
                      </span>
                    </div>
                  ))}
                </div>

                <p className="font-display text-lg font-bold">{money(reservation.amount)}</p>
              </Card>


              {paymentUrl && (
                <Button asChild className="w-full">
                  <a href={paymentUrl} target="_blank" rel="noreferrer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Abrir pagamento
                  </a>
                </Button>
              )}

              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aguardando a confirmação do pagamento. Pode deixar esta tela aberta.
              </p>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Fechar (a reserva continua ativa)
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
