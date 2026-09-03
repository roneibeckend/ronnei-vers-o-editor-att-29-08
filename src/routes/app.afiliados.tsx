import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { 
  Users, 
  LayoutDashboard, 
  Link as LinkIcon, 
  Wallet, 
  Settings, 
  ChevronRight,
  TrendingUp,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/afiliados")({
  component: AffiliateLayout,
});

function AffiliateLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAffiliate, setIsAffiliate] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: affiliateProfile } = useQuery({
    queryKey: ["affiliate-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", user?.id as string)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (affiliateProfile) {
      setIsAffiliate(true);
      setIsLoading(false);
    } else if (user?.id) {
      // Se carregou o perfil e não existe, não é afiliado ainda
      setIsAffiliate(false);
      setIsLoading(false);
    }
  }, [affiliateProfile, user?.id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  // Se não for afiliado, mostrar convite para cadastro
  if (!isAffiliate) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="glass p-8 rounded-2xl border border-white/5 text-center">
          <div className="mb-6 rounded-full bg-fire/10 w-20 h-20 flex items-center justify-center mx-auto">
            <TrendingUp className="w-10 h-10 text-fire" />
          </div>
          <h1 className="text-3xl font-display font-black mb-4">Torne-se um Afiliado</h1>
          <p className="text-muted-foreground mb-8">
            Divulgue nossos cursos e receba comissões por cada venda realizada através do seu link exclusivo.
          </p>
          
          <div className="grid gap-4 text-left mb-8">
            <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="bg-fire/20 p-2 rounded-lg h-fit"><TrendingUp className="w-5 h-5 text-fire" /></div>
              <div>
                <h3 className="font-bold">Comissões por venda</h3>
                <p className="text-xs text-muted-foreground">Ganhe uma fatia generosa de cada venda que você trouxer.</p>
              </div>
            </div>
            <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="bg-fire/20 p-2 rounded-lg h-fit"><LinkIcon className="w-5 h-5 text-fire" /></div>
              <div>
                <h3 className="font-bold">Links Personalizados</h3>
                <p className="text-xs text-muted-foreground">Gere links únicos para cada curso da nossa vitrine.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={async () => {
              try {
                const { requestAffiliateRegistration } = await import(
                  "@/lib/affiliates.functions"
                );
                await requestAffiliateRegistration({ data: {} });
                toast.success("Solicitação enviada! Aguarde a aprovação administrativa.");
                window.location.reload();
              } catch (error: any) {
                toast.error("Erro ao solicitar cadastro: " + error.message);
              }
            }}
            className="btn-fire w-full py-4 text-lg font-bold"
          >
            Quero ser Afiliado
          </button>
        </div>
      </div>
    );
  }

  if (affiliateProfile?.status === 'pending') {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
        <h2 className="text-2xl font-bold mb-2">Solicitação em Análise</h2>
        <p className="text-muted-foreground">
          Sua solicitação para se tornar afiliado está sendo revisada por nossa equipe administrativa. 
          Você receberá uma notificação assim que for aprovado.
        </p>
        <Link to="/app" className="btn-ghost-fire mt-8">Voltar ao Início</Link>
      </div>
    );
  }

  if (affiliateProfile?.status === 'blocked') {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
        <h2 className="text-2xl font-bold mb-2">Conta Bloqueada</h2>
        <p className="text-muted-foreground">
          Seu acesso ao programa de afiliados foi suspenso. Entre em contato com o suporte para mais informações.
        </p>
      </div>
    );
  }

  const navItems = [
    { label: "Visão Geral", to: "/app/afiliados", icon: LayoutDashboard },
    { label: "Links", to: "/app/afiliados/links", icon: LinkIcon },
    { label: "Materiais", to: "/app/afiliados/materiais", icon: Users },
    { label: "Financeiro", to: "/app/afiliados/financeiro", icon: Wallet },
    { label: "Rede", to: "/app/afiliados/rede", icon: Users },
    { label: "Configurações", to: "/app/afiliados/config", icon: Settings },
  ];

  return (
    <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden px-4 sm:px-0">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-display font-black text-white leading-tight break-words">Painel do Afiliado</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 break-words">Gerencie suas vendas e comissões.</p>
        </div>
        
        <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full lg:w-auto">
          <div className="bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5 flex flex-col items-center sm:items-start">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Saldo Disponível</div>
            <div className="text-lg sm:text-xl font-display font-black text-fire truncate w-full text-center sm:text-left">
              R$ {affiliateProfile?.balance?.toFixed(2).replace(".", ",")}
            </div>
          </div>
          <div className="bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5 flex flex-col items-center sm:items-start">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Ganho</div>
            <div className="text-lg sm:text-xl font-display font-black text-white truncate w-full text-center sm:text-left">
              R$ {affiliateProfile?.total_earnings?.toFixed(2).replace(".", ",")}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5 overflow-x-auto no-scrollbar scroll-smooth">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: "bg-fire text-white" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-white/5" }}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex-shrink-0"
          >
            <item.icon className="w-3.5 h-3.5 sm:w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
