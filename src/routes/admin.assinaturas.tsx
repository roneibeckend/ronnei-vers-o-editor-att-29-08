import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Loader2, Ban, CreditCard, History } from "lucide-react";
import {
  listSubscriptions,
  adminCancelSubscription,
  getFinanceAuditLog,
} from "@/lib/finance-admin.functions";

export const Route = createFileRoute("/admin/assinaturas")({
  head: () => ({
    meta: [
      { title: "Assinaturas · Admin — Ronnei na Veia" },
      {
        name: "description",
        content:
          "Gerencie assinaturas ativas, canceladas, inadimplentes e expiradas, com cancelamento direto pelo painel.",
      },
      { property: "og:title", content: "Assinaturas · Admin — Ronnei na Veia" },
      {
        property: "og:description",
        content: "Painel administrativo de assinaturas e auditoria financeira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSubscriptionsPage,
});

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const BUCKETS = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "canceled", label: "Canceladas" },
  { key: "overdue", label: "Inadimplentes" },
  { key: "expired", label: "Expiradas" },
] as const;

const BUCKET_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  overdue: "bg-orange-500/15 text-orange-400",
  canceled: "bg-white/10 text-white/50",
  expired: "bg-red-500/15 text-red-400",
};

const BUCKET_LABEL: Record<string, string> = {
  active: "Ativa",
  overdue: "Inadimplente",
  canceled: "Cancelada",
  expired: "Expirada",
};

const ACTION_LABEL: Record<string, string> = {
  payment_refunded: "Estorno registrado",
  payment_refund_failed: "Falha em estorno",
  subscription_canceled: "Assinatura cancelada",
  subscription_cancel_failed: "Falha ao cancelar assinatura",
};

function AdminSubscriptionsPage() {
  const listFn = useServerFn(listSubscriptions);
  const cancelFn = useServerFn(adminCancelSubscription);
  const auditFn = useServerFn(getFinanceAuditLog);

  const [data, setData] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof BUCKETS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [subs, logs] = await Promise.all([
        listFn({ data: {} }) as any,
        auditFn({ data: {} }) as any,
      ]);
      setData(subs);
      setAudit(logs || []);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao carregar assinaturas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function execute() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) return toast.error("Informe um motivo com pelo menos 5 caracteres.");
    setRunning(true);
    try {
      await cancelFn({
        data: {
          subscriptionId: target.id,
          reason: trimmed,
          studentId: target.studentId ?? null,
          description: target.description,
        },
      });
      toast.success("Assinatura cancelada no Asaas.");
      setTarget(null);
      setReason("");
      load();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao cancelar a assinatura.");
    } finally {
      setRunning(false);
    }
  }

  const all: any[] = data?.subscriptions ?? [];
  const term = search.trim().toLowerCase();
  const rows = all.filter((s) => {
    if (filter !== "all" && s.bucket !== filter) return false;
    if (!term) return true;
    return [s.description, s.studentName, s.studentEmail, s.id]
      .filter(Boolean)
      .some((v: string) => v.toLowerCase().includes(term));
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Assinaturas</h1>
          <p className="text-sm text-white/40">
            Assinaturas do Asaas: status, próxima cobrança, valor e cancelamento pelo painel.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 text-[#ff6a00] ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {data?.asaasError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
          Não foi possível consultar o Asaas: {data.asaasError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["active", "canceled", "overdue", "expired"] as const).map((k) => (
          <div key={k} className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">
              {BUCKET_LABEL[k]}
            </div>
            <div className="mt-1 text-2xl font-bold text-[#ff6a00]">{data?.counts?.[k] ?? 0}</div>
          </div>
        ))}
      </div>

      <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#ff6a00]" />
            <h2 className="text-lg font-bold">Lista de assinaturas</h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por aluno, e-mail ou produto…"
            className="ml-auto w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm outline-none focus:border-[#ff6a00] lg:w-72"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setFilter(b.key)}
              className={`rounded-xl px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
                filter === b.key
                  ? "bg-[#ff6a00] text-black"
                  : "border border-white/5 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-sm text-white/30">Nenhuma assinatura encontrada.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.01] p-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{s.description}</div>
                  <div className="text-[11px] text-white/40">
                    {s.studentId ? (
                      <Link
                        to="/admin/alunos/$studentId"
                        params={{ studentId: s.studentId }}
                        className="text-[#ff6a00] hover:underline"
                      >
                        {s.studentName || s.studentEmail || "Aluno"}
                      </Link>
                    ) : (
                      <span className="font-mono">{s.customerId || "cliente Asaas"}</span>
                    )}{" "}
                    · Próxima cobrança: {s.nextDueDate || "—"} · {money(s.amount)} · {s.cycle || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                      BUCKET_STYLE[s.bucket]
                    }`}
                  >
                    {BUCKET_LABEL[s.bucket]}
                  </span>
                  {s.bucket !== "canceled" && (
                    <button
                      onClick={() => {
                        setTarget(s);
                        setReason("");
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 transition hover:bg-red-500/20"
                    >
                      <Ban className="h-3 w-3" /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
        <div className="mb-5 flex items-center gap-2">
          <History className="h-4 w-4 text-[#ff6a00]" />
          <h2 className="text-lg font-bold">Auditoria financeira</h2>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-white/30">Nenhuma ação financeira registrada.</p>
        ) : (
          <div className="space-y-2">
            {audit.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold">
                    {ACTION_LABEL[a.action] || a.action}
                    {a.amount ? ` · ${money(a.amount)}` : ""}
                  </span>
                  <span className="text-[10px] text-white/30">{dateFmt(a.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-white/40">
                  {a.student ? `Aluno: ${a.student} · ` : ""}Responsável: {a.actor}
                </div>
                {a.productName && (
                  <div className="mt-0.5 text-[11px] text-white/50">Produto: {a.productName}</div>
                )}
                {a.reason && <div className="mt-0.5 text-[11px] text-white/40">Motivo: {a.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!target} onOpenChange={(o) => !o && !running && setTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0e0e0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Cancelar assinatura</DialogTitle>
            <p className="mt-2 text-sm text-white/50">
              A assinatura "{target?.description}" será cancelada no Asaas e não gerará novas
              cobranças. A ação é registrada em auditoria.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Motivo (obrigatório)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: aluno solicitou cancelamento."
              className="min-h-[80px] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-[#ff6a00]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setTarget(null)}
              disabled={running}
              className="flex-1 rounded-xl bg-white/5 py-3 text-[10px] font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              onClick={execute}
              disabled={running}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:scale-[1.02] disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Cancelando..." : "Cancelar assinatura"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
