import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type UserRole = "admin" | "manager" | "agent" | "student";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: session, isLoading: isLoadingSession } = useQuery({
    queryKey: ["auth-session"],
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  // Mantém a sessão em cache sincronizada com o estado real do Supabase.
  // Sem isso, o cache podia manter a sessão de um usuário anterior (ex.: admin)
  // e exibir o nome/e-mail errado depois de um novo login no mesmo navegador.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      const cached = queryClient.getQueryData<any>(["auth-session"]);
      const changedUser = cached?.user?.id !== newSession?.user?.id;

      queryClient.setQueryData(["auth-session"], newSession ?? null);

      if (changedUser || event === "SIGNED_OUT") {
        queryClient.removeQueries({ queryKey: ["user-profile"] });
        queryClient.removeQueries({ queryKey: ["user-role"] });
        queryClient.removeQueries({ queryKey: ["admin-permissions"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);


  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["user-profile", session?.user?.id],
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const { data: userRole, isLoading: isLoadingRole } = useQuery({
    queryKey: ["user-role", session?.user?.id],
    staleTime: 1000 * 60 * 10, // 10 minutes
    queryFn: async () => {
      if (!session?.user?.id) return "student" as UserRole;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching role:", error);
        return "student" as UserRole;
      }
      return (data?.role as UserRole) || "student";
    },
    enabled: !!session?.user?.id,
  });

  const { data: permissions, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["admin-permissions", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id || userRole === "student") return [];
      const { data } = await supabase
        .from("admin_permissions")
        .select("module, can_access")
        .eq("user_id", session.user.id)
        .eq("can_access", true);
      return data || [];
    },
    enabled: !!session?.user?.id && userRole !== "student" && !isLoadingRole,
  });

  const hasModule = (moduleName: string) => {
    if (userRole === "admin") return true;
    return permissions?.some(p => p.module === moduleName) ?? false;
  };

  useEffect(() => {
    const handleProfileUpdate = (event: any) => {
      const { avatar_url } = event.detail;
      queryClient.setQueryData(["user-profile", session?.user?.id], (old: any) => 
        old ? { ...old, avatar_url } : old
      );
    };

    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, [session?.user?.id, queryClient]);

  return {
    session,
    user: session?.user ?? null,
    role: userRole,
    profile,
    isAdmin: userRole === "admin",
    isStudent: profile?.status === "student",
    isLead: !profile?.status || profile?.status === "lead",
    isManager: userRole === "manager",
    isAgent: userRole === "agent",
    hasModule,
    isLoading: isLoadingSession || isLoadingRole || isLoadingPermissions || isLoadingProfile,
  };
}
