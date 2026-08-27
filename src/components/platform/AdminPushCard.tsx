import { useEffect, useState } from "react";
import { Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { disablePush, enablePush, getPushStatus } from "@/lib/push-client";
import { sendTestNotification } from "@/lib/admin-notifications.functions";
import { useAuth } from "@/hooks/use-auth";

export function AdminPushCard() {
  const { isAdmin, isLoading } = useAuth();
  const [status, setStatus] = useState<{ supported: boolean; permission: string; subscribed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getPushStatus().then(setStatus).catch(() => setStatus(null));
  }, [isAdmin]);

  if (isLoading || !isAdmin) return null;

  const handlePush = async (activate: boolean) => {
    setBusy(true);
    try {
      const result = activate ? await enablePush() : await disablePush();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setStatus(await getPushStatus());
    } catch (err: any) {
      toast.error(err?.message || "Falha ao configurar o push");
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await sendTestNotification();
      toast.success("Notificação de teste disparada.");
    } catch (err: any) {
      toast.error(err?.message || "Falha no teste");
    } finally {
      setBusy(false);
    }
  };

  const active = Boolean(status?.subscribed) && status?.permission === "granted";
  const blocked = status?.supported && status?.permission === "denied";
  const inIframe = typeof window !== "undefined" && window.top !== window.self;

  return (
    <section className="glass space-y-4 rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/75">
          <Bell className="h-4 w-4 text-[#ff6a00]" /> Notificações push (admin)
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
            active
              ? "bg-emerald-500/15 text-emerald-400"
              : blocked
                ? "bg-red-500/15 text-red-400"
                : "bg-white/10 text-white/50"
          }`}
        >
          {active ? "Ativo" : blocked ? "Bloqueado" : "Inativo"}
        </span>
      </div>

      <p className="text-xs text-white/55">
        Receba alertas de vendas, comissões e suporte neste dispositivo, mesmo com o app fechado. No iPhone,
        instale o app na tela de início antes de ativar.
      </p>

      {blocked && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            O navegador bloqueou as notificações para este site. Abra o cadeado ao lado do endereço →
            Notificações → Permitir, e recarregue a página.
            {inIframe && " Se estiver visualizando dentro do editor, abra o site em uma aba separada ou pelo app instalado."}
          </span>
        </div>
      )}

      {!blocked && inIframe && (
        <p className="text-[11px] text-white/40">
          Dentro do editor o navegador pode bloquear a permissão. Para ativar de verdade, abra o site publicado
          em uma aba nova ou pelo app instalado.
        </p>
      )}

      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
        Suporte: <strong className="text-white">{status?.supported ? "sim" : "não"}</strong> · Permissão:{" "}
        <strong className="text-white">{status?.permission || "—"}</strong> · Ativo neste aparelho:{" "}
        <strong className="text-white">{status?.subscribed ? "sim" : "não"}</strong>
      </div>

      <div className="flex flex-wrap gap-2">
        {!active && (
          <button
            type="button"
            disabled={busy || blocked}
            onClick={() => void handlePush(true)}
            className="rounded-xl bg-[#ff6a00] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            {busy ? "Ativando..." : "Ativar push"}
          </button>
        )}
        {active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handlePush(false)}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/70 disabled:opacity-50"
          >
            Desativar
          </button>
        )}
        <button
          type="button"
          disabled={busy || !active}
          onClick={() => void handleTest()}
          className="flex items-center gap-2 rounded-xl border border-[#ff6a00]/40 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-[#ff6a00] disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5" /> Testar
        </button>
      </div>
    </section>
  );
}
