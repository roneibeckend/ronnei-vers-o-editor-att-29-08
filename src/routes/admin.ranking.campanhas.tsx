import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, Plus, Calendar, Clock, Award, Loader2 } from "lucide-react";
import { getAllCampaigns, createCampaign, finishCampaign, getCampaignWinners } from "@/lib/campaigns.functions";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/admin/ranking/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas e Premiações · Admin" }] }),
  component: AdminCampaigns,
});

function AdminCampaigns() {
  const queryClient = useQueryClient();
  const fetchCampaigns = useServerFn(getAllCampaigns);
  const addCampaign = useServerFn(createCampaign);
  const endCampaign = useServerFn(finishCampaign);
  const fetchWinners = useServerFn(getCampaignWinners);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => fetchCampaigns({})
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    prizeDescription: "",
    rewardedPositions: "1, 2, 3"
  });

  const createMutation = useMutation({
    mutationFn: () => addCampaign({
      data: {
        name: formData.name,
        description: formData.description,
        startDate: `${formData.startDate}T00:00:00Z`,
        endDate: `${formData.endDate}T23:59:59Z`,
        prizeDescription: formData.prizeDescription,
        rewardedPositions: formData.rewardedPositions.split(',').map(n => parseInt(n.trim()))
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      setIsFormOpen(false);
      toast.success("Campanha criada!");
    }
  });

  const endMutation = useMutation({
    mutationFn: (campaignId: string) => endCampaign({ data: { campaignId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast.success("Campanha encerrada e vencedores registrados!");
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-tight">
            <Award className="text-[#ff6a00]" /> Campanhas e Premiações
          </h2>
          <p className="text-sm text-white/40">Gerencie competições temporárias para engajar os alunos.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-[#ff6a00] text-black px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition"
        >
          <Plus size={16} /> Nova Campanha
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-[#111] border border-white/10 p-6 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Nome da Campanha</label>
            <input 
              className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00]" 
              placeholder="Ex: Maratona de Inverno" 
              onChange={e => setFormData({...formData, name: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Descrição</label>
            <textarea 
              className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00] min-h-[100px]" 
              placeholder="Descreva as regras ou o objetivo..." 
              onChange={e => setFormData({...formData, description: e.target.value})} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Início</label>
              <input type="date" className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00]" onChange={e => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Fim</label>
              <input type="date" className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00]" onChange={e => setFormData({...formData, endDate: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Premiação</label>
            <input 
              className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00]" 
              placeholder="Ex: Mentoria Exclusiva ou Voucher de R$ 100" 
              onChange={e => setFormData({...formData, prizeDescription: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">Posições Premiadas (separadas por vírgula)</label>
            <input 
              className="w-full bg-black border border-white/10 p-3 rounded-lg text-white outline-none focus:border-[#ff6a00]" 
              placeholder="Ex: 1, 2, 3 ou 1, 2, 3, 4, 5" 
              defaultValue="1, 2, 3"
              onChange={e => setFormData({...formData, rewardedPositions: e.target.value})} 
            />
          </div>
          <button 
            onClick={() => createMutation.mutate()} 
            disabled={createMutation.isPending}
            className="bg-[#ff6a00] text-black w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Campanha"}
          </button>
        </div>
      )}

      <div className="space-y-8">
        <section>
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
            <Clock className="h-4 w-4 text-[#ff6a00]" /> Campanhas Ativas
          </div>
          <div className="grid gap-4">
            {campaigns?.filter(c => c.is_active).map(c => (
              <div key={c.id} className="bg-[#111] border border-white/10 p-6 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">{c.name}</h3>
                  <p className="text-xs text-white/40 italic">{c.prize_description}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/30">
                      <Calendar size={12} /> {format(new Date(c.start_date), "dd/MM/yy", { locale: ptBR })} - {format(new Date(c.end_date), "dd/MM/yy", { locale: ptBR })}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#ff6a00]">
                      <Trophy size={12} /> Tops: {c.rewarded_positions.join(", ")}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (confirm("Deseja realmente encerrar esta campanha e registrar os vencedores com base no ranking atual?")) {
                      endMutation.mutate(c.id);
                    }
                  }} 
                  className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                  disabled={endMutation.isPending}
                >
                  {endMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Encerrar Agora"}
                </button>
              </div>
            ))}
            {campaigns?.filter(c => c.is_active).length === 0 && (
              <div className="p-8 border border-dashed border-white/5 rounded-xl text-center text-white/20 text-xs italic">
                Nenhuma campanha ativa no momento.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
            <Trophy className="h-4 w-4 text-[#ff6a00]" /> Histórico de Campanhas
          </div>
          <div className="grid gap-4">
            {campaigns?.filter(c => !c.is_active).map(c => (
              <div key={c.id} className="bg-[#111]/50 border border-white/5 p-6 rounded-xl opacity-80 grayscale-[0.5] hover:grayscale-0 hover:opacity-100 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold">{c.name}</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">{format(new Date(c.start_date), "MMMM yyyy", { locale: ptBR })}</p>
                  </div>
                  <div className="px-3 py-1 bg-white/5 rounded text-[8px] font-black uppercase tracking-tighter">Concluída</div>
                </div>
                
                <div className="text-xs text-white/60 mb-4 bg-white/5 p-3 rounded-lg border border-white/5">
                  <span className="font-bold text-[#ff6a00] mr-2">PRÊMIO:</span> {c.prize_description}
                </div>

                <CampaignWinnersList campaignId={c.id} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CampaignWinnersList({ campaignId }: { campaignId: string }) {
  const getWinners = useServerFn(getCampaignWinners);
  const { data: winners, isLoading } = useQuery({
    queryKey: ["campaign-winners", campaignId],
    queryFn: () => getWinners({ data: { campaignId } })
  });

  if (isLoading) return <div className="text-[10px] text-white/20">Carregando vencedores...</div>;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Vencedores Registrados</div>
      <div className="flex flex-wrap gap-2">
        {winners?.map(w => (
          <div key={w.id} className="flex items-center gap-2 bg-black/40 border border-white/5 px-3 py-2 rounded-lg">
            <div className="text-[10px] font-black text-[#ff6a00]">{w.position}º</div>
            <img src={w.profiles?.avatar_url || "/placeholder.svg"} className="h-5 w-5 rounded-full object-cover" />
            <div className="text-[10px] font-medium truncate max-w-[100px]">{w.profiles?.name}</div>
          </div>
        ))}
        {winners?.length === 0 && <div className="text-[10px] text-white/20 italic">Nenhum vencedor registrado.</div>}
      </div>
    </div>
  );
}
