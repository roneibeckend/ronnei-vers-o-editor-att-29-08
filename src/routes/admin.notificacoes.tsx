import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  Send,
  Info,
  Library,
  Clapperboard,
  Play,
  CheckCheck,
  Smartphone,
  ShieldAlert,
  TrendingUp,
  Users,
  LifeBuoy,
  Wallet,
  Mail,
  Cog,
  RefreshCw,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useAdminNotifications } from "@/hooks/use-admin-notifications";
import { disablePush, enablePush, getPushStatus } from "@/lib/push-client";
import {
  getNotificationSettings,
  getOperationalSummary,
  listPushDevices,
  sendTestNotification,
  updateNotificationSettings,
} from "@/lib/admin-notifications.functions";

export const Route = createFileRoute("/admin/notificacoes")({
  component: AdminNotifications,
});

const ORANGE = "#ff6a00";

const ICONS: Record<string, typeof Bell> = {
  sale: TrendingUp,
  payment: Wallet,
  affiliate: Users,
  payout: Wallet,
  support: LifeBuoy,
  email: Mail,
  security: ShieldAlert,
  system: Cog,
  webhook: Cog,
};

const SEVERITY: Record<string, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  success: { label: "Sucesso", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  warning: { label: "Atenção", className: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  critical: { label: "Crítico", className: "bg-red-500/10 text-red-300 border-red-500/30" },
};

const CATEGORIES = [
  { key: "sales", label: "Vendas e pagamentos", hint: "Compras aprovadas, PIX pago, recusas e reembolsos" },
  { key: "affiliates", label: "Afiliados", hint: "Novos cadastros e vendas com comissão" },
  { key: "payouts", label: "Saques", hint: "Solicitações, documentos e pagamentos" },
  { key: "support", label: "Suporte", hint: "Novos tickets e respostas de alunos" },
  { key: "emails", label: "E-mails", hint: "Falhas de envio e fila em retentativa" },
  { key: "finance", label: "Financeiro", hint: "Conciliação, divergências e assinaturas" },
  { key: "security", label: "Segurança", hint: "Tentativas suspeitas e ações administrativas" },
  { key: "system", label: "Sistema", hint: "Webhooks, jobs e erros operacionais" },
] as const;

const TYPE_FILTERS = [
  { value: "", label: "Tudo" },
  { value: "sale", label: "Vendas" },
  { value: "payment", label: "Pagamentos" },
  { value: "affiliate", label: "Afiliados" },
  { value: "payout", label: "Saques" },
  { value: "support", label: "Suporte" },
  { value: "email", label: "E-mails" },
  { value: "security", label: "Segurança" },
  { value: "system", label: "Sistema" },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function AdminNotifications() {
  const [tab, setTab] = useState<"inbox" | "config" | "broadcast">("inbox");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold uppercase tracking-tight">
          <Bell className="h-6 w-6" style={{ color: ORANGE }} />
          Central de Notificações
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Monitoramento operacional em tempo real: vendas, suporte, saques, e-mails e falhas do sistema.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "inbox", label: "Alertas" },
          { key: "config", label: "Push & Preferências" },
          { key: "broadcast", label: "Avisos para alunos" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as typeof tab)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest transition ${
              tab === item.key
                ? "border-[#ff6a00] bg-[#ff6a00]/10 text-[#ff6a00]"
                : "border-white/10 text-white/50 hover:border-white/25"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "inbox" && <InboxTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "broadcast" && <BroadcastTab />}
    </div>
  );
}

/* ------------------------------- Alertas ------------------------------- */

