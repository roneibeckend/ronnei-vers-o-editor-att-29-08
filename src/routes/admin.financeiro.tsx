import { createFileRoute } from "@tanstack/react-router";
import { 
  Calculator, 
  Plus, 
  Trash2, 
  DollarSign, 
  PieChart, 
  LayoutTemplate,
  Info,
  Save,
  Loader2,
  TrendingUp
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

import { getFinancialSummary } from "@/lib/finance.functions";
import {
  getFinancialConfig,
  saveFinancialConfig,
} from "@/lib/financial-config.functions";
import { FinanceOutflowStatement } from "@/components/admin/FinanceOutflowStatement";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Painel Admin" }] }),
  component: FinancePage,
});

const ORANGE = "#ff6a00";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Cost = { id: string; label: string; value: number };
type Partner = { id: string; name: string; percent: number; user_id?: string | null };

function FinancePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<string>(localStorage.getItem("finance-period") || "current-month");
  const [customStartDate, setCustomStartDate] = useState<string>(localStorage.getItem("finance-custom-start") || "");
  const [customEndDate, setCustomEndDate] = useState<string>(localStorage.getItem("finance-custom-end") || "");
  const [revenue, setRevenue] = useState<number>(0);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [configVersion, setConfigVersion] = useState<string | null>(null);

  const fetchFinancialSummary = useServerFn(getFinancialSummary);
  const fetchFinancialConfig = useServerFn(getFinancialConfig);
  const saveFinancialConfigFn = useServerFn(saveFinancialConfig);

  const getDates = (p: string) => {
    const now = new Date();
    switch(p) {
        case "today": return { start: new Date(now.setHours(0,0,0,0)).toISOString(), end: new Date().toISOString() };
        case "last-7-days": {
            const start = new Date();
            start.setDate(now.getDate() - 7);
            return { start: start.toISOString(), end: new Date().toISOString() };
        }
        case "current-month": return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: new Date().toISOString() };
        case "previous-month": return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString() };
        case "current-year": return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: new Date().toISOString() };
        case "previous-year": return { start: new Date(now.getFullYear() - 1, 0, 1).toISOString(), end: new Date(now.getFullYear() - 1, 11, 31).toISOString() };
        case "custom": return { 
          start: customStartDate ? new Date(customStartDate).toISOString() : undefined, 
          end: customEndDate ? new Date(customEndDate).toISOString() : undefined 
        };
        default: return { start: undefined, end: undefined };
    }
  }


  // Fetch initial data
  const { isLoading, refetch } = useQuery({
    queryKey: ["financial-config", period, customStartDate, customEndDate],
    queryFn: async () => {
      localStorage.setItem("finance-period", period);
      if (customStartDate) localStorage.setItem("finance-custom-start", customStartDate);
      if (customEndDate) localStorage.setItem("finance-custom-end", customEndDate);
      const dates = getDates(period);

      
      const [configRaw, autoRevenue] = await Promise.all([
        fetchFinancialConfig(),
        fetchFinancialSummary({
          data: { startDate: dates.start, endDate: dates.end },
        }),
      ]);

      const config = configRaw as any;

      setRevenue(
        Number(autoRevenue.totalNetRevenue) ||
          Number(config.manualRevenue || 0),
      );

      setConfigVersion(config.version ?? null);

      setCosts(
        (config.costs ?? []).map((c: any) => ({
          id: c.id,
          label: c.label,
          value: Number(c.value) || 0,
        })),
      );

      setPartners(
        (config.partners ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          percent: Number(p.percent) || 0,
          user_id: p.user_id ?? null,
        })),
      );

      return {
        revenue: autoRevenue,
        config,
      };
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await saveFinancialConfigFn({
        data: {
          expectedVersion: configVersion,
          costs: costs.map((c) => ({
            id: c.id,
            label: c.label.trim(),
            value: Number(c.value) || 0,
          })),
          partners: partners.map((p) => ({
            id: p.id,
            name: p.name.trim(),
            percent: Number(p.percent) || 0,
            user_id: p.user_id ?? null,
          })),
        },
      });
    },

    onSuccess: (result: any) => {
      setConfigVersion(result?.version ?? null);

      if (Array.isArray(result?.costs)) {
        setCosts(
          result.costs.map((c: any) => ({
            id: c.id,
            label: c.label,
            value: Number(c.value) || 0,
          })),
        );
      }

      if (Array.isArray(result?.partners)) {
        setPartners(
          result.partners.map((p: any) => ({
            id: p.id,
            name: p.name,
            percent: Number(p.percent) || 0,
            user_id: p.user_id ?? null,
          })),
        );
      }

      queryClient.invalidateQueries({
        queryKey: ["financial-config"],
      });

      toast.success(
        "Configurações financeiras salvas e confirmadas no banco!",
      );
    },

    onError: (error: any) => {
      toast.error(
        error?.message ||
          "Não foi possível salvar as configurações financeiras.",
      );
    },
  });

  const totalCost = useMemo(() => costs.reduce((s, c) => s + (c.value || 0), 0), [costs]);
  const profit = revenue - totalCost;
  const totalPercent = useMemo(() => partners.reduce((s, p) => s + (p.percent || 0), 0), [partners]);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const updateCost = (id: string, patch: Partial<Cost>) =>
    setCosts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCost = (id: string) => setCosts((cs) => cs.filter((c) => c.id !== id));
  const addCost = () =>
    setCosts((cs) => [...cs, { id: `c${Date.now()}`, label: "Novo custo", value: 0 }]);

  const updatePartner = (id: string, patch: Partial<Partner>) =>
    setPartners((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePartner = (id: string) => setPartners((ps) => ps.filter((p) => p.id !== id));
  const addPartner = () =>
    setPartners((ps) => [...ps, { id: `p${Date.now()}`, name: "Novo sócio", percent: 0, user_id: null }]);

  const { data: users } = useQuery({
    queryKey: ["users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, name, email").order("name");
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-sm text-black shrink-0" style={{ backgroundColor: ORANGE }}>
            <DollarSign className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-tight text-white text-left">
              Painel Financeiro
            </h2>
            <p className="text-[10px] sm:text-xs text-white/40 text-left">Custos, lucro e divisão de sócios</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-orange-500/50 sm:w-auto"
            >
              <option value="today">Hoje</option>
              <option value="last-7-days">Últimos 7 dias</option>
              <option value="current-month">Mês Atual</option>
              <option value="previous-month">Mês Anterior</option>
              <option value="current-year">Ano Atual</option>
              <option value="previous-year">Ano Anterior</option>
              <option value="all">Todo o Período</option>
              <option value="custom">Personalizado</option>
            </select>

            {period === "custom" && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-orange-500/50"
                />
                <span className="shrink-0 text-[10px] text-white/20">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-orange-500/50"
                />
              </div>
            )}
          </div>


          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#ff6a00] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </button>
        </div>

      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Resumo */}
        <div className="lg:col-span-3">
           <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-4 gap-3 sm:gap-4 text-left">
              <div className="border border-white/5 bg-white/[0.02] p-3 sm:p-5 2xl:p-8">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/40">Receita Bruta</div>
                  {period !== 'all' && <div className="text-[8px] font-bold text-orange-400/60 uppercase">Filtrado</div>}
                </div>
                <div className="text-lg sm:text-2xl 2xl:text-4xl font-display font-extrabold text-white">{brl(revenue)}</div>
              </div>

              <div className="border border-white/5 bg-white/[0.02] p-3 sm:p-5 2xl:p-8">
                <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Custos Totais</div>
                <div className="text-lg sm:text-2xl 2xl:text-4xl font-display font-extrabold text-red-400">{brl(totalCost)}</div>
              </div>
              <div className="border border-white/5 bg-white/[0.02] p-3 sm:p-5 2xl:p-8">
                <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Lucro Líquido</div>
                <div className="text-lg sm:text-2xl 2xl:text-4xl font-display font-extrabold text-emerald-400">{brl(profit)}</div>
              </div>
              <div className="border border-white/5 bg-white/[0.02] p-3 sm:p-5 2xl:p-8">
                <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Margem Líquida</div>
                <div className={`text-lg sm:text-2xl 2xl:text-4xl font-display font-extrabold ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{margin.toFixed(1)}%</div>
              </div>
           </div>
        </div>

        {/* Coluna 1: Receita e Profit Table */}
        <div className="space-y-6 text-left lg:col-span-1">
          <section className="border border-white/5 bg-black/40 p-6">
            <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4" style={{ color: ORANGE }} /> Receita Automatizada
              </div>
              <div className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full lowercase tracking-normal font-normal">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                sincronizado Asaas
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-white/30 mb-2">Valor da Receita (Líquida Asaas)</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-bold">R$</span>
                  <input
                    type="number"
                    value={revenue}
                    readOnly
                    className="w-full rounded-sm border border-white/5 bg-white/[0.02] pl-11 pr-4 py-3 font-display text-xl sm:text-2xl font-extrabold text-emerald-400 outline-none cursor-not-allowed opacity-80"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-sm">
                    <span className="text-[9px] text-white/60 uppercase font-black">Preenchido Automaticamente</span>
                  </div>
                </div>
              </div>

              <div className="rounded-sm bg-white/[0.03] p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Receita Líquida Real</span>
                  <span className="font-bold text-white">{brl(revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Custos Operacionais</span>
                  <span className="font-bold text-red-400">− {brl(totalCost)}</span>
                </div>
                <div className="pt-3 border-t border-white/10 flex justify-between items-end">
                  <span className="text-xs font-bold uppercase text-white/30">Lucro Disponível</span>
                  <span className="text-xl font-display font-extrabold text-emerald-400">{brl(profit)}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 rounded-sm border border-orange-500/20 bg-orange-500/5 p-4 text-[11px] leading-relaxed text-orange-200/60">
            <Info className="h-4 w-4 shrink-0 text-orange-400" />
            <span>Os valores acima são calculados automaticamente com base na entrada de custos e receitas. Utilize para simulações de escala.</span>
          </div>
        </div>

        {/* Coluna 2: Custos */}
        <section className="border border-white/5 bg-black/40 p-6 flex flex-col text-left lg:col-span-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
              <LayoutTemplate className="h-4 w-4" style={{ color: ORANGE }} /> Quadro de Custos
            </div>
            <button
              onClick={addCost}
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110"
              style={{ backgroundColor: ORANGE }}
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </div>
          
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {costs.map((c) => (
              <div
                key={c.id}
                className="group flex items-center gap-2 border border-white/10 bg-black/40 p-2 transition hover:border-[color:var(--orange)]"
                style={{ ["--orange" as any]: ORANGE }}
              >
                <div className="flex-1 min-w-0">
                  <input
                    value={c.label}
                    readOnly={c.label.toLowerCase().includes("gateway")}
                    onChange={(e) => updateCost(c.id, { label: e.target.value })}
                    className={`w-full bg-transparent px-2 py-1 text-sm font-medium text-white/80 outline-none focus:text-white ${c.label.toLowerCase().includes("gateway") ? 'opacity-60 cursor-not-allowed' : ''}`}
                    placeholder="Descrição do custo"
                  />
                </div>
                <div className="relative w-24 shrink-0 sm:w-28 group">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/20">R$</span>
                  <input
                    type="number"
                    value={c.value}
                    readOnly={c.label.toLowerCase().includes("gateway")}
                    onChange={(e) => updateCost(c.id, { value: parseFloat(e.target.value) || 0 })}
                    className={`w-full rounded-sm bg-black/60 pl-6 pr-2 py-1 text-right text-sm text-white outline-none focus:bg-black text-[16px] ${c.label.toLowerCase().includes("gateway") ? 'text-orange-400 cursor-not-allowed' : ''}`}
                  />
                  {c.label.toLowerCase().includes("gateway") && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-sm">
                      <span className="text-[7px] text-white/60 uppercase font-black">Auto Asaas</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeCost(c.id)}
                  disabled={c.label.toLowerCase().includes("gateway")}
                  className="p-1 text-white/20 transition hover:text-red-400 disabled:opacity-0 disabled:pointer-events-none"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between border-t border-white/10 pt-4">
            <span className="text-xs font-bold uppercase tracking-widest text-white/40">Total Operacional</span>
            <span className="font-display text-xl font-extrabold text-red-400">{brl(totalCost)}</span>
          </div>
        </section>

        {/* Coluna 3: Sócios */}
        <section className="border border-white/5 bg-black/40 p-6 flex flex-col text-left lg:col-span-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
              <PieChart className="h-4 w-4" style={{ color: ORANGE }} /> Divisão de Sócios
            </div>
            <button
              onClick={addPartner}
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110"
              style={{ backgroundColor: ORANGE }}
            >
              <Plus className="h-3 w-3" /> Sócio
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {partners.map((p) => {
              const share = (profit * (p.percent || 0)) / 100;
              return (
                <div
                  key={p.id}
                  className="group relative border border-white/10 bg-black/40 p-4 transition hover:border-[color:var(--orange)]"
                  style={{ ["--orange" as any]: ORANGE }}
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <input
                      value={p.name}
                      onChange={(e) => updatePartner(p.id, { name: e.target.value })}
                      className="min-w-0 flex-1 bg-transparent text-base font-bold text-white outline-none sm:text-sm"
                      placeholder="Nome do Sócio"
                    />
                    <select
                      value={p.user_id || ""}
                      onChange={(e) => updatePartner(p.id, { user_id: e.target.value || null })}
                      className="w-full min-h-[40px] min-w-0 rounded-sm border border-white/10 bg-black px-2 py-1 text-[11px] text-white outline-none focus:border-orange-500 sm:w-auto sm:max-w-[150px]"
                    >
                      <option value="">Vincular Usuário</option>
                      {users?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex min-w-0 items-end gap-4">
                      <div className="relative w-20 shrink-0">
                        <input
                          type="number"
                          value={p.percent}
                          onChange={(e) => updatePartner(p.id, { percent: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-sm bg-black/60 px-2 py-1.5 text-center font-display font-extrabold text-white outline-none focus:bg-black text-[16px]"
                        />
                        <span className="absolute -right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/40">%</span>
                      </div>
                      <div className="flex min-w-0 flex-col items-start">
                        <span className="mb-1 text-[10px] font-black uppercase text-white/20">Lucro Individual</span>
                        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 font-display text-sm font-black text-emerald-400">
                          {brl(share)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removePartner(p.id)}
                      className="grid h-10 w-10 shrink-0 place-items-center text-white/30 transition hover:text-red-400"
                      aria-label="Remover sócio"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

          <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
            <div className="flex justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">Total Distribuído</span>
              <span className={`text-lg font-display font-extrabold ${totalPercent === 100 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {totalPercent}%
              </span>
            </div>
            {totalPercent !== 100 && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-400/80 animate-pulse">
                <Info className="h-3 w-3" />
                <span>A soma deve ser 100% (Atual: {totalPercent}%)</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="border border-white/5 bg-black/40 p-4 sm:p-6 text-left">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: ORANGE }} /> Gerenciamento Financeiro — Extrato de Saídas
          </div>
          <span className="lowercase tracking-normal font-normal text-white/30">
            movimentações de saída da conta Asaas registradas automaticamente
          </span>
        </div>
        <FinanceOutflowStatement />
      </section>

    </div>
  );
}