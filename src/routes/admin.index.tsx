import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users as UsersIcon, 
  DollarSign, 
  Library, 
  TrendingUp,
  ChevronRight,
  AlertCircle,
  Activity,
  UserCheck,
  ShieldAlert,
  GraduationCap
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Visão Geral · Admin" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { role, isLoading: authLoading, isAdmin, hasModule } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAdmin && !hasModule("suporte") && !hasModule("conteudo") && !hasModule("alunos") && !hasModule("financeiro")) {
      toast.error("Sua conta não tem acesso a esta área.");
      navigate({ to: "/app" });
    }
  }, [authLoading, isAdmin, hasModule, navigate]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      if (role === 'student') return null;
      
      const [
        studentsRes,
        coursesRes,
        paymentsRes,
        ticketsRes,
        recentLogsRes
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).in('status', ['aluno', 'student']),
        supabase.from('courses').select('id'),
        supabase.from('payments').select('net_amount').in('status', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('integration_logs' as any).select('id, integration_name, status, message, created_at').order('created_at', { ascending: false }).limit(5)
      ]);

      const totalRevenue = (paymentsRes.data || []).reduce((acc, p) => acc + Number(p.net_amount || 0), 0);

      return {
        students: studentsRes.count || 0,
        courses: coursesRes.data?.length || 0,
        sales: paymentsRes.data?.length || 0,
        revenue: totalRevenue,
        pendingTickets: ticketsRes.count || 0,
        recentLogs: recentLogsRes.data || []
      };
    },
    enabled: role !== 'student' && !authLoading,
    staleTime: 1000 * 60 * 5 // 5 minutes cache
  });

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  if (!isAdmin && !hasModule("suporte") && !hasModule("conteudo") && !hasModule("alunos") && !hasModule("financeiro")) {
    return null; // Será redirecionado pelo useEffect
  }

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl bg-white/5" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
          <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Total Alunos", value: stats?.students, icon: UsersIcon, color: "text-blue-400" },
    { label: "Vendas Realizadas", value: stats?.sales, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Cursos Ativos", value: stats?.courses, icon: Library, color: "text-[#ff6a00]" },
    { label: "Suporte Pendente", value: stats?.pendingTickets, icon: AlertCircle, color: "text-red-400" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {isAdmin && <OperationalSummaryStrip />}

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4">
        {cards.map((card, i) => (
          <div key={i} className="p-4 sm:p-6 rounded-xl border border-white/5 bg-[#111] group hover:border-white/10 transition active:scale-[0.98] touch-action-manipulation">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg bg-white/5 ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Tempo Real</span>
            </div>
            <div className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">{card.value}</div>
            <div className="text-[10px] sm:text-xs text-white/40 mt-1 uppercase tracking-wider font-medium">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="p-4 sm:p-6 rounded-xl border border-white/5 bg-[#111] 2xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="font-bold uppercase tracking-tight text-sm sm:text-base">Atalhos Rápidos</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { to: "/admin/cursos", label: "Catálogo de Conteúdo", visible: isAdmin },
              { to: "/admin/alunos", label: "Base de Alunos e Matrículas", visible: hasModule("alunos") },
              { to: "/admin/suporte", label: "Central de Suporte (Tickets)", highlight: (stats?.pendingTickets || 0) > 0, visible: hasModule("suporte") },
              { to: "/admin/receitas", label: "Central de Receitas", visible: isAdmin },
              { to: "/admin/usuarios", label: "Gestão de Equipe", visible: isAdmin, icon: UserCheck },
              { to: "/admin/materiais", label: "Gestão de Materiais", visible: isAdmin, icon: Library },
            ].filter(link => link.visible).map((link, i) => (
              <Link 
                key={i} 
                to={link.to}
                className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{link.label}</span>
                  {link.highlight && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-[#ff6a00] transition" />
              </Link>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6 rounded-xl border border-white/5 bg-[#111]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="font-bold uppercase tracking-tight flex items-center gap-2 text-sm sm:text-base">
              <Activity className="h-4 w-4 text-[#ff6a00]" />
              Saúde do Sistema
            </h3>
            <Link to="/admin/integracoes" className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00] hover:brightness-125 transition">Ver Todos</Link>
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-2">
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-[#ff6a00]/10 flex items-center justify-center text-[#ff6a00] mb-4">
                <DollarSign className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.revenue || 0)}
              </h3>
              <p className="text-[10px] sm:text-sm text-white/40 mt-1 uppercase tracking-widest font-bold">Faturamento Estimado</p>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/20 mb-2">Logs de Integração</p>
              {stats?.recentLogs && stats.recentLogs.length > 0 ? (
                stats.recentLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between text-[10px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white/40">{log.integration_name}</span>
                      {log.status !== 'success' && log.message && (
                        <span className="text-[8px] text-red-500/50 truncate max-w-[120px]" title={log.message}>{log.message}</span>
                      )}
                    </div>
                    <span className={log.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                      {log.status === 'success' ? 'OK' : 'Falha'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-white/20 italic">Nenhuma atividade recente</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <Activity className={`animate-spin ${className}`} />;
}
/** Resumo operacional das últimas 24h + atalho para a central de notificações. */
function OperationalSummaryStrip() {
  const { data } = useQuery({
    queryKey: ["admin-operational-summary"],
    queryFn: async () => {
      const { getOperationalSummary } = await import("@/lib/admin-notifications.functions");
      return getOperationalSummary();
    },
    refetchInterval: 60_000,
  });

  const brl = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  const items = [
    { label: "Vendas 24h", value: data ? String(data.sales) : "—" },
    { label: "Receita 24h", value: data ? brl(data.revenue) : "—" },
    { label: "Novos alunos", value: data ? String(data.newStudents) : "—" },
    { label: "Tickets", value: data ? String(data.tickets) : "—" },
    { label: "Erros críticos", value: data ? String(data.criticalErrors) : "—" },
    { label: "Alertas não lidos", value: data ? String(data.unread) : "—" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Resumo operacional · 24 horas
        </span>
        <Link
          to="/admin/notificacoes"
          className="text-[11px] font-bold uppercase tracking-widest text-[#ff6a00] hover:underline"
        >
          Central de notificações
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/5 bg-black/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{item.label}</p>
            <p className="mt-1 truncate text-base font-extrabold">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
