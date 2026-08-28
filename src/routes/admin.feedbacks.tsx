import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Star, CheckCircle2, XCircle, Trash2, Search, Filter, MessageSquare, Loader2, User, Reply, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/platform/Shell";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/admin/feedbacks")({
  head: () => ({
    meta: [
      { title: "Feedbacks — Admin" },
      { name: "description", content: "Moderação e resposta aos feedbacks enviados pelos alunos." },
      { property: "og:title", content: "Feedbacks — Admin" },
      { property: "og:description", content: "Moderação e resposta aos feedbacks enviados pelos alunos." },
    ],
  }),
  component: AdminFeedbacksPage,
});

function AdminFeedbacksPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [replyText, setReplyText] = useState("");
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: feedbacks, isLoading } = useQuery({
    queryKey: ["admin-feedbacks", statusFilter, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("course_feedback")
        .select(`
          *,
          course:courses(title),
          ebook:ebooks(title),
          profile:profiles(name, avatar_url, email)
        `)

        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      if (searchTerm) {
        return data.filter(f => 
          f.course?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          f.ebook?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          f.profile?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          f.comment?.toLowerCase().includes(searchTerm.toLowerCase())
        );

      }
      
      return data;
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase
        .from("course_feedback")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedbacks"] });
      toast.success(`Feedback ${variables.status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso!`);
    },
    onError: (error: any) => {
      toast.error("Erro ao moderar feedback: " + error.message);
    }
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, admin_reply }: { id: string, admin_reply: string }) => {
      const { error } = await supabase
        .from("course_feedback")
        .update({ admin_reply, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedbacks"] });
      toast.success("Resposta enviada com sucesso!");
      setActiveReplyId(null);
      setReplyText("");
    },
    onError: (error: any) => {
      toast.error("Erro ao enviar resposta: " + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("course_feedback")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedbacks"] });
      toast.success("Feedback excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir feedback: " + error.message);
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Feedback de Alunos" 
        subtitle="Modere os comentários e avaliações recebidas após a conclusão dos cursos."
      />

      {/* Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Buscar por curso, aluno ou comentário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 pl-10 pr-4 py-2 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/40" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm outline-none focus:border-[#ff6a00] transition"
          >
            <option value="pending" className="bg-[#0e0e0e]">Pendentes</option>
            <option value="approved" className="bg-[#0e0e0e]">Aprovados</option>
            <option value="rejected" className="bg-[#0e0e0e]">Rejeitados</option>
            <option value="all" className="bg-[#0e0e0e]">Todos</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : feedbacks?.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10 border-dashed">
          <MessageSquare className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40">Nenhum feedback encontrado.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {feedbacks?.map((feedback) => (
            <div 
              key={feedback.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] transition group"
            >
              <div className="flex flex-col md:flex-row gap-6 md:items-start">
                {/* User Info */}
                <div className="flex items-center gap-3 w-64 shrink-0">
                  <div className="h-12 w-12 rounded-full bg-white/10 overflow-hidden shrink-0 border border-white/10">
                    {feedback.profile?.avatar_url ? (
                      <img src={feedback.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center">
                        <User className="h-6 w-6 text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white">
                      {feedback.profile?.name || "Aluno sem nome"}
                    </p>

                    <p className="text-xs text-white/40 truncate">
                      {feedback.profile?.email}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star 
                          key={star}
                          className={`h-4 w-4 ${feedback.rating >= star ? 'fill-[#ff6a00] text-[#ff6a00]' : 'text-white/10'}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-[#ff6a00]">
                      {feedback.course?.title || feedback.ebook?.title}
                    </span>
                    <span className="text-xs text-white/20">
                      {format(new Date(feedback.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 italic leading-relaxed">
                    "{feedback.comment || "Sem comentários."}"
                  </p>
                  {feedback.admin_reply && (
                    <div className="mt-4 p-4 rounded-xl bg-[#ff6a00]/5 border border-[#ff6a00]/10 ml-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="h-3 w-3 text-[#ff6a00]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00]">Resposta Oficial</span>
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed italic">
                        "{feedback.admin_reply}"
                      </p>
                    </div>
                  )}

                  {activeReplyId === feedback.id && (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Escreva sua resposta oficial aqui..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm min-h-[100px] outline-none focus:border-[#ff6a00] transition"
                      />
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setActiveReplyId(null)}
                          className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={() => replyMutation.mutate({ id: feedback.id, admin_reply: replyText })}
                          disabled={replyMutation.isPending || !replyText.trim()}
                          className="px-4 py-2 bg-[#ff6a00] text-black rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#ff8c33] transition disabled:opacity-50"
                        >
                          {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Enviar Resposta
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                  {feedback.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => moderateMutation.mutate({ id: feedback.id, status: 'approved' })}
                        className="p-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Aprovar
                      </button>
                      <button 
                        onClick={() => moderateMutation.mutate({ id: feedback.id, status: 'rejected' })}
                        className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                      >
                        <XCircle className="h-4 w-4" /> Rejeitar
                      </button>
                    </>
                  )}
                  {feedback.status === 'approved' && !feedback.admin_reply && activeReplyId !== feedback.id && (
                    <button 
                      onClick={() => setActiveReplyId(feedback.id)}
                      className="p-2 rounded-lg bg-[#ff6a00]/10 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-black transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                    >
                      <Reply className="h-4 w-4" /> Responder
                    </button>
                  )}
                  {feedback.status !== 'pending' && (
                     <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        feedback.status === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {feedback.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                     </div>
                  )}
                  <button 
                    onClick={() => {
                      if(window.confirm("Tem certeza que deseja excluir este feedback permanentemente?")) {
                        deleteMutation.mutate(feedback.id);
                      }
                    }}
                    className="p-2 rounded-lg text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    title="Excluir Permanentemente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
