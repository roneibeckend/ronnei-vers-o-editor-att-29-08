import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("[useNotifications] Error fetching notifications:", error);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error("[useNotifications] Unexpected error:", err);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
  });

  const { data: userNotifications = [] } = useQuery({
    queryKey: ["user_notifications", user?.id || "anonymous"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("user_notifications")
          .select("*")
          .eq("user_id", user?.id as string);

        if (error) {
          console.error("[useNotifications] Error fetching user_notifications:", error);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error("[useNotifications] Unexpected error user_notifications:", err);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
  });

  const unreadCount = notifications.filter(
    (n) => !userNotifications.some((un) => un.notification_id === n.id && un.read_at)
  ).length;

  const markAsRead = async (notificationId: string, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!user) return;

    try {
      const { error } = await supabase.from("user_notifications").upsert(
        {
          user_id: user.id,
          notification_id: notificationId,
          read_at: new Date().toISOString(),
        },
        { onConflict: "user_id,notification_id" }
      );

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["user_notifications", user?.id || "anonymous"] });
    } catch (error) {
      console.error("Erro ao marcar como lida:", error);
    }
  };

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications_realtime_${user.id}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          
          const newNotif = payload.new as any;
          toast(newNotif.title, {
            description: newNotif.message,
            icon: <Bell className="h-4 w-4 text-[#ff6a00]" />,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return {
    notifications,
    unreadCount,
    userNotifications,
    isLoading,
    markAsRead,
    markAllAsRead: async () => {
      if (!user) return;
      const unreadNotifications = notifications.filter(
        (n) => !userNotifications.some((un) => un.notification_id === n.id && un.read_at)
      );
      if (unreadNotifications.length === 0) return;
      
      try {
        const rows = unreadNotifications.map(n => ({
          user_id: user.id,
          notification_id: n.id,
          read_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("user_notifications")
          .upsert(rows, { 
            onConflict: "user_id,notification_id",
            ignoreDuplicates: false 
          });

        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["user_notifications", user?.id || "anonymous"] });
        toast.success("Todas as notificações foram marcadas como lidas.");
      } catch (error) {
        console.error("Erro ao marcar todas como lidas:", error);
        toast.error("Não foi possível limpar as notificações.");
      }
    },
  };
}