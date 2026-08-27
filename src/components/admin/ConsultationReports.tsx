import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConsultationStats } from "@/lib/consultations-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, CalendarClock } from "lucide-react";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

/** Relatórios do módulo de consultorias: vendas, receita, comparecimento e próximas reuniões. */
export function ConsultationReports() {
  const [days, setDays] = useState(30);
  const statsFn = useServerFn(getConsultationStats);
  const { data, isLoading } = useQuery({
    queryKey: ["consultation-stats", days],
    queryFn: () => statsFn({ data: { days } }),
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  const s = data as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={days === p.days ? "default" : "outline"}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Consultorias vendidas" value={String(s.sold)} hint={`${s.soldInPeriod} no período`} />
        <Metric label="Realizadas" value={String(s.completed)} hint={`${s.noShow} não compareceram`} />
        <Metric label="Receita total" value={money(s.revenueTotal)} />
        <Metric label={`Receita (${s.days} dias)`} value={money(s.revenuePeriod)} />
        <Metric
          label="Taxa de comparecimento"
          value={s.attendanceRate === null ? "—" : `${s.attendanceRate}%`}
          hint="Concluídas ÷ (concluídas + no-show)"
        />
        <Metric label="Aguardando pagamento" value={String(s.pendingPayment)} />
        <Metric label="Canceladas" value={String(s.cancelled)} />
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" /> Próximas reuniões
        </p>
        {s.upcoming?.length ? (
          <div className="space-y-2">
            {s.upcoming.map((u: any) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
                <span className="truncate">
                  {u.client_name || "Aluno"} · {u.product_title}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">{dateBR(u.scheduled_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma reunião agendada.</p>
        )}
      </Card>
    </div>
  );
}