function InboxTab() {
  const { items, unread, loading, reload, markRead, markAllRead } = useAdminNotifications(true);
  const [type, setType] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getOperationalSummary>> | null>(null);

  useEffect(() => {
    getOperationalSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const filtered = items.filter(
    (item) => (!type || item.type === type) && (!onlyUnread || !item.read),
  );

  const cards = [
    { label: "Vendas 24h", value: summary ? String(summary.sales) : "—" },
    { label: "Receita 24h", value: summary ? money(summary.revenue) : "—" },
    { label: "Novos alunos", value: summary ? String(summary.newStudents) : "—" },
    { label: "Tickets", value: summary ? String(summary.tickets) : "—" },
    { label: "Erros críticos", value: summary ? String(summary.criticalErrors) : "—" },
    { label: "Não lidas", value: String(unread) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{card.label}</p>
            <p className="mt-1 truncate text-lg font-extrabold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 overflow-x-auto">
          {TYPE_FILTERS.map((item) => (
            <button
              key={item.value || "all"}
              type="button"
              onClick={() => setType(item.value)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                type === item.value
                  ? "border-[#ff6a00] text-[#ff6a00]"
                  : "border-white/10 text-white/50 hover:border-white/25"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyUnread((prev) => !prev)}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
              onlyUnread ? "border-[#ff6a00] text-[#ff6a00]" : "border-white/10 text-white/50"
            }`}
          >
            Só não lidas
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/60 hover:text-[#ff6a00]"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/60 hover:text-[#ff6a00]"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {loading && <p className="p-8 text-center text-sm text-white/40">Carregando alertas...</p>}
        {!loading && filtered.length === 0 && (
          <p className="p-10 text-center text-sm text-white/40">Nenhum alerta com esses filtros.</p>
        )}
        {filtered.map((item) => {
          const Icon = ICONS[item.type] || Bell;
          const severity = SEVERITY[item.severity] || SEVERITY["info"]!;
          return (
            <div
              key={item.id}
              className={`flex flex-col gap-2 border-b border-white/5 p-4 sm:flex-row sm:items-start sm:gap-4 ${
                item.read ? "opacity-60" : ""
              }`}
            >
              <Icon className="h-5 w-5 shrink-0 text-white/60" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{item.title}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${severity.className}`}>
                    {severity.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/60">{item.body}</p>
                <p className="mt-1 text-[10px] text-white/35">
                  {new Date(item.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.link && (
                  <Link
                    to={item.link}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:border-[#ff6a00]/50 hover:text-[#ff6a00]"
                  >
                    Abrir
                  </Link>
                )}
                {!item.read && (
                  <button
                    type="button"
                    onClick={() => void markRead([item.id])}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/50 hover:text-white"
                  >
                    Lida
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- Push & Preferências --------------------------- */

function ConfigTab() {
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ supported: boolean; permission: string; subscribed: boolean } | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshDevices = () =>
    listPushDevices()
      .then((res) => setDevices(res.devices))
      .catch(() => setDevices([]));

  useEffect(() => {
    getNotificationSettings()
      .then((res) => setSettings(res.settings as any))
      .catch((err: any) => toast.error(err?.message || "Falha ao carregar preferências"));
    getPushStatus().then(setStatus);
    void refreshDevices();
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setSettings((prev) => ({ ...(prev || {}), [key]: value }));
    setSaving(true);
    try {
      const res = await updateNotificationSettings({ data: { [key]: value } as any });
      setSettings(res.settings as any);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handlePush = async (activate: boolean) => {
    setBusy(true);
    try {
      const result = activate ? await enablePush() : await disablePush();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setStatus(await getPushStatus());
      await refreshDevices();
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

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/70">
          <Smartphone className="h-4 w-4" style={{ color: ORANGE }} /> Push neste dispositivo
        </h3>

        <p className="text-xs text-white/55">
          Ative para receber alertas mesmo com o painel fechado. No iPhone é necessário instalar o app na tela de
          início (Compartilhar → Adicionar à Tela de Início) e ativar por dentro do app.
        </p>

        <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/60">
          Suporte: <strong className="text-white">{status?.supported ? "sim" : "não"}</strong> · Permissão:{" "}
          <strong className="text-white">{status?.permission || "—"}</strong> · Inscrito:{" "}
          <strong className="text-white">{status?.subscribed ? "sim" : "não"}</strong>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handlePush(true)}
            className="rounded-xl bg-[#ff6a00] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            Ativar push
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handlePush(false)}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white/70 disabled:opacity-50"
          >
            Desativar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleTest()}
            className="flex items-center gap-2 rounded-xl border border-[#ff6a00]/40 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-[#ff6a00] disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" /> Testar
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Dispositivos registrados</p>
          {devices.length === 0 && <p className="text-xs text-white/40">Nenhum dispositivo ativo.</p>}
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
            >
              <span className="truncate">{device.device_name || "Dispositivo"}</span>
              <span className={device.active ? "text-emerald-400" : "text-white/40"}>
                {device.active ? "ativo" : "inativo"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/70">
          <Cog className="h-4 w-4" style={{ color: ORANGE }} /> O que quero receber {saving && <span className="text-[10px] text-white/40">salvando...</span>}
        </h3>

        {[
          { key: "push_enabled", label: "Enviar push para dispositivos", hint: "Desligue para receber apenas no painel" },
          { key: "sound_enabled", label: "Som de alerta no painel", hint: "Bip curto ao chegar um novo alerta" },
        ].map((item) => (
          <ToggleRow
            key={item.key}
            label={item.label}
            hint={item.hint}
            checked={settings?.[item.key] !== false}
            onChange={(value) => void toggle(item.key, value)}
          />
        ))}

        <div className="h-px bg-white/10" />

        {CATEGORIES.map((item) => (
          <ToggleRow
            key={item.key}
            label={item.label}
            hint={item.hint}
            checked={settings?.[item.key] !== false}
            onChange={(value) => void toggle(item.key, value)}
          />
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/25"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-white/45">{hint}</span>
      </span>
      <span
        className={`mt-1 h-5 w-9 shrink-0 rounded-full p-0.5 transition ${checked ? "bg-[#ff6a00]" : "bg-white/15"}`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

/* --------------------------- Avisos para alunos --------------------------- */

type NotificationType = "general" | "course" | "lesson" | "live";

function BroadcastTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>("general");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      toast.error("Preencha o título e a mensagem");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        title,
        message,
        type,
        target_type: "all",
        sent_by: user?.id,
      });
      if (error) throw error;
      toast.success("Aviso enviado com sucesso!");
      setTitle("");
      setMessage("");
    } catch (error: any) {
      toast.error("Erro ao enviar notificação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const notificationTypes = [
    { value: "general", label: "Novidade Geral", icon: Info, color: "text-blue-400" },
    { value: "course", label: "Novo Curso", icon: Library, color: "text-purple-400" },
    { value: "lesson", label: "Nova Aula", icon: Play, color: "text-green-400" },
    { value: "live", label: "Aula ao Vivo", icon: Clapperboard, color: "text-red-400" },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Título</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Nova aula disponível!"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[16px] transition focus:border-[#ff6a00] focus:outline-none md:text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Mensagem</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreva o que há de novo..."
          rows={4}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 transition focus:border-[#ff6a00] focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-white/80">Tipo</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {notificationTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setType(item.value as NotificationType)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                type === item.value
                  ? "border-[#ff6a00] bg-[#ff6a00]/10 text-[#ff6a00]"
                  : "border-white/5 bg-black/20 text-white/60 hover:border-white/20"
              }`}
            >
              <item.icon className={`h-5 w-5 ${type === item.value ? "text-[#ff6a00]" : item.color}`} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-4 font-bold text-white shadow-lg shadow-[#ff6a00]/20 transition hover:bg-[#e65f00] disabled:opacity-50"
      >
        {loading ? "Enviando..." : (<><Send className="h-5 w-5" /> Enviar para todos os alunos</>)}
      </button>
    </form>
  );
}
