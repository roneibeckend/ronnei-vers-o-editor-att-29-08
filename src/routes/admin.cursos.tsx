import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { notifyNewContent } from "@/lib/content-notify.functions";
import { useState, useEffect } from "react";
import { 
  Plus, 
  Library, 
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
  Flag,
  Save,
  Award,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { CourseTreeEditor } from "@/components/admin/CourseTreeEditor";
import { CertificateEditor } from "@/components/admin/CertificateEditor";
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

export const Route = createFileRoute("/admin/cursos")({
  head: () => ({ meta: [{ title: "Gestão de Cursos · Admin" }] }),
  component: AdminCursosPage,
});

function AdminCursosPage() {
  const [courses, setCourses] = useState<any[]>([]);
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
        .from('courses')
        .select('*, modules:course_modules(id, lessons:course_lessons(id))', { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('title', `%${searchTerm}%`);
      }

      if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query
        .order('updated_at', { ascending: false })
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
        
      if (error) throw error;
      setCourses(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error("Erro ao carregar cursos: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSaving(true);
      // Remove virtual 'modules' property before saving to 'courses' table
      const { modules, ...payload } = editingItem;

      const { data, error } = await supabase
        .from('courses')
        .upsert({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success("Curso salvo com sucesso!");
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

  async function handleNotify(course: any, force = false) {
    setNotifyingId(course.id);
    try {
      const res: any = await notifyContent({ data: { contentType: "course", contentId: course.id, force } });
      if (res?.alreadySent) {
        if (confirm("Este curso já foi anunciado por e-mail. Deseja enviar novamente para todos os alunos?")) {
          setNotifyingId(null);
          return handleNotify(course, true);
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
        .from('courses')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      toast.success(newStatus === 'active' ? 'Curso ativado e visível para alunos.' : 'Curso desativado.');
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    }
  }

  async function handleDuplicate(course: any) {
    try {
      const { id, created_at, updated_at, modules, ...rest } = course;
      const { data, error } = await supabase
        .from('courses')
        .insert({
          ...rest,
          title: `${rest.title} (Cópia)`,
          slug: `${rest.slug}-copia-${Date.now()}`,
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Curso duplicado!");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao duplicar: " + error.message);
    }
  }

  async function handleDelete(course: any) {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o curso "${course.title}"? Esta ação removerá o curso da prateleira de todos os alunos.`)) return;
    try {
      // Direct deletion will now trigger ON DELETE CASCADE in the database
      const { error } = await supabase.from('courses').delete().eq('id', course.id);
      if (error) throw error;
      toast.success("Curso excluído permanentemente");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 text-left">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold">Gestão de Cursos</h2>
          <p className="text-[10px] sm:text-sm text-white/40">Gerencie o catálogo de treinamentos e videoaulas.</p>
        </div>
        <button 
          onClick={() => { 
            setEditingItem({ 
              id: crypto.randomUUID(),
              title: "", 
              slug: "", 
              status: "draft", 
              level: "beginner",
              order_index: totalCount 
            }); 

            setIsModalOpen(true); 
          }}
          className="flex items-center justify-center gap-2 bg-[#ff6a00] px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-lg text-sm font-bold text-black hover:bg-[#ff8c33] transition-colors w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Criar Novo Curso
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
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
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
            <option value="active">Publicados</option>
            <option value="coming_soon">Em breve</option>
            <option value="draft">Rascunho</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
          <Library className="h-12 w-12 text-white/10 mb-4" />
          <p className="text-white/40 text-sm">Nenhum curso encontrado.</p>
          <button 
            onClick={() => { setEditingItem({ id: crypto.randomUUID(), title: "", slug: "", status: "draft", level: "beginner" }); setIsModalOpen(true); }}
            className="mt-4 text-[#ff6a00] text-sm font-bold hover:underline"
          >
            Criar meu primeiro curso
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#111] w-full">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-6 py-4 w-[40%] min-w-[250px]">Capa / Título</th>
                <th className="px-6 py-4 w-[20%] min-w-[150px]">Módulos/Aulas</th>
                <th className="px-6 py-4 w-[15%] min-w-[100px]">Status</th>
                <th className="px-6 py-4 text-right w-[25%] min-w-[200px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {course.cover_url ? (
                        <img src={course.cover_url} alt={course.title} className="h-8 w-12 sm:h-10 sm:w-16 object-cover rounded bg-white/5 shrink-0" />
                      ) : (
                        <div className="h-8 w-12 sm:h-10 sm:w-16 rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0">
                          <Library className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm">{course.title}</div>
                        <div className="hidden sm:block text-[10px] text-white/20 uppercase tracking-tighter">
                          Atu. {format(new Date(course.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium">{course.modules?.length || 0} Módulos</span>
                      <span className="text-[10px] text-white/40">
                        {course.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0} Aulas
                      </span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-bold uppercase tracking-wider",
                      course.status === 'active' ? "bg-green-500/10 text-green-500" : course.status === 'coming_soon' ? "bg-sky-500/10 text-sky-400" : "bg-yellow-500/10 text-yellow-500"
                    )}>
                      {course.status === 'active' ? 'PUBLICADO' : course.status === 'coming_soon' ? 'EM BREVE' : 'RASCUNHO'}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                      <button 
                        onClick={() => handleStatusChange(course.id, course.status === 'active' ? 'draft' : 'active')}
                        title={course.status === 'active' ? 'Tornar rascunho' : 'Publicar'}
                        className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-colors"
                      >
                        {course.status === 'active' ? <Eye className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </button>
                      <button 
                        onClick={() => { setEditingItem(course); setActiveTab("info"); setIsModalOpen(true); }}
                        className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleNotify(course)}
                        disabled={notifyingId === course.id}
                        title="Avisar alunos por e-mail sobre este curso"
                        className="p-1.5 sm:p-2 text-white/40 hover:text-[#ff6a00] transition-colors disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(course)}
                        className="p-1.5 sm:p-2 text-white/40 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {totalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between p-4 border-t border-white/5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                Página {currentPage} de {Math.ceil(totalCount / ITEMS_PER_PAGE)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(totalCount / ITEMS_PER_PAGE)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm p-2 sm:p-4 text-left pointer-events-auto">
          <div className="flex w-full max-w-[95vw] flex-col overflow-hidden bg-[#0e0e0e] p-4 sm:p-6 sm:max-w-4xl sm:border sm:border-white/10 rounded-2xl h-[calc(100dvh-1rem)] sm:h-[min(92dvh,calc(100dvh-2rem))] relative z-10">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4 sm:mb-6 shrink-0">
              <h3 className="truncate text-base sm:text-xl font-bold pr-2">{editingItem?.id ? `Editando: ${editingItem.title}` : "Novo Curso"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0"><X className="h-5 w-5" /></button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mb-4 sm:mb-6 shrink-0 w-full max-w-full justify-start gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg border border-white/10 bg-white/5 p-1 sm:w-auto sm:self-start">
                <TabsTrigger value="info" className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Info className="h-4 w-4" /> Informações
                </TabsTrigger>
                <TabsTrigger value="checkpoints" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Flag className="h-4 w-4" /> Checkpoints
                </TabsTrigger>
                <TabsTrigger value="content" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Layout className="h-4 w-4" /> Conteúdo
                </TabsTrigger>
                <TabsTrigger value="students" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Users className="h-4 w-4" /> Alunos
                </TabsTrigger>
                <TabsTrigger value="certificates" disabled={!editingItem?.id} className="flex items-center gap-2 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black">
                  <Award className="h-4 w-4" /> Certificados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 mt-0">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do Curso</label>
                        <input 
                          required 
                          value={editingItem?.title || ""} 
                          onChange={e => {
                            const title = e.target.value;
                            const slug = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
                            setEditingItem({...editingItem, title, slug});
                          }} 
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Slug (URL amigável)</label>
                        <input 
                          required 
                          value={editingItem?.slug || ""} 
                          onChange={e => setEditingItem({...editingItem, slug: e.target.value})} 
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Nível</label>
                        <select 
                          value={editingItem?.level || "beginner"} 
                          onChange={e => setEditingItem({...editingItem, level: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] appearance-none cursor-pointer"
                        >
                          <option value="beginner">Iniciante</option>
                          <option value="intermediate">Intermediário</option>
                          <option value="advanced">Avançado</option>
                        </select>
                      </div>

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
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Dias úteis para vencimento</label>
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
                      <ImageUpload 
                        value={editingItem?.cover_url || ""} 
                        onChange={url => setEditingItem({...editingItem, cover_url: url})}
                        bucket="course-assets"
                        label="Imagem de Capa"
                        description="Proporção 16:9 recomendada (ex: 1280x720px)."
                      />
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Preço do Curso (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={editingItem?.price || ""} 
                          onChange={e => setEditingItem({...editingItem, price: parseFloat(e.target.value)})} 
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">URL do Vídeo de Intro (Opcional)</label>
                        <input 
                          value={editingItem?.intro_video_url || ""} 
                          onChange={e => setEditingItem({...editingItem, intro_video_url: e.target.value})} 
                          placeholder="YouTube, Vimeo ou Panda"
                          className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Descrição Curta</label>
                    <textarea 
                      rows={3} 
                      value={editingItem?.description || ""} 
                      onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                      className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors resize-none" 
                    />
                  </div>

                  <WorkloadHoursField
                    contentId={editingItem?.id}
                    contentType="course"
                    hours={editingItem?.workload_hours ?? null}
                    extras={editingItem?.workload_extras ?? null}
                    onChange={(patch) => setEditingItem({ ...editingItem, ...patch })}
                  />

                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold">Status do Conteúdo</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">Publicado: compra liberada. Em breve: aparece na vitrine sem compra.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, status: 'draft'})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.status === 'draft' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Rascunho
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, status: 'coming_soon'})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.status === 'coming_soon' ? "bg-sky-500/20 text-sky-400 border border-sky-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Em breve
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, status: 'active'})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.status === 'active' ? "bg-green-500/20 text-green-500 border border-green-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Publicado
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold">Disponível para Afiliados</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-widest">Se desativado, afiliados não podem gerar links deste curso</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, affiliate_enabled: false})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.affiliate_enabled === false ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItem({...editingItem, affiliate_enabled: true})}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          editingItem?.affiliate_enabled !== false ? "bg-green-500/20 text-green-500 border border-green-500/50" : "bg-white/5 text-white/40 border border-transparent"
                        )}
                      >
                        Sim
                      </button>
                    </div>
                  </div>


                  <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-lg bg-white/5 font-bold hover:bg-white/10 transition-colors">Cancelar</button>
                    <button type="submit" disabled={isSaving} className="flex-1 py-3 rounded-lg bg-[#ff6a00] text-black font-bold disabled:opacity-50 hover:bg-[#ff8c33] transition-colors">
                      {isSaving ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                        </div>
                      ) : "Salvar Informações"}
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="checkpoints" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 mt-0">
                {editingItem?.id && (
                  <div className="space-y-6">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                      <h4 className="font-bold flex items-center gap-2 mb-4">
                        <Flag className="h-5 w-5 text-[#ff6a00]" /> Configurar Pontos de Verificação (Checkpoints)
                      </h4>
                      <p className="text-sm text-white/60 mb-6">
                        Defina marcos específicos onde o progresso do aluno deve ser registrado obrigatoriamente.
                        As notificações de marcos (25%, 50%, 75%, 100%) são automáticas.
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

              <TabsContent value="content" className="flex-1 min-h-0 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                {editingItem?.id && <CourseTreeEditor courseId={editingItem.id} />}
              </TabsContent>

              <TabsContent value="students" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 mt-0">
                <div className="flex flex-col items-center justify-center py-20 text-white/20">
                  <Users className="h-12 w-12 mb-4" />
                  <p className="text-sm">Funcionalidade de listagem de alunos em desenvolvimento.</p>
                </div>
              </TabsContent>

              <TabsContent value="certificates" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 mt-0">
                {editingItem?.id && (
                  <CertificateEditor 
                    contentId={editingItem.id} 
                    contentType="course" 
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
