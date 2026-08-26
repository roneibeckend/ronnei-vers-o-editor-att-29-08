import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  getOpsRecoveryOverview,
  runOpsRecoveryNow,
  fixReconciliation,
  ignoreReconciliation,
  retryEmailQueueItem,
  resolveOpsAlert,
} from "@/lib/ops-recovery.functions";

export const Route = createFileRoute("/admin/reconciliacao")({
  head: () => ({
    meta: [
      { title: "Reconciliação e Recuperação — Painel Admin" },
      {
        name: "description",
        content:
          "Reconciliação de pagamentos Asaas, fila de reenvio de e-mails e alertas críticos da operação.",
      },
      { property: "og:title", content: "Reconciliação e Recuperação — Painel Admin" },
      {
        property: "og:description",
        content: "Recuperação operacional: pagamentos sem acesso, e-mails falhados e alertas críticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpsRecoveryPage,
});

const ORANGE = "#ff6a00";
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const ISSUE_LABEL: Record<string, string> = {
  pagamento_sem_matricula: "Pagamento confirmado sem matrícula",
  assinatura_sem_matricula: "Assinatura ativa sem matrícula",
  cliente_nao_encontrado: "Cliente não encontrado na base",
  produto_inexistente: "Produto removido do catálogo",
  sem_referencia: "Pagamento sem referência de produto",
};

function OpsRecoveryPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"reconciliacao" | "emails" | "alertas">("reconciliacao");

  const fetchOverview = useServerFn(getOpsRecoveryOverview);
  const runNow = useServerFn(runOpsRecoveryNow);
  const fixItem = useServerFn(fixReconciliation);
  const ignoreItem = useServerFn(ignoreReconciliation);
  const retryEmail = useServerFn(retryEmailQueueItem);
  const resolveAlert = useServerFn(resolveOpsAlert);

  const { data, isLoading } = useQuery({
    queryKey: ["ops-recovery-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ops-recovery-overview"] });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (res: any) => {
      toast.success(
        `Rotina concluída: ${res.reconciliation.checked} pagamentos verificados, ${res.reconciliation.divergences} divergência(s), ${res.emails.sent} e-mail(is) reenviado(s).`,
      );
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao executar a rotina."),
  });

  const actionMutation = useMutation({
    mutationFn: async (args: { kind: string; id: string }) => {
      if (args.kind === "fix") return await fixItem({ data: { id: args.id } });
      if (args.kind === "ignore") return await ignoreItem({ data: { id: args.id } });
      if (args.kind === "email") return await retryEmail({ data: { id: args.id } });
      return await resolveAlert({ data: { id: args.id } });
    },
    onSuccess: (res: any) => {
      toast.success(res?.message || "Ação concluída.");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao executar a ação."),
  });

  const reconciliations = (data?.reconciliations || []) as any[];
  const emails = (data?.emails || []) as any[];
  const alerts = (data?.alerts || []) as any[];

  const pendingCount = reconciliations.filter((r) => r.status === "pending").length;
  const emailPending = emails.filter((e) => !e.resolved_at).length;
  const openAlerts = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reconciliação & Recuperação</h1>
          <p className="mt-1 text-sm text-white/50">
            Rotina automática a cada 15 minutos: confere pagamentos do Asaas contra os acessos liberados,
            reprocessa e-mails que falharam e dispara alertas críticos.
          </p>
          <p className="mt-1 text-xs text-white/40">
            Última execução: {dt(data?.job?.last_run_at)} · status: {data?.job?.last_status || "—"}
            {data?.job?.last_error ? ` · erro: ${data.job.last_error}` : ""}
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-black disabled:opacity-60"
          style={{ backgroundColor: ORANGE }}
        >
          {runMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Executar agora
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Wallet} label="Pagamentos sem acesso" value={pendingCount} tone="danger" />
        <SummaryCard icon={Mail} label="E-mails na fila de reenvio" value={emailPending} tone="warning" />
        <SummaryCard icon={ShieldAlert} label="Alertas abertos" value={openAlerts} tone="danger" />
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-white/10 pb-1">
        {[
          { id: "reconciliacao", label: "Reconciliação" },
          { id: "emails", label: "E-mails" },
          { id: "alertas", label: "Alertas" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`min-h-10 whitespace-nowrap rounded-t-lg px-4 text-sm font-medium transition ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: ORANGE }} />
        </div>
      ) : tab === "reconciliacao" ? (
        <section className="space-y-3">
          {reconciliations.length === 0 ? (
            <EmptyState message="Nenhuma divergência encontrada. Todos os pagamentos confirmados têm acesso liberado." />
          ) : (
            reconciliations.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      {ISSUE_LABEL[item.issue] || item.issue}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/50">
                      {item.customer_email || item.user_id || "cliente não identificado"} ·{" "}
                      {item.product_type ? `${item.product_type}:${item.product_id}` : "produto desconhecido"} ·{" "}
                      {brl(item.amount)}
                    </p>
                    <p className="mt-0.5 text-xs text-white/35">
                      Asaas: {item.external_id} · detectado em {dt(item.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "pending" && (
                      <>
                        <button
                          onClick={() => actionMutation.mutate({ kind: "fix", id: item.id })}
                          disabled={actionMutation.isPending}
                          className="min-h-9 rounded-lg px-3 text-xs font-semibold text-black disabled:opacity-60"
                          style={{ backgroundColor: ORANGE }}
                        >
                          Liberar acesso
                        </button>
                        <button
                          onClick={() => actionMutation.mutate({ kind: "ignore", id: item.id })}
                          disabled={actionMutation.isPending}
                          className="min-h-9 rounded-lg border border-white/15 px-3 text-xs text-white/70"
                        >
                          Arquivar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : tab === "emails" ? (
        <section className="space-y-3">
          {emails.length === 0 ? (
            <EmptyState message="Nenhum e-mail com falha. A fila de reenvio está vazia." />
          ) : (
            emails.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Mail className="h-4 w-4 shrink-0 text-white/50" />
                      {item.template_name}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/50">
                      {item.recipient_email} · tentativas: {item.attempts || 0}/3 · próxima:{" "}
                      {dt(item.next_retry_at)}
                    </p>
                    {item.error_message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-red-300/70">{item.error_message}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.resolved_at ? item.status : "pending"} />
                    <button
                      onClick={() => actionMutation.mutate({ kind: "email", id: item.id })}
                      disabled={actionMutation.isPending}
                      className="min-h-9 rounded-lg px-3 text-xs font-semibold text-black disabled:opacity-60"
                      style={{ backgroundColor: ORANGE }}
                    >
                      Reenviar agora
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {alerts.length === 0 ? (
            <EmptyState message="Nenhum alerta registrado nas últimas execuções." />
          ) : (
            alerts.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <ShieldAlert
                        className={`h-4 w-4 shrink-0 ${
                          item.severity === "critical" ? "text-red-400" : "text-amber-400"
                        }`}
                      />
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-white/50">{item.message}</p>
                    <p className="mt-0.5 text-xs text-white/35">
                      {item.type} · {dt(item.created_at)}
                      {item.notified_at ? " · admins notificados" : " · sem notificação por e-mail"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "open" && (
                      <button
                        onClick={() => actionMutation.mutate({ kind: "alert", id: item.id })}
                        disabled={actionMutation.isPending}
                        className="min-h-9 rounded-lg border border-white/15 px-3 text-xs text-white/70"
                      >
                        Marcar resolvido
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "danger" | "warning";
}) {
  const color = value === 0 ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "text-amber-400";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-300" },
    fixed: { label: "Corrigido", className: "bg-emerald-500/15 text-emerald-300" },
    ignored: { label: "Arquivado", className: "bg-white/10 text-white/50" },
    open: { label: "Aberto", className: "bg-red-500/15 text-red-300" },
    resolved: { label: "Resolvido", className: "bg-emerald-500/15 text-emerald-300" },
    sent: { label: "Enviado", className: "bg-emerald-500/15 text-emerald-300" },
    failed: { label: "Falhou", className: "bg-amber-500/15 text-amber-300" },
    failed_permanent: { label: "Falha final", className: "bg-red-500/15 text-red-300" },
    error: { label: "Erro", className: "bg-red-500/15 text-red-300" },
  };
  const badge = map[status] || { label: status, className: "bg-white/10 text-white/60" };
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
      {message}
    </div>
  );
}
