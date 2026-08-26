import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { notifyNewContent } from "@/lib/content-notify.functions";
import { useState, useEffect } from "react";
import { 
  Plus, 
  BookOpen, 
  Trash2, 
  Edit3, 
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Eye,
  Archive,
  Copy,
  Info,
  Layout,
  Users,
  Settings,
  ChevronDown,
  GripVertical,
  Save,
  SendHorizontal,
  Play,
  FileUp,
  ShieldCheck,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Flag,
  Award,
  Send,
} from "lucide-react";
import { CertificateEditor } from "@/components/admin/CertificateEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { VideoUpload } from "@/components/admin/VideoUpload";
import { VideoPlayer } from "@/components/platform/VideoPlayer";

import { VisualChapterEditor } from "@/components/admin/VisualChapterEditor";
import { WorkloadHoursField } from "@/components/admin/WorkloadHoursField";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { importEbookFromFile } from "@/lib/ebook-import.functions";
import { fixEbookVisibility } from "@/lib/ebook-visibility-fix.functions";
import { reorderChapter } from "@/lib/ebook-reorder.functions";
import { getSEOSuggestions } from "@/lib/seo-ebook.functions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

export const Route = createFileRoute("/admin/ebooks")({
  head: () => ({ meta: [{ title: "Gestão de E-books · Admin" }] }),
  component: AdminEbooksPage,
});


