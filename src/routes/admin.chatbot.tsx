import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { 
  BrainCircuit, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  Save,
  Tag
} from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/chatbot")({
  component: AdminChatbotPage,
});

function AdminChatbotPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<any>(null);

  // 1. Fetch Knowledge Base
  const { data: knowledge = [], isLoading: isLoadingKnowledge } = useQuery({
    queryKey: ["admin-knowledge"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("knowledge_base")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch Unhandled Questions
  const { data: unhandled = [], isLoading: isLoadingUnhandled } = useQuery({
    queryKey: ["admin-unhandled"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unhandled_questions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 3. Save Knowledge
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const payload = {
      title: formData.get("title"),
      content: formData.get("content"),
      category: formData.get("category"),
      status: formData.get("status"),
      questions: (formData.get("questions") as string).split("\n").filter(q => q.trim()),
      keywords: (formData.get("keywords") as string).split(",").map(k => k.trim()).filter(k => k),
    };

    try {
      if (editingKnowledge?.id) {
        const { error } = await (supabase as any)
          .from("knowledge_base")
          .update(payload)
          .eq("id", editingKnowledge.id);
        if (error) throw error;
        toast.success("Conhecimento atualizado!");
      } else {
        const { error } = await (supabase as any)
          .from("knowledge_base")
          .insert(payload);
        if (error) throw error;
        toast.success("Novo conhecimento adicionado!");
      }
      setIsEditing(false);
      setEditingKnowledge(null);
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este conhecimento?")) return;
    try {
      const { error } = await (supabase as any).from("knowledge_base").delete().eq("id", id);
      if (error) throw error;
      toast.success("Conhecimento removido!");
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const resolveQuestion = async (id: string, ignore = false) => {
    try {
      const { error } = await (supabase as any)
        .from("unhandled_questions")
        .update({ status: ignore ? 'ignored' : 'resolved' })
        .eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-unhandled"] });
      toast.success(ignore ? "Pergunta ignorada" : "Pergunta marcada como resolvida");
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const filteredKnowledge = knowledge.filter((k: any) => 
    k.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
        <PageHeader 
          title="Inteligência Brasa" 
          subtitle="Gerencie a base de conhecimento e melhore o atendimento automatizado."
        />
        <button 
          onClick={() => {
            setEditingKnowledge({});
            setIsEditing(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-[#ff6a00] px-6 py-3 text-sm font-bold text-black shadow-lg shadow-[#ff6a00]/20 hover:scale-[1.02] active:scale-[0.98] transition-all w-full sm:w-auto justify-center"
        >
          <Plus className="h-4 w-4" /> Novo Conhecimento
        </button>
      </div>

      <Tabs defaultValue="knowledge" className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl h-auto flex-wrap">
          <TabsTrigger value="knowledge" className="data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black rounded-lg px-6 py-2.5 text-xs font-bold uppercase tracking-widest">
            Base de Conhecimento ({knowledge.length})
          </TabsTrigger>
          <TabsTrigger value="unhandled" className="data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black rounded-lg px-6 py-2.5 text-xs font-bold uppercase tracking-widest relative">
            Dúvidas sem Resposta
            {unhandled.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-fire text-[10px] text-white animate-pulse">
                {unhandled.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="space-y-6">
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
            <Search className="h-5 w-5 text-white/20" />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar na base de conhecimento..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20"
            />
          </div>

          <div className="grid gap-4">
            {isLoadingKnowledge ? (
              [1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
            ) : filteredKnowledge.length > 0 ? (
              filteredKnowledge.map((k: any) => (
                <div key={k.id} className="glass group rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:border-[#ff6a00]/30 transition-all">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-[#ff6a00]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#ff6a00]">
                          {k.category}
                        </span>
                        {k.status === 'inactive' && (
                          <span className="rounded-lg bg-fire/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-fire">
                            Inativo
                          </span>
                        )}
                        <h4 className="font-display text-lg font-bold text-white">{k.title}</h4>
                      </div>
                      <p className="text-sm text-white/50 line-clamp-2 leading-relaxed">{k.content}</p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {k.keywords?.map((kw: string) => (
                          <span key={kw} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[9px] font-medium text-white/30 uppercase tracking-widest">
                            <Tag className="h-2.5 w-2.5" /> {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-start">
                      <button 
                        onClick={() => {
                          setEditingKnowledge(k);
                          setIsEditing(true);
                        }}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/40 hover:bg-white/10 hover:text-[#ff6a00] transition-all"
                        title="Editar"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(k.id)}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/40 hover:bg-fire/10 hover:text-fire transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="glass flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-white/5">
                <BrainCircuit className="h-12 w-12 text-white/10 mb-4" />
                <h5 className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhum conhecimento encontrado</h5>
                <p className="mt-2 text-xs text-white/20">Ajuste seu termo de busca ou adicione um novo.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="unhandled" className="space-y-6">
          <div className="grid gap-4">
            {isLoadingUnhandled ? (
              [1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
            ) : unhandled.length > 0 ? (
              unhandled.map((u: any) => (
                <div key={u.id} className="glass rounded-2xl border border-fire/20 bg-fire/5 p-6 transition-all hover:bg-fire/[0.08]">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-fire/10 text-fire">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white leading-relaxed">"{u.question}"</h4>
                          <span className="text-[10px] font-medium text-white/30 uppercase tracking-widest">
                            {new Date(u.created_at).toLocaleString()} • Confiança: {(u.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      {u.context?.path && (
                        <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-2">
                          Página de origem: <span className="text-fire/60">{u.context.path}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 self-end md:self-start">
                      <button 
                        onClick={() => {
                          setEditingKnowledge({
                            title: `Resposta para: ${u.question.slice(0, 30)}...`,
                            content: "",
                            questions: [u.question],
                            keywords: [],
                            category: "PROBLEMAS"
                          });
                          setIsEditing(true);
                          // Marcar como resolvida após salvar ou manual
                        }}
                        className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                      >
                        <Plus className="h-3 w-3" /> Criar Resposta
                      </button>
                      <button 
                        onClick={() => resolveQuestion(u.id, true)}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/40 hover:bg-white/10 transition-all"
                        title="Ignorar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="glass flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-white/5">
                <CheckCircle2 className="h-12 w-12 text-emerald-500/20 mb-4" />
                <h5 className="text-sm font-bold text-white/40 uppercase tracking-widest">Tudo em ordem!</h5>
                <p className="mt-2 text-xs text-white/20">Não há dúvidas pendentes de revisão.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Editing Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto py-6 sm:py-4">
          <div className="w-full max-w-2xl animate-in zoom-in-95 duration-300">
            <div className="glass rounded-3xl border border-white/10 bg-[#0f0f0f] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/5 px-8 py-6">
                <h3 className="font-display text-xl font-bold text-white">
                  {editingKnowledge?.id ? "Editar Conhecimento" : "Novo Conhecimento"}
                </h3>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-white/40 hover:text-white transition-all"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do Conhecimento</label>
                    <input 
                      name="title"
                      defaultValue={editingKnowledge?.title}
                      required
                      placeholder="Ex: Como baixar e-books"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00] transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Categoria</label>
                    <select 
                      name="category"
                      defaultValue={editingKnowledge?.category || 'SUPORTE'}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm outline-none focus:border-[#ff6a00] transition-all"
                    >
                      <option value="CONTA">Conta & Acesso</option>
                      <option value="CURSOS">Cursos & Aulas</option>
                      <option value="EBOOKS">E-books & Downloads</option>
                      <option value="MATERIAIS">Materiais & PDFs</option>
                      <option value="PWA">Aplicativo (PWA)</option>
                      <option value="SUPORTE">Suporte Técnico</option>
                      <option value="PROBLEMAS">Erros & Problemas</option>
                      <option value="COMPRAS">Compras & Pagamentos</option>
                      <option value="CERTIFICADOS">Certificados</option>
                      <option value="AFILIADOS">Afiliados</option>
                      <option value="FINANCEIRO">Financeiro</option>
                      <option value="SEGURANCA">Segurança</option>
                      <option value="PLATAFORMA">Plataforma</option>
                      <option value="DO ZERO AOS 10K">Do Zero aos 10K</option>
                      <option value="CARNES">Carnes</option>
                      <option value="PRODUCAO">Produção</option>
                      <option value="PRECO E LUCRO">Preço & Lucro</option>
                      <option value="TEMPEROS">Temperos</option>
                      <option value="DELIVERY">Delivery</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Conteúdo da Resposta (Brasa dirá isso)</label>
                  <textarea 
                    name="content"
                    defaultValue={editingKnowledge?.content}
                    required
                    rows={6}
                    placeholder="Descreva o procedimento em passos simples..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00] resize-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Variações de Perguntas (uma por linha)</label>
                  <textarea 
                    name="questions"
                    defaultValue={editingKnowledge?.questions?.join("\n")}
                    rows={4}
                    placeholder="como baixo o livro?
onde clico para download?
cadê o ebook?"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00] resize-none transition-all"
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Palavras-chave (separadas por vírgula)</label>
                    <input 
                      name="keywords"
                      defaultValue={editingKnowledge?.keywords?.join(", ")}
                      placeholder="download, pdf, ebook, baixar"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00] transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status</label>
                    <select 
                      name="status"
                      defaultValue={editingKnowledge?.status || 'active'}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm outline-none focus:border-[#ff6a00] transition-all"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-widest text-white/40 hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-[#ff6a00] px-10 py-3 text-xs font-bold uppercase tracking-widest text-black shadow-lg shadow-[#ff6a00]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <Save className="h-4 w-4" /> Salvar Conhecimento
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
