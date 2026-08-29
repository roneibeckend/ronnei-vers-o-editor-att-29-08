import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, TrendingUp, AlertTriangle } from "lucide-react";
import { getFidelizeRevenueSnapshot } from "@/lib/fidelize-metrics.functions";
import { Skeleton } from "@/components/ui/skeleton";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const nextMonthLabel = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export function FidelizeRevenueCard({ className = "" }: { className?: string }) {
  const fetchSnapshot = useServerFn(getFidelizeRevenueSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["fidelize-revenue-snapshot"],
    queryFn: () => fetchSnapshot(),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <Skeleton className={`h-64 w-full rounded-xl bg-white/5 ${className}`} />;
  if (!data) return null;

  return (
    <div className={`rounded-xl border border-white/5 bg-[#111] p-4 sm:p-6 ${className}`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight sm:text-base">
          <CreditCard className="h-4 w-4 text-[#ff6a00]" />
          Fidelize · Assinaturas
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Recorrência</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-2xl font-bold">{data.activeCustomers}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">Clientes ativos</p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-2xl font-bold text-emerald-400">{money(data.monthlyProjection)}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
            Projeção {nextMonthLabel()}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-2xl font-bold">{money(data.averageTicket)}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">Ticket médio</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {data.byPlan.map((p) => (
          <div key={p.plan} className="flex items-center justify-between text-xs">
            <span className="text-white/60">
              {p.label} · {p.activeCount} × {money(p.price)}
            </span>
            <span className="font-semibold text-white/80">{money(p.monthly)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-white/5 pt-4 text-[11px] text-white/40">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          {data.newThisMonth} novas neste mês
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          {data.overdueCustomers} em atraso ({money(data.overdueValue)})
        </span>
        <span>{data.canceledCustomers} canceladas</span>
      </div>
    </div>
  );
}
