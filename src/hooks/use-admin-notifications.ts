import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AdminNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  read: boolean;
  read_at: string | null;
  metadata: any;
  created_at: string;
};

/**
 * Central de notificações administrativas em tempo real.
 * Assina a tabela `admin_notifications` via Supabase Realtime e mantém
 * a contagem de não lidas + alertas visuais/sonoros.
 */
export function useAdminNotifications(enabled: boolean, soundEnabled = true) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("admin_notifications").select("id", { count: "exact", head: true }).eq("read", false),
    ]);

    setItems((data || []) as AdminNotification[]);
    setUnread(count || 0);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;

    // Nome único por instância: o supabase-js reutiliza canais com o mesmo
    // nome, e adicionar callbacks em um canal já inscrito dispara o erro
    // "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase
      .channel(`admin-notifications-live-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const row = payload.new as AdminNotification;
          setItems((prev) => [row, ...prev].slice(0, 30));
          setUnread((prev) => prev + 1);

          const message = row.title;
          if (row.severity === "critical") toast.error(message, { description: row.body, duration: 10000 });
          else if (row.severity === "warning") toast.warning(message, { description: row.body });
          else if (row.severity === "success") toast.success(message, { description: row.body });
          else toast.info(message, { description: row.body });

          if (soundRef.current) playChime(row.severity);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "admin_notifications" },
        (payload) => {
          const row = payload.new as AdminNotification;
          setItems((prev) => prev.map((item) => (item.id === row.id ? row : item)));
          if (row.read) setUnread((prev) => Math.max(0, prev - 1));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setItems((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    setUnread((prev) => Math.max(0, prev - ids.length));
    await supabase
      .from("admin_notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .in("id", ids);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnread(0);
    await supabase
      .from("admin_notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("read", false);
  }, []);

  return { items, unread, loading, reload: load, markRead, markAllRead };
}

/** Bip curto gerado no navegador (sem arquivos externos). */
function playChime(severity: string) {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = severity === "critical" ? 880 : 620;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* som é opcional */
  }
}
