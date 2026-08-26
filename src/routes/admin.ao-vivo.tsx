import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Video, 
  Calendar, 
  Link as LinkIcon, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Play, 
  Trash2,
  AlertCircle,
  X,
  Loader2,
  Image as ImageIcon,
  Upload
} from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { supabase } from "@/integrations/supabase/client";
import { saveLiveClass } from "@/lib/content-admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/ao-vivo")({
  head: () => ({ meta: [{ title: "Aulas ao Vivo · Admin" }] }),
  component: LiveClassesPage,
});

type LiveClass = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  link: string | null;
  materials_url: string | null;
  cover_url: string | null;
  status: 'scheduled' | 'live' | 'completed';
};

function LiveClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Partial<LiveClass> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveLiveClassFn = useServerFn(saveLiveClass);

  useEffect(() => {
    fetchClasses();
  }, []);

  async function fetchClasses() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('live_classes')
        .select('*')
        .order('scheduled_at', { ascending: false });

      if (error) throw error;
      setClasses((data as LiveClass[]) || []);
    } catch (error: any) {
      toast.error("Erro ao carregar aulas: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClass?.title || !editingClass?.scheduled_at) {
      toast.error("Título e data são obrigatórios");
      return;
    }

    try {
      setIsSaving(true);
      await saveLiveClassFn({ data: editingClass as any });
      toast.success(editingClass.id ? "Aula atualizada!" : "Aula agendada!");
      setIsModalOpen(false);
      setEditingClass(null);
      fetchClasses();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta aula?")) return;
    try {
      const { error } = await supabase.from('live_classes').delete().eq('id', id);
      if (error) throw error;
      toast.success("Aula excluída");
      fetchClasses();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500 animate-pulse"><Play className="h-3 w-3 fill-current" /> Ao Vivo</span>;
      case 'completed':
        return <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Concluída</span>;
      default:
        return <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-500"><Clock className="h-3 w-3" /> Agendada</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Aulas ao Vivo"
        subtitle="Agende, transmita e gerencie seus eventos em tempo real."
        action={
          <button 
            onClick={() => { setEditingClass({ status: 'scheduled' }); setIsModalOpen(true); }}
            className="btn-fire"
          >
            <Plus className="h-4 w-4" /> Novo Evento
          </button>
        }
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
          <Video className="mb-4 h-12 w-12 text-white/10" />
          <h3 className="font-display text-lg font-bold">Nenhuma aula encontrada</h3>
          <p className="max-w-xs text-sm text-muted-foreground">Comece agendando sua primeira live clicando no botão acima.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {classes.map((c) => (
            <div key={c.id} className="group relative overflow-hidden rounded-xl border border-white/5 bg-[#111] p-5 transition hover:border-primary/40">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-start gap-4">
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    {c.cover_url ? (
                      <img src={c.cover_url} alt={c.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/10">
                        <Video className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusBadge(c.status)}
                      <span className="text-[10px] font-medium text-white/30 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(c.scheduled_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white">{c.title}</h3>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{c.description || "Sem descrição"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { setEditingClass(c); setIsModalOpen(true); }}
                    className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-xs font-bold transition hover:bg-white/10"
                  >
                    Editar
                  </button>
                  <button 
                    onClick={() => handleDelete(c.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 transition hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto py-6 sm:py-4">
          <div className="w-full max-w-xl animate-in zoom-in-95 rounded-2xl border border-white/10 bg-[#0e0e0e] p-6 shadow-2xl">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
              <h3 className="font-display text-xl font-bold uppercase tracking-tight">
                {editingClass?.id ? "Editar Evento" : "Novo Evento ao Vivo"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/40 hover:text-white transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Imagem de Capa (URL)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editingClass?.cover_url || ""}
                    onChange={(e) => setEditingClass({ ...editingClass, cover_url: e.target.value })}
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition"
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                    {editingClass?.cover_url && (
                      <img src={editingClass.cover_url} alt="Preview" className="h-full w-full object-cover" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Título do Evento</label>
                <input
                  type="text"
                  required
                  value={editingClass?.title || ""}
                  onChange={(e) => setEditingClass({ ...editingClass, title: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition text-[16px] md:text-sm"
                  placeholder="Ex.: Masterclass: O Segredo da Brasa"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Data e Hora</label>
                  <input
                    type="datetime-local"
                    required
                    value={editingClass?.scheduled_at ? new Date(new Date(editingClass.scheduled_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setEditingClass({ ...editingClass, scheduled_at: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status</label>
                  <select
                    value={editingClass?.status || "scheduled"}
                    onChange={(e) => setEditingClass({ ...editingClass, status: e.target.value as any })}
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition"
                  >
                    <option value="scheduled">Agendada</option>
                    <option value="live">Ao Vivo agora</option>
                    <option value="completed">Concluída</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Link da Transmissão (YouTube/Vimeo)</label>
                <input
                  type="url"
                  value={editingClass?.link || ""}
                  onChange={(e) => setEditingClass({ ...editingClass, link: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition"
                  placeholder="https://youtube.com/live/..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Descrição</label>
                <textarea
                  value={editingClass?.description || ""}
                  onChange={(e) => setEditingClass({ ...editingClass, description: e.target.value })}
                  className="h-24 w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-primary transition"
                  placeholder="Conte o que os alunos vão aprender..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-3 text-sm font-bold transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="btn-fire flex-1 justify-center disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingClass?.id ? "Salvar Alterações" : "Agendar Aula"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
