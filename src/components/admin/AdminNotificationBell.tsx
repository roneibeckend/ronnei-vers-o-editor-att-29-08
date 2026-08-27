import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, ShieldAlert, TrendingUp, Users, LifeBuoy, Wallet, Mail, Cog } from "lucide-react";
import { useAdminNotifications, type AdminNotification } from "@/hooks/use-admin-notifications";

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

const SEVERITY_COLOR: Record<string, string> = {
  info: "text-sky-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
  critical: "text-red-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AdminNotificationBell({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { items, unread, loading, markRead, markAllRead } = useAdminNotifications(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const size = compact ? "h-11 w-11" : "h-10 w-10";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative grid ${size} place-items-center rounded-lg border border-white/10 transition-colors hover:border-[#ff6a00]/50 hover:text-[#ff6a00]`}
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: ORANGE }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              Notificações {unread > 0 && `(${unread})`}
            </span>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="flex items-center gap-1 text-[11px] font-semibold text-white/50 hover:text-[#ff6a00]"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
            {loading && <p className="px-4 py-8 text-center text-sm text-white/40">Carregando...</p>}
            {!loading && items.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-white/40">Nenhuma notificação por aqui.</p>
            )}
            {items.map((item: AdminNotification) => {
              const Icon = ICONS[item.type] || Bell;
              return (
                <Link
                  key={item.id}
                  to={item.link || "/admin/notificacoes"}
                  onClick={() => {
                    if (!item.read) void markRead([item.id]);
                    setOpen(false);
                  }}
                  className={`flex gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5 ${
                    item.read ? "opacity-60" : ""
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_COLOR[item.severity] || "text-white/60"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-white/40">{timeAgo(item.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-white/60">{item.body}</p>
                  </div>
                  {!item.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: ORANGE }} />}
                </Link>
              );
            })}
          </div>

          <Link
            to="/admin/notificacoes"
            onClick={() => setOpen(false)}
            className="block border-t border-white/10 px-4 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#ff6a00] hover:bg-white/5"
          >
            Ver central completa
          </Link>
        </div>
      )}
    </div>
  );
}
