import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt, Loader2, RotateCcw, ExternalLink, Ban } from "lucide-react";
import {
  getStudentFinance,
  adminRegisterRefund,
  adminCancelSubscription,
} from "@/lib/finance-admin.functions";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const date = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  overdue: "bg-orange-500/15 text-orange-400",
  refunded: "bg-red-500/15 text-red-400",
  canceled: "bg-white/10 text-white/50",
  unknown: "bg-white/10 text-white/50",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  overdue: "Vencido",
  refunded: "Estornado",
  canceled: "Cancelado",
  unknown: "—",
};

const SUB_LABEL: Record<string, string> = {
  active: "Ativa",
  canceled: "Cancelada",
  overdue: "Inadimplente",
  expired: "Expirada",
};

type Tab = "payments" | "invoices" | "subscriptions" | "refunds";

export function StudentFinancePanel({ studentId }: { studentId: string }) {
  const financeFn = useServerFn(getStudentFinance);
  const refundFn = useServerFn(adminRegisterRefund);
  const cancelFn = useServerFn(adminCancelSubscription);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("payments");

  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [revokeAccess, setRevokeAccess] = useState(true);
  const [refundInAsaas, setRefundInAsaas] = useState(false);
  const [running, setRunning] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await financeFn({ data: { studentId } });
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao carregar o histórico financeiro.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [studentId]);

  async function executeRefund() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) return toast.error("Informe um motivo com pelo menos 5 caracteres.");
    setRunning(true);
    try {
      const res: any = await refundFn({
        data: { paymentId: refundTarget.id, reason: trimmed, revokeAccess, refundInAsaas },
      });
      toast.success(
        res?.accessRevoked ? "Estorno registrado e acesso revogado." : "Estorno registrado.",
      );
      setRefundTarget(null);
      setReason("");
      load();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao registrar o estorno.");
    } finally {
      setRunning(false);
    }
  }

  async function executeCancel() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) return toast.error("Informe um motivo com pelo menos 5 caracteres.");
    setRunning(true);
    try {
      await cancelFn({
        data: {
          subscriptionId: cancelTarget.id,
          reason: trimmed,
          studentId,
          description: cancelTarget.description,
        },
      });
      toast.success("Assinatura cancelada no Asaas.");
      setCancelTarget(null);
      setReason("");
      load();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao cancelar a assinatura.");
    } finally {
      setRunning(false);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "payments", label: "Pagamentos", count: data?.payments?.length ?? 0 },
    { key: "invoices", label: "Faturas", count: data?.invoices?.length ?? 0 },
    { key: "subscriptions", label: "Assinaturas", count: data?.subscriptions?.length ?? 0 },
    { key: "refunds", label: "Estornos", count: data?.refunds?.length ?? 0 },
  ];

  return (
    <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00]">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Histórico financeiro</h3>
            <p className="text-xs text-white/40">
              Pagamentos, faturas, assinaturas e estornos deste aluno.
            </p>
          </div>
        </div>
        {data && (
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Pago</div>
              <div className="text-sm font-bold text-emerald-400">{money(data.totalPaid || 0)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Estornado</div>
              <div className="text-sm font-bold text-red-400">{money(data.totalRefunded || 0)}</div>
            </div>
          </div>
        )}
      </div>

      {data?.asaasError && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
          Faturas e assinaturas não puderam ser carregadas do Asaas: {data.asaasError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
              tab === t.key
                ? "bg-[#ff6a00] text-black"
                : "border border-white/5 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
        </div>
      ) : (
        <div className="space-y-2">
          {tab === "payments" &&
            (data?.payments?.length ? (
              data.payments.map((p: any) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.01] p-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{money(p.amount)}</div>
                    <div className="text-[11px] text-white/40">
                      {date(p.confirmedAt || p.createdAt)} · {p.billingType || "—"} ·{" "}
                      <span className="font-mono">{p.externalId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        STATUS_STYLE[p.statusKind] || STATUS_STYLE.unknown
                      }`}
                    >
                      {STATUS_LABEL[p.statusKind] || p.status}
                    </span>
                    {p.statusKind !== "refunded" && (
                      <button
                        onClick={() => {
                          setRefundTarget(p);
                          setReason("");
                          setRevokeAccess(true);
                          setRefundInAsaas(false);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 transition hover:bg-red-500/20"
                      >
                        <RotateCcw className="h-3 w-3" /> Estornar
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-white/30">Nenhum pagamento registrado.</p>
            ))}

          {tab === "invoices" &&
            (data?.invoices?.length ? (
              data.invoices.map((i: any) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.01] p-4"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{i.description}</div>
                    <div className="text-[11px] text-white/40">
                      Vencimento: {i.dueDate || "—"} · {money(i.amount)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        STATUS_STYLE[i.statusKind] || STATUS_STYLE.unknown
                      }`}
                    >
                      {STATUS_LABEL[i.statusKind] || i.status}
                    </span>
                    {i.invoiceUrl && (
                      <a
                        href={i.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/60 transition hover:bg-white/10"
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-white/30">Nenhuma fatura encontrada no Asaas.</p>
            ))}

          {tab === "subscriptions" &&
            (data?.subscriptions?.length ? (
              data.subscriptions.map((s: any) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.01] p-4"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{s.description}</div>
                    <div className="text-[11px] text-white/40">
                      Próxima cobrança: {s.nextDueDate || "—"} · {money(s.amount)} · {s.cycle || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        s.bucket === "active"
                          ? STATUS_STYLE.paid
                          : s.bucket === "overdue"
                            ? STATUS_STYLE.overdue
                            : STATUS_STYLE.canceled
                      }`}
                    >
                      {SUB_LABEL[s.bucket]}
                    </span>
                    {s.bucket !== "canceled" && (
                      <button
                        onClick={() => {
                          setCancelTarget(s);
                          setReason("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 transition hover:bg-red-500/20"
                      >
                        <Ban className="h-3 w-3" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-white/30">Nenhuma assinatura encontrada.</p>
            ))}

          {tab === "refunds" &&
            (data?.refunds?.length ? (
              data.refunds.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      {r.action === "payment_refunded"
                        ? `Estorno ${r.amount ? money(r.amount) : ""}`
                        : r.action === "subscription_canceled"
                          ? "Assinatura cancelada"
                          : "Falha em estorno"}
                    </span>
                    <span className="text-[10px] text-white/30">{date(r.createdAt)}</span>
                  </div>
                  {r.productName && (
                    <div className="mt-0.5 text-[11px] text-white/50">Produto: {r.productName}</div>
                  )}
                  <div className="mt-0.5 text-[11px] text-white/40">Responsável: {r.actor}</div>
                  {r.reason && <div className="mt-0.5 text-[11px] text-white/40">Motivo: {r.reason}</div>}
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-white/30">Nenhum estorno registrado.</p>
            ))}
        </div>
      )}

      {/* Confirmação de estorno */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && !running && setRefundTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0e0e0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Registrar estorno</DialogTitle>
            <p className="mt-2 text-sm text-white/50">
              Pagamento de {refundTarget ? money(refundTarget.amount) : ""} será marcado como
              estornado. Esta ação fica registrada em auditoria.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Motivo (obrigatório)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: reembolso solicitado dentro da garantia de 7 dias."
                className="min-h-[80px] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-[#ff6a00]"
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={revokeAccess}
                onChange={(e) => setRevokeAccess(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#ff6a00]"
              />
              Revogar automaticamente o acesso ao produto relacionado
            </label>
            <label className="flex items-start gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={refundInAsaas}
                onChange={(e) => setRefundInAsaas(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#ff6a00]"
              />
              Solicitar o estorno também no Asaas (devolução do valor ao cliente)
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setRefundTarget(null)}
              disabled={running}
              className="flex-1 rounded-xl bg-white/5 py-3 text-[10px] font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={executeRefund}
              disabled={running}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:scale-[1.02] disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Executando..." : "Confirmar estorno"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de cancelamento de assinatura */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && !running && setCancelTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0e0e0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Cancelar assinatura</DialogTitle>
            <p className="mt-2 text-sm text-white/50">
              A assinatura "{cancelTarget?.description}" será cancelada no Asaas e não gerará novas
              cobranças.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Motivo (obrigatório)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: aluno solicitou cancelamento por WhatsApp."
              className="min-h-[80px] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-[#ff6a00]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setCancelTarget(null)}
              disabled={running}
              className="flex-1 rounded-xl bg-white/5 py-3 text-[10px] font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              onClick={executeCancel}
              disabled={running}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:scale-[1.02] disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Cancelando..." : "Cancelar assinatura"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
