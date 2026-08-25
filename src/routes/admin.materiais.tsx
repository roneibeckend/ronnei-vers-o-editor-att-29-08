import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";


import { 
  Plus, 
  FileSpreadsheet, 
  Trash2, 
  Edit3, 
  Loader2,
  X,
  Search,
  Download,
  ExternalLink,
  FileText,
  Layout,
  Package
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { upsertMaterial, deleteMaterial, getMaterialDownloadUrl } from "@/lib/materials.functions";


export const Route = createFileRoute("/admin/materiais")({
  head: () => ({ meta: [{ title: "Gestão de Materiais · Admin" }] }),
  component: AdminMaterialsPage,
});

function AdminMaterialsPage() {
  const navigate = useNavigate();
  const { role, isLoading: isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const saveMaterial = useServerFn(upsertMaterial);
  const removeMaterial = useServerFn(deleteMaterial);
  const fetchDownloadUrl = useServerFn(getMaterialDownloadUrl);


  useEffect(() => {
    if (!isLoadingAuth && role === "student") {
      toast.error("Acesso restrito.");
      navigate({ to: "/admin" });
    }
  }, [role, isLoadingAuth, navigate]);


  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["platform-materials-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_materials")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => saveMaterial({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-materials-admin"] });
      toast.success("Material salvo com sucesso!");
      setIsModalOpen(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar material: " + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeMaterial({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-materials-admin"] });
      toast.success("Material excluído!");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir material: " + error.message);
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, materialId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(materialId || "new");
      const fileExt = file.name.split('.').pop();
      // Se estiver editando um item existente, podemos manter o mesmo nome ou usar um padrão que facilite a identificação
      const fileName = materialId 
        ? `${materialId}-${Date.now()}.${fileExt}`
        : `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const bucketName = 'platform-materials';
      
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      if (materialId) {
        // Se estiver atualizando um material específico diretamente no card
        const material = materials.find((m: any) => m.id === materialId);
        if (material) {
          upsertMutation.mutate({ ...material, file_url: publicUrl });
        }
      } else {
        setEditingItem({ ...editingItem, file_url: publicUrl, type: fileExt?.toUpperCase() || "FILE" });
        toast.success("Arquivo enviado com sucesso!");
      }

    } catch (error: any) {
      toast.error("Erro no upload: " + error.message);
    } finally {
      setUploading(null);
    }
  };

  const filteredMaterials = materials.filter((m: any) => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIcon = (type: string) => {
    if (["XLSX", "CSV", "ODS"].includes(type)) return <FileSpreadsheet className="h-5 w-5" />;
    if (type === "PDF") return <FileText className="h-5 w-5" />;
    if (type === "CANVA") return <Layout className="h-5 w-5" />;
    return <Package className="h-5 w-5" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Gestão de Materiais</h2>
          <p className="text-sm text-white/40">Gerencie planilhas, PDFs e recursos da plataforma.</p>
        </div>
        <button 
          onClick={() => { 
            setEditingItem({ title: "", description: "", type: "XLSX", category: "", file_url: null, external_url: "", is_active: true }); 
            setIsModalOpen(true); 
          }}
          className="flex items-center justify-center gap-2 bg-[#ff6a00] px-4 py-2.5 rounded-xl text-sm font-bold text-black transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Novo Material
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
        <input 
          type="text"
          placeholder="Buscar materiais..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition"
        />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
          {filteredMaterials.map((m: any) => (
            <div key={m.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#111] p-5 transition-all hover:border-[#ff6a00]/30">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00] ring-1 ring-[#ff6a00]/20">
                  {getIcon(m.type)}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => { setEditingItem(m); setIsModalOpen(true); }} className="p-2 text-white/40 hover:text-white transition"><Edit3 className="h-4 w-4" /></button>
                  <button onClick={() => { if(confirm("Excluir material?")) deleteMutation.mutate(m.id); }} className="p-2 text-white/40 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white group-hover:text-[#ff6a00] transition">{m.title}</h3>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 px-1.5 py-0.5 rounded border border-white/5">{m.type}</span>
                </div>
                <p className="mt-1 text-xs text-white/40 line-clamp-2">{m.description || "Sem descrição."}</p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {m.file_url ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={async () => {
                        try {
                          const {
                            data: sessionData,
                          } = await supabase.auth.getSession();

                          let accessToken =
                            sessionData.session?.access_token;

                          if (!accessToken) {
                            const {
                              data: refreshed,
                              error: refreshError,
                            } = await supabase.auth.refreshSession();

                            if (
                              refreshError ||
                              !refreshed.session?.access_token
                            ) {
                              throw new Error(
                                "Sessão expirada."
                              );
                            }

                            accessToken =
                              refreshed.session.access_token;
                          }

                          const { url } =
                            await fetchDownloadUrl({
                              data: {
                                materialId: m.id,
                                accessToken,
                              },
                            });

                          window.location.assign(url);
                        } catch (err: any) {
                          console.error(
                            "[admin/materiais] download:",
                            err
                          );

                          toast.error(
                            err?.message ||
                            "Erro ao baixar arquivo."
                          );
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition"
                    >
                      <Download className="h-3 w-3" /> Download
                    </button>

                    <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10 transition cursor-pointer font-bold text-[10px] uppercase tracking-widest ${uploading === m.id || upsertMutation.isPending ? 'opacity-50 cursor-wait' : 'bg-white/5 hover:bg-white/10'}`}>
                      {uploading === m.id || (upsertMutation.isPending && upsertMutation.variables?.id === m.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}

                      Atualizar
                      <input type="file" disabled={!!uploading} className="hidden" onChange={(e) => handleFileUpload(e, m.id)} />
                    </label>
                  </div>
                ) : m.external_url ? (
                  <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition text-[#ff6a00]">
                    <ExternalLink className="h-3 w-3" /> Acessar Link
                  </a>
                ) : (
                  <div className="flex gap-2">
                    <span className="flex-1 text-center py-2 text-[10px] font-bold uppercase tracking-widest text-white/10">Sem Arquivo</span>
                    <label className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10 transition cursor-pointer font-bold text-[10px] uppercase tracking-widest ${uploading === m.id || upsertMutation.isPending ? 'opacity-50 cursor-wait' : 'bg-[#ff6a00]/10 text-[#ff6a00] hover:bg-[#ff6a00]/20'}`}>
                      {uploading === m.id || (upsertMutation.isPending && upsertMutation.variables?.id === m.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}

                      Upload
                      <input type="file" disabled={!!uploading} className="hidden" onChange={(e) => handleFileUpload(e, m.id)} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredMaterials.length === 0 && (
            <div className="col-span-full py-20 text-center border border-dashed border-white/5 rounded-2xl">
              <Package className="h-10 w-10 mx-auto text-white/5 mb-3" />
              <p className="text-white/20 text-sm">Nenhum material encontrado.</p>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto py-6 sm:py-4">
          <div className="w-full max-w-xl bg-[#0e0e0e] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <h3 className="text-xl font-bold text-white">{editingItem?.id ? "Editar Material" : "Novo Material"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              const payload = {
                ...editingItem,
                external_url: editingItem.external_url || null,
                file_url: editingItem.file_url || null,
                category: editingItem.category || null
              };
              upsertMutation.mutate(payload); 
            }} className="space-y-5 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do Material</label>
                <input required value={editingItem?.title || ""} onChange={e => setEditingItem({...editingItem, title: e.target.value})} placeholder="Ex: Planilha de Custos v2.0" className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition text-white" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Descrição</label>
                <textarea rows={2} value={editingItem?.description || ""} onChange={e => setEditingItem({...editingItem, description: e.target.value})} placeholder="Breve descrição do que o aluno encontrará neste material..." className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition text-white resize-none" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tipo de Recurso</label>
                  <select value={editingItem?.type || "XLSX"} onChange={e => setEditingItem({...editingItem, type: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 p-3 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition text-white">
                    <option value="XLSX">Excel (.xlsx)</option>
                    <option value="CSV">CSV (.csv)</option>
                    <option value="ODS">Calc (.ods)</option>
                    <option value="PDF">Documento (.pdf)</option>
                    <option value="CANVA">Link Canva</option>
                    <option value="ZIP">Arquivo Compactado (.zip)</option>
                    <option value="DOCX">Word (.docx)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Categoria</label>
                  <input value={editingItem?.category || ""} onChange={e => setEditingItem({...editingItem, category: e.target.value})} placeholder="Ex: Financeiro" className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition text-white" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 block">Arquivo ou Link</label>
                
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input 
                      value={editingItem?.file_url || ""} 
                      readOnly
                      placeholder="Upload de arquivo..."
                      className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl text-xs outline-none text-white/40 cursor-not-allowed" 
                    />
                    <label className={`flex items-center justify-center gap-2 px-4 rounded-xl border border-white/10 transition cursor-pointer font-bold text-xs uppercase tracking-widest ${uploading === "new" ? 'opacity-50 cursor-wait' : 'bg-white/5 hover:bg-white/10'}`}>
                      {uploading === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {editingItem?.file_url ? "Substituir" : "Upload"}
                      <input type="file" disabled={!!uploading} className="hidden" onChange={(e) => handleFileUpload(e)} />
                    </label>
                  </div>
                  
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <ExternalLink className="h-3 w-3 text-white/20" />
                    </div>
                    <input 
                      value={editingItem?.external_url || ""} 
                      onChange={e => setEditingItem({...editingItem, external_url: e.target.value})} 
                      placeholder="Ou cole um link externo (Canva, Drive, etc)" 
                      className="w-full bg-white/5 border border-white/10 pl-10 pr-3 py-3 rounded-xl text-xs outline-none focus:border-[#ff6a00] transition text-white" 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-[10px] text-white/60">Cancelar</button>
                <button type="submit" disabled={upsertMutation.isPending || !!uploading} className="flex-1 py-3.5 rounded-xl bg-[#ff6a00] text-black font-bold disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition uppercase tracking-widest text-[10px]">
                  {upsertMutation.isPending ? "Salvando..." : "Salvar Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