function AdminEbookCover({ ebook }: { ebook: any }) {
  const local10k =
    String(ebook?.title || "").toLowerCase().includes("10k")
      ? '/media/ebook-zero-10k.jpg'
      : "";

  const candidates = [
    ebook?.cover_url,
    ebook?.cover,
    local10k,
  ].filter(
    (value, index, all): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      !value.includes("/__l5e/") &&
      all.indexOf(value) === index
  );

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [ebook?.cover_url, ebook?.cover, ebook?.title]);

  if (candidateIndex >= candidates.length) {
    return (
      <div className="h-12 w-8 rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0">
        <BookOpen className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      src={candidates[candidateIndex]}
      alt={ebook.title}
      className="h-12 w-8 object-cover rounded bg-white/5 shrink-0"
      loading="lazy"
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}

function AdminEbooksPage() {
  const [ebooks, setEbooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("info");
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const ITEMS_PER_PAGE = 8;

  useEffect(() => {
    fetchData();
  }, [currentPage, statusFilter]);

  async function fetchData() {
    try {
      setLoading(true);
      let query = supabase
        .from('ebooks')
        .select('*, modules:ebook_modules(id, chapters:ebook_chapters(id))', { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('title', `%${searchTerm}%`);
      }

      if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
        
      if (error) throw error;
      setEbooks(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error("Erro ao carregar e-books: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSaving(true);
      // Prepare data for upsert, ensuring no virtual 'modules' column is sent
      // Convert keywords string back to array if needed to avoid "malformed array literal"
      const { modules, ...payload } = editingItem;
      
      // Handle keywords serialization: string (from input) to text[] (for Postgres)
      if (typeof payload.keywords === 'string') {
        payload.keywords = payload.keywords
          .split(',')
          .map((k: string) => k.trim())
          .filter((k: string) => k !== '');
      } else if (!payload.keywords) {
        payload.keywords = [];
      }
      
      const { data, error } = await supabase
        .from('ebooks')
        .upsert({
          ...payload,
          id: editingItem.id || undefined,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success("E-book salvo com sucesso!");
      setIsModalOpen(false);
      setEditingItem(null);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const notifyContent = useServerFn(notifyNewContent);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  async function handleNotify(ebook: any, force = false) {
    setNotifyingId(ebook.id);
    try {
      const res: any = await notifyContent({ data: { contentType: "ebook", contentId: ebook.id, force } });
      if (res?.alreadySent) {
        if (confirm("Este eBook já foi anunciado por e-mail. Deseja enviar novamente para todos os alunos?")) {
          setNotifyingId(null);
          return handleNotify(ebook, true);
        }
      } else if (res?.success) {
        toast.success(`E-mail enviado para ${res.sentCount} de ${res.recipients} alunos.`);
      } else {
        toast.error("Nenhum e-mail enviado. " + (res?.error || "Verifique as configurações de e-mail."));
      }
    } catch (e: any) {
      toast.error("Erro ao avisar alunos: " + (e?.message || e));
    } finally {
      setNotifyingId(null);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('ebooks')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      toast.success(newStatus === 'active' ? 'E-book ativado e visível para alunos.' : 'E-book desativado.');
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    }
  }

  async function handleDelete(ebook: any) {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o e-book "${ebook.title}"? Todos os módulos, capítulos e progressos de alunos vinculados serão removidos.`)) return;
    try {
      const { error } = await supabase.from('ebooks').delete().eq('id', ebook.id);
      if (error) throw error;
      toast.success("E-book e conteúdos relacionados excluídos permanentemente");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Gestão de E-books</h2>
          <p className="text-sm text-white/40 text-left">Gerencie sua biblioteca de livros digitais.</p>
        </div>
        <button 
          onClick={() => { 
            setEditingItem({ 
              title: "", 
              subtitle: "",
              description: "",
              price: 0,
              is_locked: false,
              category: "",
              cover_url: "",
              payment_type: "unique",
              status: "draft"
            }); 
            setIsModalOpen(true); 
          }}
          className="flex items-center justify-center gap-2 bg-[#ff6a00] px-4 py-2.5 rounded-lg text-sm font-bold text-black hover:bg-[#ff8c33] transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar Novo E-book
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-[#111] p-4 rounded-xl border border-white/5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input 
            type="text"
            placeholder="Buscar por título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                fetchData();
              }
            }}
            className="w-full bg-white/5 border border-white/10 pl-10 pr-4 py-2 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors text-[16px] md:text-sm"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-sm outline-none focus:border-[#ff6a00] appearance-none cursor-pointer"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="draft">Inativos</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : ebooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
          <BookOpen className="h-12 w-12 text-white/10 mb-4" />
          <p className="text-white/40 text-sm">Nenhum e-book encontrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#111]">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-6 py-4">Capa / Título</th>
                <th className="px-6 py-4">Conteúdo</th>
                <th className="px-6 py-4">Preço</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ebooks.map((ebook) => (
                <tr key={ebook.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <AdminEbookCover ebook={ebook} />
                      <div>
                        <div className="font-bold">{ebook.title}</div>
                        <div className="text-[10px] text-white/20 uppercase tracking-tighter">
                          ID: {ebook.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium">{ebook.modules?.length || 0} Módulos</span>
                      <span className="text-[10px] text-white/40">
                        {ebook.modules?.reduce((acc: number, m: any) => acc + (m.chapters?.length || 0), 0) || 0} Capítulos
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gold font-bold">R$ {ebook.price?.toString().replace(".", ",")}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      ebook.status === 'active' ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                    )}>
                      {ebook.status === 'active' ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleStatusChange(ebook.id, ebook.status === 'active' ? 'draft' : 'active')}
                        title={ebook.status === 'active' ? 'Desativar' : 'Ativar'}
                        className="p-2 text-white/40 hover:text-white transition-colors"
                      >
                        {ebook.status === 'active' ? <Eye className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            await fixEbookVisibility({ data: { ebook_id: ebook.id } });
                            toast.success("Visibilidade corrigida!");
                            fetchData();
                          } catch (err: any) {
                            toast.error("Erro ao corrigir: " + err.message);
                          }
                        }}
                        className="p-2 text-white/40 hover:text-gold transition-colors"
                        title="Corrigir Visibilidade"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => { setEditingItem(ebook); setActiveTab("info"); setIsModalOpen(true); }}
                        className="p-2 text-white/40 hover:text-white transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleNotify(ebook)}
                        disabled={notifyingId === ebook.id}
                        title="Avisar alunos por e-mail sobre este eBook"
                        className="p-2 text-white/40 hover:text-[#ff6a00] transition-colors disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(ebook)}
                        className="p-2 text-white/40 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 text-left outline-none" tabIndex={-1}>
          <div className="w-full max-w-[95vw] lg:max-w-7xl bg-[#0e0e0e] border border-white/10 rounded-2xl p-4 sm:p-6 h-[calc(100dvh-1rem)] sm:h-[min(92dvh,calc(100dvh-2rem))] flex flex-col relative z-50 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4 sm:mb-6 z-30 bg-[#0e0e0e] pb-4 border-b border-white/5 pt-2 shrink-0">
              <h3 className="truncate text-base sm:text-xl font-bold pr-2">{editingItem?.id ? `Editando: ${editingItem.title}` : "Novo E-book"}</h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }} 
                className="p-2 hover:bg-white/5 rounded-full transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Tabs value={activeTab} onValueChange={(val) => {
              setActiveTab(val);
            }} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mb-4 sm:mb-6 z-20 shrink-0 w-full max-w-full justify-start gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg border border-white/10 bg-white/5 p-1 backdrop-blur-md sm:w-auto sm:self-start">

                <TabsTrigger value="info" className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Info className="h-4 w-4" /> Informações
                </TabsTrigger>
                <TabsTrigger value="checkpoints" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Flag className="h-4 w-4" /> Checkpoints
                </TabsTrigger>
                <TabsTrigger value="content" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Layout className="h-4 w-4" /> Capítulos
                </TabsTrigger>
                <TabsTrigger value="certificates" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Award className="h-4 w-4" /> Certificados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-0 outline-none">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do E-book</label>
                          {editingItem?.title && (
                            <SEOTooltip 
                              type="title" 
                              content={editingItem.title} 
                              keywords={editingItem.keywords} 
                            />
                          )}
                        </div>
                        <input 
                          required 
                          value={editingItem?.title || ""} 
                          onChange={e => setEditingItem({...editingItem, title: e.target.value})} 
                          className={cn(
                            "w-full bg-white/5 border p-3 rounded-lg text-sm outline-none transition-colors",
                            editingItem?.title?.length >= 40 && editingItem?.title?.length <= 60 ? "border-green-500/30 focus:border-green-500" : 
                            editingItem?.title?.length > 0 ? "border-yellow-500/30 focus:border-yellow-500" : "border-white/10 focus:border-[#ff6a00]"
                          )}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Subtítulo</label>
                        <input 
                          value={editingItem?.subtitle || ""} 
                          onChange={e => setEditingItem({...editingItem, subtitle: e.target.value})} 
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Descrição SEO (Meta Description)</label>
                          {editingItem?.description && (
                            <SEOTooltip 
                              type="description" 
                              content={editingItem.description} 
                              keywords={editingItem.keywords} 
                            />
                          )}
                        </div>
                        <textarea 
                          value={editingItem?.description || ""} 
                          onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                          rows={4}
                          placeholder="Breve resumo para motores de busca (120-160 caracteres)."
                          className={cn(
                            "w-full bg-white/5 border p-3 rounded-lg text-sm outline-none transition-colors resize-none",
                            editingItem?.description?.length >= 120 && editingItem?.description?.length <= 160 ? "border-green-500/30 focus:border-green-500" : 
                            editingItem?.description?.length > 0 ? "border-yellow-500/30 focus:border-yellow-500" : "border-white/10 focus:border-[#ff6a00]"
                          )}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Palavras-chave (separadas por vírgula)</label>
                          {editingItem?.keywords && (
                            <SEOTooltip 
                              type="keywords" 
                              content={editingItem.keywords} 
                            />
                          )}
                        </div>
                        <input 
                          value={Array.isArray(editingItem?.keywords) ? editingItem.keywords.join(', ') : (editingItem?.keywords || "")} 
                          onChange={e => setEditingItem({...editingItem, keywords: e.target.value})} 
                          placeholder="ex: churrasco, espetinho, receitas, gourmet"
                          className={cn(
                            "w-full bg-white/5 border p-3 rounded-lg text-sm outline-none transition-colors",
                            (Array.isArray(editingItem?.keywords) ? editingItem.keywords.join(', ') : (editingItem?.keywords || "")).split(',').filter((k: string) => k.trim()).length >= 5 ? "border-green-500/30 focus:border-green-500" : 
                            (editingItem?.keywords?.length > 0) ? "border-yellow-500/30 focus:border-yellow-500" : "border-white/10 focus:border-[#ff6a00]"
                          )}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">URL do Vídeo de Abertura (YouTube/Vimeo/Drive)</label>
                        <p className="text-[10px] text-white/20 mb-1">Para Google Drive, use a opção "Qualquer pessoa com o link pode ver".</p>
                        <input 
                          value={editingItem?.opening_video_url || ""} 
                          onChange={e => setEditingItem({...editingItem, opening_video_url: e.target.value})} 
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <ImageUpload 
                        value={editingItem?.cover_url || editingItem?.cover || ""} 
                        onChange={url => setEditingItem({...editingItem, cover_url: url})}
                        bucket="content-covers"
                        label="Imagem de Capa"
                        description="Proporção 3:4 recomendada para e-books."
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Preço (R$)</label>
                          <input 
                            type="number"
                            step="0.01"
                            value={editingItem?.price || 0} 
                            onChange={e => setEditingItem({...editingItem, price: parseFloat(e.target.value)})} 
                            className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Categoria</label>
                          <input 
                            value={editingItem?.category || ""} 
                            onChange={e => setEditingItem({...editingItem, category: e.target.value})} 
                            className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tipo de Pagamento</label>
                          <select 
                            value={editingItem?.payment_type || "unique"} 
                            onChange={e => setEditingItem({...editingItem, payment_type: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] appearance-none cursor-pointer"
                          >
                            <option value="unique">Pagamento Único</option>
                            <option value="recurring">Pagamento Recorrente</option>
                          </select>
                        </div>
                        
                        {editingItem?.payment_type === 'recurring' && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Dias úteis p/ vencimento</label>
                            <input 
                              type="number"
                              required
                              min="1"
                              step="1"
                              value={editingItem?.due_days || 3} 
                              onChange={e => setEditingItem({...editingItem, due_days: parseInt(e.target.value) || 1})} 
                              className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <VideoUpload 
                          value={editingItem?.opening_video_url || ""} 
                          onChange={url => setEditingItem({...editingItem, opening_video_url: url})}
                          bucket="course-assets"
                          label="Vídeo de Abertura"
                          description="Este vídeo será exibido antes do início do conteúdo para o aluno. Formatos: MP4 (H.264/AAC)."
                        />
                      </div>
                    </div>
                  </div>

                  <WorkloadHoursField
                    contentId={editingItem?.id}
                    contentType="ebook"
                    hours={editingItem?.workload_hours ?? null}
                    extras={editingItem?.workload_extras ?? null}
                    onChange={(patch) => setEditingItem({ ...editingItem, ...patch })}
                  />

                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 mt-6">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold">Status do Conteúdo</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">Conteúdos ativos aparecem para compra e acesso dos alunos</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, status: 'draft'})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.status === 'draft' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Inativo
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, status: 'active'})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.status === 'active' ? "bg-green-500/20 text-green-500 border border-green-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Ativo
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end pt-6 border-t border-white/5">
                    <button 
                      type="submit" 
                      disabled={isSaving}
                      className="bg-[#ff6a00] px-8 py-3 rounded-lg text-sm font-bold text-black hover:bg-[#ff8c33] disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar E-book
                    </button>
                  </div>
                </form>
              </TabsContent>

                <TabsContent value="checkpoints" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-0">
                  {editingItem?.id && (
                    <div className="space-y-6">
                      <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                        <h4 className="font-bold flex items-center gap-2 mb-4">
                          <Flag className="h-5 w-5 text-[#ff6a00]" /> Configurar Checkpoints do E-book
                        </h4>
                        <p className="text-sm text-white/60 mb-6">
                          Defina marcos específicos onde o progresso de leitura deve ser registrado.
                          As notificações de progresso (25%, 50%, 75%, 100%) são automáticas.
                        </p>
                        
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                            <span className="text-sm">Final de cada módulo</span>
                            <button 
                              type="button"
                              className="text-[10px] font-bold uppercase text-[#ff6a00] hover:underline"
                              onClick={() => {
                                const current = editingItem.checkpoints || [];
                                setEditingItem({...editingItem, checkpoints: [...current, { type: 'module_end', label: 'Conclusão de Módulo' }]});
                              }}
                            >
                              Habilitar
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Checkpoints Ativos</label>
                            {(editingItem.checkpoints || []).map((cp: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                                <span className="text-sm font-medium">{cp.label}</span>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const filtered = editingItem.checkpoints.filter((_: any, i: number) => i !== idx);
                                    setEditingItem({...editingItem, checkpoints: filtered});
                                  }}
                                  className="text-red-500 hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="content" className="flex-1 min-h-0 overflow-hidden mt-0 outline-none data-[state=active]:flex data-[state=active]:flex-col">
                  {editingItem?.id && <EbookContentEditor ebookId={editingItem.id} />}
                </TabsContent>

                <TabsContent value="certificates" className="flex-1 min-h-0 overflow-y-auto pr-1 mt-0">
                  {editingItem?.id && (
                    <CertificateEditor 
                      contentId={editingItem.id} 
                      contentType="ebook" 
                    />
                  )}
                </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}

function EbookContentEditor({ ebookId }: { ebookId: string }) {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChapter, setEditingChapter] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');

  useEffect(() => {
    fetchContent();
  }, [ebookId]);

  async function fetchContent() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ebook_modules')
        .select('*, chapters:ebook_chapters(*)')
        .eq('ebook_id', ebookId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setModules(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar conteúdo: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddModule() {
    try {
      const title = prompt("Título do novo módulo:");
      if (!title) return;

      const { error } = await supabase
        .from('ebook_modules')
        .insert({
          ebook_id: ebookId,
          title,
          order_index: modules.length
        });

      if (error) throw error;
      fetchContent();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleAddChapter(moduleId: string) {
    try {
      const title = prompt("Título do novo capítulo:");
      if (!title) return;

      const module = modules.find(m => m.id === moduleId);
      const orderIndex = module.chapters?.length || 0;

      const { error } = await supabase
        .from('ebook_chapters')
        .insert({
          ebook_id: ebookId,
          module_id: moduleId,
          title,
          order_index: orderIndex,
          content: "<p>Comece a escrever aqui...</p>"
        });

      if (error) throw error;
      fetchContent();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleSaveChapter() {
    if (!editingChapter) return;
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('ebook_chapters')
        .update({
          title: editingChapter.title,
          content: editingChapter.content,
          video_url: editingChapter.video_url,
          reading_minutes: editingChapter.reading_minutes,
          order_index: editingChapter.order_index
        })
        .eq('id', editingChapter.id);

      if (error) throw error;
      toast.success("Capítulo salvo!");
      setEditingChapter(null);
      fetchContent();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteChapter(chapterId: string) {
    if (!confirm("Tem certeza que deseja excluir este capítulo?")) return;
    try {
      const { error } = await supabase
        .from('ebook_chapters')
        .delete()
        .eq('id', chapterId);
      if (error) throw error;
      fetchContent();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm("Isso excluirá o módulo e todos os seus capítulos. Continuar?")) return;
    try {
      const { error } = await supabase
        .from('ebook_modules')
        .delete()
        .eq('id', moduleId);
      if (error) throw error;
      fetchContent();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const result = await importEbookFromFile({
            data: {
              ebook_id: ebookId,
              file_base64: base64,
              file_name: file.name,
              mime_type: file.type
            }
          });
          toast.success(`Arquivo importado com sucesso! ${result.chapters_count} capítulos criados em ${(result.duration_ms / 1000).toFixed(1)}s.`);
          fetchContent();
        } catch (err: any) {
          console.error("File Import Failure:", err);
          const errorMessage = err.message || "Erro desconhecido";
          
          if (errorMessage.includes("LIMITE_EXCEDIDO")) {
             toast.error("O arquivo é muito grande para ser processado automaticamente (limite de 60MB). Por favor, divida o arquivo em partes menores.", {
               duration: 8000
             });
          } else if (errorMessage.includes("TIMEOUT_PDF_INFRA") || errorMessage.includes("demorou muito")) {
             toast.error("Processamento Interrompido: O arquivo é muito complexo (contém muitas imagens ou tabelas). Tente remover elementos pesados ou dividir o arquivo.", {
               duration: 8000
             });
          } else if (errorMessage.includes("DOCX_INFRA_ERROR")) {
             toast.error("Erro no Processamento do Word: O documento é muito complexo para o conversor. Tente salvar como PDF ou simplificar a formatação.", {
               duration: 8000
             });
          } else if (errorMessage.includes("página de erro técnica") || 
              errorMessage.includes("instabilidade na infraestrutura") || 
              errorMessage.includes("This page didn't load") ||
              errorMessage.includes("INFRA_ERROR_HTML")) {
             toast.error("Instabilidade no Processamento: O servidor encontrou uma dificuldade com a densidade deste arquivo. Se o arquivo for pequeno (menos de 30 páginas), tente simplificar o conteúdo (remover imagens pesadas) ou converter o formato. Se for grande, divida-o em partes menores.", {
               duration: 10000
             });
          } else {
             toast.error("Não foi possível importar o arquivo: " + errorMessage);
          }
        }


      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error("Erro na leitura do arquivo: " + error.message);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" /></div>;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(12rem,35%)_minmax(0,1fr)] gap-4 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      {/* Sidebar - Tree View */}
      <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden border-b border-white/5 pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-4 lg:pr-6">

        <div className="flex items-center justify-between gap-2 shrink-0">
          <h4 className="font-bold uppercase text-[10px] tracking-widest text-white/40">Estrutura</h4>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white/5 text-white/60 hover:bg-white/10 transition-all flex items-center gap-1">
              {isImporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />}
              Importar
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.html"
                className="hidden"
                disabled={isImporting}
                onChange={handleImportFile}
              />
            </label>
            <button
              onClick={handleAddModule}
              className="px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-[#ff6a00] text-black hover:bg-[#ff8c33] transition-all flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Módulo
            </button>
          </div>
        </div>


        <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">

          {modules.length === 0 && (
            <button
              onClick={handleAddModule}
              className="w-full rounded-xl border border-dashed border-white/10 p-4 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:border-[#ff6a00] hover:text-[#ff6a00] transition-all"
            >
              Nenhum módulo ainda — criar o primeiro
            </button>
          )}

          {modules.map((module) => (
            <div key={module.id} className="space-y-1">
              <div className="flex items-center justify-between group px-2 py-1.5 rounded-lg bg-white/5 border border-white/5">
                <span className="text-xs font-bold truncate">{module.title}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleAddChapter(module.id)} className="p-1 text-white/40 hover:text-white"><Plus className="h-3 w-3" /></button>
                  <button onClick={() => handleDeleteModule(module.id)} className="p-1 text-white/40 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="pl-4 space-y-1">
                <ModuleChapters 
                  module={module} 
                  editingChapterId={editingChapter?.id} 
                  onEdit={(chapter) => setEditingChapter(chapter)} 
                  onReorder={async (chapterId, newIndex) => {
                    try {
                      await reorderChapter({ data: { chapterId, newOrderIndex: newIndex, moduleId: module.id } });
                      fetchContent();
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="custom-scrollbar flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-6">
        {editingChapter ? (
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <h4 className="font-bold uppercase text-xs tracking-widest text-[#ff6a00]">Editando Capítulo</h4>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDeleteChapter(editingChapter.id)}
                  className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                >
                  Excluir
                </button>
                <button 
                  onClick={handleSaveChapter}
                  disabled={isSaving}
                  className="px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-[#ff6a00] text-black hover:bg-[#ff8c33] transition-all flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 flex-1 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="space-y-3 md:col-span-1">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do Capítulo</label>
                    <input 
                      value={editingChapter.title}
                      onChange={e => setEditingChapter({...editingChapter, title: e.target.value})}
                      className="w-full bg-black/40 border border-white/10 p-2.5 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Ordem</label>
                      <input 
                        type="number"
                        value={editingChapter.order_index}
                        onChange={e => setEditingChapter({...editingChapter, order_index: parseInt(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 p-2.5 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Min. Leitura</label>
                      <input 
                        type="number"
                        value={editingChapter.reading_minutes || 0}
                        onChange={e => setEditingChapter({...editingChapter, reading_minutes: parseInt(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 p-2.5 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <VideoUpload 
                        value={editingChapter.video_url || ""}
                        onChange={url => setEditingChapter({...editingChapter, video_url: url})}
                        bucket="ebook-assets"
                        label="Vídeo do Capítulo"
                        description="Recomendado: suba o vídeo no YouTube como 'Não listado' e cole o link aqui (streaming adaptativo, sem travar no celular)."
                      />
                    </div>
                    {editingChapter.video_url && (
                      <div className="w-full max-w-[220px] shrink-0 self-end">
                        <VideoPlayer
                          key={editingChapter.video_url}
                          src={editingChapter.video_url}
                          title={editingChapter.title || "Prévia do vídeo"}
                        />
                      </div>
                    )}

                  </div>
                </div>
              </div>

              <div className="space-y-1.5 flex-1 flex flex-col min-h-[500px] lg:min-h-[65vh]">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Conteúdo do Capítulo</label>
                  <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                    <button 
                      onClick={() => setEditorMode('visual')}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                        editorMode === 'visual' ? "bg-[#ff6a00] text-black" : "text-white/40 hover:text-white"
                      )}
                    >
                      Visual
                    </button>
                    <button 
                      onClick={() => setEditorMode('code')}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                        editorMode === 'code' ? "bg-[#ff6a00] text-black" : "text-white/40 hover:text-white"
                      )}
                    >
                      Código
                    </button>
                  </div>
                </div>

                {editorMode === 'visual' ? (
                  <div className="flex-1 min-h-0">
                    <VisualChapterEditor 
                      key={editingChapter.id}
                      content={editingChapter.content || ""}
                      onChange={(html) => setEditingChapter({...editingChapter, content: html})}
                    />
                  </div>
                ) : (
                  <textarea 
                    value={editingChapter.content || ""}
                    onChange={e => setEditingChapter({...editingChapter, content: e.target.value})}
                    placeholder="Escreva aqui o conteúdo do capítulo (HTML ou Markdown)..."
                    className="flex-1 w-full bg-black/20 border border-white/10 p-6 rounded-xl text-base font-mono leading-relaxed outline-none focus:border-[#ff6a00] resize-none overflow-y-auto"
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-20">
            <Edit3 className="h-12 w-12 mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">Selecione um capítulo para editar</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleChapters({ module, editingChapterId, onEdit, onReorder }: { 
  module: any, 
  editingChapterId?: string, 
  onEdit: (chapter: any) => void,
  onReorder: (chapterId: string, newIndex: number) => Promise<void>
}) {
  const [chapters, setChapters] = useState(module.chapters?.sort((a: any, b: any) => a.order_index - b.order_index) || []);
  
  useEffect(() => {
    setChapters(module.chapters?.sort((a: any, b: any) => a.order_index - b.order_index) || []);
  }, [module.chapters]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = chapters.findIndex((c: any) => c.id === active.id);
      const newIndex = chapters.findIndex((c: any) => c.id === over.id);

      const newChapters = arrayMove(chapters, oldIndex, newIndex);
      setChapters(newChapters);
      onReorder(active.id as string, newIndex);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={chapters.map((c: any) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {chapters.map((chapter: any) => (
            <SortableChapterItem 
              key={chapter.id} 
              chapter={chapter} 
              isActive={editingChapterId === chapter.id}
              onClick={() => onEdit(chapter)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableChapterItem({ chapter, isActive, onClick }: { 
  chapter: any, 
  isActive: boolean,
  onClick: () => void 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "flex items-center gap-1 group/item",
        isDragging && "shadow-lg border-[#ff6a00]/50"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="p-1 text-white/10 hover:text-white/40 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </div>
      
      <button
        onClick={onClick}
        className={cn(
          "flex-1 flex items-center justify-between px-3 py-2 rounded-md text-[11px] transition-all",
          isActive ? "bg-[#ff6a00]/10 text-[#ff6a00] font-bold" : "text-white/40 hover:text-white hover:bg-white/5"
        )}
      >
        <span className="truncate">{chapter.title}</span>
        <div className="flex items-center gap-2">
          {chapter.video_url && <Play className="h-2.5 w-2.5" />}
          <Edit3 className="h-3 w-3 opacity-0 group-hover/item:opacity-100" />
        </div>
      </button>
    </div>
  );
}

function SEOTooltip({ type, content, keywords }: { type: 'title' | 'description' | 'keywords', content: string, keywords?: string }) {
  const [suggestions, setSuggestions] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      const result = await getSEOSuggestions({ 
        data: { 
          title: type === 'title' ? content : undefined,
          description: type === 'description' ? content : undefined,
          keywords: type === 'keywords' ? (Array.isArray(content) ? content.join(', ') : content) : (Array.isArray(keywords) ? keywords.join(', ') : keywords)
        } 
      });
      setSuggestions(result[type]);
    };
    if (content) fetchSuggestions();
  }, [content, keywords, type]);

  if (!suggestions || suggestions.suggestions.length === 0) {
    if (suggestions?.score === 'optimal') {
      return (
        <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold uppercase tracking-tighter">
          <CheckCircle2 className="h-3 w-3" /> SEO Otimizado
        </div>
      );
    }
    return null;
  }

  return (
    <div className="relative group">
      <button 
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={cn(
          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-colors",
          suggestions.score === 'optimal' ? "text-green-500" : "text-yellow-500"
        )}
      >
        <AlertCircle className="h-3 w-3" /> 
        {suggestions.score === 'optimal' ? 'SEO Otimizado' : 'Sugestões de SEO'}
      </button>

      {show && (
        <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
            <HelpCircle className="h-4 w-4 text-[#ff6a00]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Análise de SEO</span>
          </div>
          <ul className="space-y-2">
            {suggestions.suggestions.map((s: string, i: number) => (
              <li key={i} className="text-[11px] text-white/80 leading-relaxed flex gap-2">
                <span className="text-[#ff6a00] shrink-0">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
