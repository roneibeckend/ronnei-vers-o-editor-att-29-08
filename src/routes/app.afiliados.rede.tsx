import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getAffiliateNetwork } from "@/lib/affiliates.functions";
import { 
  Users, 
  TrendingUp, 
  Calendar,
  Loader2
} from "lucide-react";

export const Route = createFileRoute("/app/afiliados/rede")({
  head: () => ({
    meta: [
      { title: "Minha Rede de Afiliados" },
      { name: "description", content: "Acompanhe indicações, níveis e desempenho da sua rede." },
      { property: "og:title", content: "Minha Rede de Afiliados" },
      { property: "og:description", content: "Acompanhe indicações, níveis e desempenho da sua rede." },
    ],
  }),
  component: AffiliateNetworkPage,
});

function AffiliateNetworkPage() {
  const { user } = useAuth();

  const { data: network, isLoading } = useQuery({
    queryKey: ["affiliate-network", user?.id],
    enabled: !!user?.id,
    queryFn: () => getAffiliateNetwork({ data: { id: user?.id as string } })
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left overflow-x-hidden">
      <div className="break-words">
        <h2 className="text-xl font-bold">Sua Rede de Indicações</h2>
        <p className="text-sm text-muted-foreground">Acompanhe os afiliados que se cadastraram através do seu link e as comissões geradas.</p>
      </div>

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass p-5 sm:p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-fire/10 text-fire shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5 truncate">Total de Indicados</div>
              <div className="text-2xl sm:text-3xl font-display font-black text-white">{network?.length || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              <th className="px-6 py-4 whitespace-nowrap">Afiliado</th>
              <th className="px-6 py-4 whitespace-nowrap">Data Cadastro</th>
              <th className="px-6 py-4 whitespace-nowrap text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {network && network.length > 0 ? (
              network.map((item: any) => (
                <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{item.profile?.name || "Sem Nome"}</div>
                    <div className="text-xs text-white/40">{item.profile?.email}</div>
                  </td>
                  <td className="px-6 py-4 text-white/60 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      item.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                      item.status === 'blocked' ? 'bg-red-500/10 text-red-500' :
                      'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {item.status === 'active' ? 'Ativo' : item.status === 'blocked' ? 'Bloqueado' : 'Pendente'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground italic">
                  Você ainda não possui indicações em sua rede.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}