import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";


import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Loader2,
  UserCheck,
  Ban,
  Settings,
  Plus,
  Trash2,
  Image as ImageIcon,
  Video,
  FileText
} from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveAffiliateMaterial, deleteAffiliateMaterial, updateAffiliateStatus } from "@/lib/affiliates.functions";

export const Route = createFileRoute("/admin/afiliados")({
  head: () => ({
    meta: [
      { title: "Afiliados — Admin" },
      { name: "description", content: "Gestão de afiliados, comissões e aprovações da plataforma Espetinho na Veia." },
      { property: "og:title", content: "Afiliados — Admin" },
      { property: "og:description", content: "Gestão de afiliados, comissões e aprovações da plataforma Espetinho na Veia." },
    ],
  }),
  component: AdminAffiliatesPage,
});

function AdminAffiliatesPage() {
  const navigate = useNavigate();
  const { role, isLoading: isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<any>(null);

  useEffect(() => {
    if (!isLoadingAuth && role === "student") {
      toast.error("Acesso restrito.");
      navigate({ to: "/admin" });
    }
  }, [role, isLoadingAuth, navigate]);


  const { data: affiliates, isLoading } = useQuery({
    queryKey: ["admin-affiliates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select(`
          *,
          profile:profiles(name, email)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: materials, isLoading: isLoadingMaterials } = useQuery({
    queryKey: ["admin-affiliate-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_materials" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as any[];
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'blocked' | 'pending' }) => {
      await updateAffiliateStatus({ data: { id, status } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-affiliates"] });
      toast.success("Status atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar: " + error.message);
    }
  });

  const saveMaterialMutation = useMutation({
    mutationFn: (data: any) => saveAffiliateMaterial({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-affiliate-materials"] });
      toast.success("Material salvo!");
      setIsEditing(false);
      setCurrentMaterial(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar: " + error.message);
    }
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (id: string) => deleteAffiliateMaterial({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-affiliate-materials"] });
      toast.success("Material excluído!");
    }
  });

  const filtered = affiliates?.filter(a => 
    a.profile?.name?.toLowerCase().includes(search.toLowerCase()) || 
    a.profile?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      <PageHeader 
        title="Gestão de Afiliados" 
        subtitle="Aprove, bloqueie e gerencie materiais de apoio para seus parceiros." 
      />

      <Tabs defaultValue="affiliates" className="w-full">
        <TabsList className="bg-white/5 border border-white/5">
          <TabsTrigger value="affiliates">Afiliados</TabsTrigger>
          <TabsTrigger value="materials">Materiais de Apoio</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates" className="space-y-6 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
            <input 
              placeholder="Buscar afiliado por nome ou e-mail..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 py-3 pl-10 pr-4 rounded-xl text-sm outline-none focus:border-fire/50" 
            />
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-fire" />
            </div>
          ) : (
            <div className="border border-white/5 rounded-2xl overflow-x-auto bg-[#111]">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <th className="px-6 py-4">Afiliado</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Comissão (%)</th>
                    <th className="px-6 py-4">Ganhos / Saldo</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered && filtered.length > 0 ? (
                    filtered.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{a.profile?.name || "Sem Nome"}</div>
                          <div className="text-xs text-white/40">{a.profile?.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            a.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' :
                            a.status === 'blocked' ? 'bg-red-500/10 text-red-500' :
                            'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {a.status === 'active' ? 'Ativo' : a.status === 'blocked' ? 'Bloqueado' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className="text-white font-medium">{a.commission_rate}%</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-white font-bold">R$ {a.total_earnings?.toFixed(2)}</div>
                          <div className="text-fire text-xs font-bold">Saldo: R$ {a.balance?.toFixed(2)}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {a.status !== 'active' && (
                              <button 
                                onClick={() => updateStatusMutation.mutate({ id: a.id, status: 'active' })}
                                className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition"
                                title="Aprovar / Ativar"
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                            )}
                            {a.status !== 'blocked' && (
                              <button 
                                onClick={() => updateStatusMutation.mutate({ id: a.id, status: 'blocked' })}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition"
                                title="Bloquear"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">
                        Nenhum afiliado encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-6 pt-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">Materiais de Divulgação</h3>
            <button 
              onClick={() => {
                setCurrentMaterial({ category: 'banner' });
                setIsEditing(true);
              }}
              className="btn-fire text-xs px-4 py-2 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Material
            </button>
          </div>

          {isEditing && (
            <div className="glass p-6 rounded-2xl border border-fire/20 bg-fire/5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40">Título</label>
                  <input 
                    value={currentMaterial?.title || ''}
                    onChange={(e) => setCurrentMaterial({ ...currentMaterial, title: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-fire"
                    placeholder="Ex: Banner Stories Lançamento"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40">Categoria</label>
                  <select 
                    value={currentMaterial?.category || 'banner'}
                    onChange={(e) => setCurrentMaterial({ ...currentMaterial, category: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-fire"
                  >
                    <option value="banner">Banner / Arte</option>
                    <option value="video">Vídeo</option>
                    <option value="copy">Texto / Copy</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40">URL do Arquivo</label>
                  <input 
                    value={currentMaterial?.file_url || ''}
                    onChange={(e) => setCurrentMaterial({ ...currentMaterial, file_url: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-fire"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40">Descrição</label>
                  <input 
                    value={currentMaterial?.description || ''}
                    onChange={(e) => setCurrentMaterial({ ...currentMaterial, description: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-fire"
                    placeholder="Opcional..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition">Cancelar</button>
                <button 
                  onClick={() => saveMaterialMutation.mutate(currentMaterial)}
                  className="btn-fire px-6 py-2 text-sm font-bold"
                  disabled={saveMaterialMutation.isPending}
                >
                  {saveMaterialMutation.isPending ? 'Salvando...' : 'Salvar Material'}
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {materials?.map((material) => (
              <div key={material.id} className="glass p-4 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/5 text-fire">
                    {material.category === 'banner' && <ImageIcon className="w-5 h-5" />}
                    {material.category === 'video' && <Video className="w-5 h-5" />}
                    {material.category === 'copy' && <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm truncate max-w-[150px]">{material.title}</h4>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">{material.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => {
                      setCurrentMaterial(material);
                      setIsEditing(true);
                    }}
                    className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm("Excluir este material?")) {
                        deleteMaterialMutation.mutate(material.id);
                      }
                    }}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="pt-6">
          <div className="glass p-8 rounded-2xl border border-white/5 bg-white/[0.02] max-w-2xl">
             <h3 className="font-bold text-lg mb-4">Regras Globais de Afiliados</h3>
             <div className="space-y-6">
                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-widest text-white/40">Comissão Padrão (Direta)</label>
                   <div className="flex items-center gap-4">
                      <input type="number" defaultValue={30} className="w-24 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white font-bold" />
                      <span className="text-sm text-white/40">% sobre o valor total da venda.</span>
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-widest text-white/40">Comissão de 2º Nível (Padrinhos)</label>
                   <div className="flex items-center gap-4">
                      <input type="number" defaultValue={5} className="w-24 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white font-bold" />
                      <span className="text-sm text-white/40">% sobre as vendas realizadas por indicados.</span>
                   </div>
                </div>
                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                   <button className="btn-fire px-6 py-2 font-bold text-sm">Salvar Configurações</button>
                   <Link 
                     to="/admin/financeiro" 
                     className="text-[10px] font-bold uppercase text-white/40 hover:text-white transition-colors"
                   >
                     Gerenciar Saques →
                   </Link>
                </div>
             </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}