import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert, ShieldCheck, Lock, Unlock, History, Loader2 } from "lucide-react";
import {
  adminBlockAccount,
  adminUnblockAccount,
  adminGrantAccess,
  adminRevokeAccess,
  getAccessControlHistory,
} from "@/lib/access-control-admin.functions";

type Product = { id: string; title: string };
type Enrollment = { type: "course" | "ebook"; title: string; course_id?: string; ebook_id?: string };

type Pending =
  | { kind: "block" }
  | { kind: "unblock" }
  | { kind: "grant"; productType: "course" | "ebook"; productId: string; label: string }
  | { kind: "revoke"; productType: "course" | "ebook"; productId: string; label: string };

const ACTION_LABEL: Record<string, string> = {
  account_blocked: "Conta bloqueada",
  account_reactivated: "Conta reativada",
  access_granted: "Acesso concedido",
  access_revoked: "Acesso revogado",
  account_block_failed: "Falha ao bloquear conta",
  account_reactivate_failed: "Falha ao reativar conta",
  access_grant_failed: "Falha ao conceder acesso",
  access_revoke_failed: "Falha ao revogar acesso",
};

export function AccessControlPanel({
  studentId,
  status,
  enrollments,
  availableProducts,
  onUpdated,
}: {
  studentId: string;
  status?: string | null;
  enrollments: Enrollment[];
  availableProducts: { courses: Product[]; ebooks: Product[] };
  onUpdated?: () => void;
}) {
  const blockFn = useServerFn(adminBlockAccount);
  const unblockFn = useServerFn(adminUnblockAccount);
  const grantFn = useServerFn(adminGrantAccess);
  const revokeFn = useServerFn(adminRevokeAccess);
  const historyFn = useServerFn(getAccessControlHistory);

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [grantType, setGrantType] = useState<"course" | "ebook">("course");
  const [grantId, setGrantId] = useState("");

  const blocked = status === "blocked";

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      const rows = (await historyFn({ data: { studentId } })) as any[];
      setHistory(rows || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, [studentId]);

  const grantOptions = grantType === "course" ? availableProducts.courses : availableProducts.ebooks;
  const ownedIds = new Set(
    enrollments
      .filter((e) => e.type === grantType)
      .map((e) => (e.type === "course" ? e.course_id : e.ebook_id)),
  );

  function describe(p: Pending) {
    switch (p.kind) {
      case "block":
        return {
          title: "Bloquear conta do aluno",
          body: "O aluno não conseguirá mais fazer login e as sessões ativas serão encerradas. Informe o motivo (obrigatório).",
          cta: "Bloquear conta",
        };
      case "unblock":
        return {
          title: "Reativar conta do aluno",
          body: "O acesso ao login será restaurado imediatamente. Informe o motivo (obrigatório).",
          cta: "Reativar conta",
        };
      case "grant":
        return {
          title: "Conceder acesso",
          body: `O aluno passará a ter acesso a "${p.label}". Informe o motivo (obrigatório).`,
          cta: "Conceder acesso",
        };
      case "revoke":
        return {
          title: "Revogar acesso",
          body: `O acesso a "${p.label}" será removido. Informe o motivo (obrigatório).`,
          cta: "Revogar acesso",
        };
    }
  }

  async function execute() {
    if (!pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      toast.error("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    setRunning(true);
    try {
      if (pending.kind === "block") {
        await blockFn({ data: { studentId, reason: trimmed } });
        toast.success("Conta bloqueada e sessões encerradas.");
      } else if (pending.kind === "unblock") {
        await unblockFn({ data: { studentId, reason: trimmed } });
        toast.success("Conta reativada.");
      } else if (pending.kind === "grant") {
        await grantFn({
          data: {
            studentId,
            productType: pending.productType,
            productId: pending.productId,
            reason: trimmed,
          },
        });
        toast.success("Acesso concedido.");
        setGrantId("");
      } else {
        await revokeFn({
          data: {
            studentId,
            productType: pending.productType,
            productId: pending.productId,
            reason: trimmed,
          },
        });
        toast.success("Acesso revogado.");
      }
      setPending(null);
      setReason("");
      onUpdated?.();
      loadHistory();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao executar a ação.");
    } finally {
      setRunning(false);
    }
  }

  const confirmation = pending ? describe(pending) : null;
  const btn =
    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-bold uppercase tracking-widest transition disabled:opacity-40";

  return (
    <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-[#ff6a00]" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
          Controle de acesso
        </h4>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/40">Situação da conta:</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            blocked ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {blocked ? "Bloqueada" : "Ativa"}
        </span>
      </div>

      <div className="grid gap-2">
        {blocked ? (
          <button className={btn} onClick={() => setPending({ kind: "unblock" })}>
            <Unlock className="h-4 w-4 text-emerald-400" /> Reativar conta
          </button>
        ) : (
          <button className={btn} onClick={() => setPending({ kind: "block" })}>
            <Lock className="h-4 w-4 text-red-400" /> Bloquear conta
          </button>
        )}
      </div>

      {/* Conceder acesso */}
      <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.01] p-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Conceder acesso manual
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={grantType}
            onChange={(e) => {
              setGrantType(e.target.value as "course" | "ebook");
              setGrantId("");
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm outline-none focus:border-[#ff6a00]"
          >
            <option value="course" className="bg-[#0e0e0e]">Curso</option>
            <option value="ebook" className="bg-[#0e0e0e]">E-book</option>
          </select>
          <select
            value={grantId}
            onChange={(e) => setGrantId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm outline-none focus:border-[#ff6a00]"
          >
            <option value="" className="bg-[#0e0e0e]">Selecione…</option>
            {grantOptions
              .filter((p) => !ownedIds.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0e0e0e]">
                  {p.title}
                </option>
              ))}
          </select>
        </div>
        <button
          className={`${btn} w-full`}
          disabled={!grantId}
          onClick={() => {
            const label = grantOptions.find((p) => p.id === grantId)?.title || grantId;
            setPending({ kind: "grant", productType: grantType, productId: grantId, label });
          }}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Conceder acesso
        </button>
      </div>

      {/* Revogar acesso */}
      <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.01] p-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Revogar acesso individual
        </label>
        {enrollments.length === 0 ? (
          <p className="text-xs text-white/30">Este aluno não possui acessos ativos.</p>
        ) : (
          <div className="space-y-1.5">
            {enrollments.map((e, i) => {
              const productId = (e.type === "course" ? e.course_id : e.ebook_id) as string;
              return (
                <div
                  key={`${productId}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{e.title}</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/30">
                      {e.type === "course" ? "Curso" : "E-book"}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setPending({
                        kind: "revoke",
                        productType: e.type,
                        productId,
                        label: e.title,
                      })
                    }
                    className="shrink-0 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 transition hover:bg-red-500/20"
                  >
                    Revogar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.01] p-3">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-[#ff6a00]" />
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Histórico de controle de acesso
          </label>
        </div>
        {loadingHistory ? (
          <p className="text-xs text-white/30">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-white/30">Nenhuma ação registrada.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{ACTION_LABEL[h.action] || h.action}</span>
                  <span className="shrink-0 text-[10px] text-white/30">
                    {new Date(h.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                </div>
                {h.productName && (
                  <div className="mt-0.5 text-[11px] text-white/50">
                    {h.productType === "course" ? "Curso" : "E-book"}: {h.productName}
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-white/40">Responsável: {h.actor}</div>
                {h.reason && <div className="mt-0.5 text-[11px] text-white/40">Motivo: {h.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmação */}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !running) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="border-white/10 bg-[#0e0e0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{confirmation?.title}</DialogTitle>
            <p className="mt-2 break-words text-sm text-white/50">{confirmation?.body}</p>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Motivo (obrigatório)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: solicitação de reembolso confirmada pelo aluno."
              className="min-h-[80px] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-[#ff6a00]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => {
                setPending(null);
                setReason("");
              }}
              disabled={running}
              className="flex-1 rounded-xl bg-white/5 py-3 text-[10px] font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={execute}
              disabled={running}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Executando..." : confirmation?.cta}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
