import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { 
  Flame, 
  Send, 
  MessageCircle, 
  Ticket as TicketIcon, 
  PlusCircle,
  Loader2,
  CheckCircle2,
  Clock,
  User,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  LayoutGrid,
  ChevronLeft,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/platform/Shell";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@tanstack/react-start";
import { getChatbotResponse, getKnowledgeMenu, submitKnowledgeFeedback } from "@/lib/chatbot.functions";
import type { KnowledgeMenuCategory } from "@/lib/chatbot.functions";

type Msg = { 
  role: "user" | "ai"; 
  text: string; 
  time: string;
  knowledgeId?: string | null;
  feedbackGiven?: boolean;
  needsHuman?: boolean;
};

export const Route = createFileRoute("/app/suporte")({
  head: () => ({ meta: [{ title: "Suporte e Central de Ajuda — Ronnei na Veia" }] }),
  component: SupportPage,
});

function SupportPage() {
  const getChatbot = useServerFn(getChatbotResponse);
  const sendFeedback = useServerFn(submitKnowledgeFeedback);
  const fetchMenu = useServerFn(getKnowledgeMenu);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chat" | "tickets">("chat");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { 
      role: "ai", 
      text: "Oi! Eu sou a Brasa, sua assistente da plataforma. Como posso te ajudar hoje?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [isOpeningTicket, setIsOpeningTicket] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuData, setMenuData] = useState<KnowledgeMenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen || menuData.length > 0) return;
    let cancelled = false;
    setMenuLoading(true);
    fetchMenu({ data: { surface: "app" } })
      .then((res) => {
        if (!cancelled) setMenuData(res.categories);
      })
      .catch((err) => console.error("Erro ao carregar categorias:", err))
      .finally(() => {
        if (!cancelled) setMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, menuData.length, fetchMenu]);

  // Buscar tickets do banco
  const { data: myTickets = [], isLoading: isLoadingTickets } = useQuery({
    queryKey: ["support-tickets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Buscar mensagens do ticket selecionado
  const { data: ticketMessages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["support-messages", selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return [];
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", selectedTicketId)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTicketId,
  });

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "chat") {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typing, activeTab]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((m) => [...m, { role: "user", text, time: now }]);
    setInput("");
    setTyping(true);
    
    // Obter resposta inteligente do servidor
    (async () => {
      try {
        const result = await getChatbot({ 
          data: {
            message: text,
            context: {
              url: window.location.href,
              path: window.location.pathname
            }
          }
        });
        
        setMessages((m) => [...m, { 
          role: "ai", 
          text: result.answer,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          knowledgeId: result.knowledgeId,
          needsHuman: result.needsHuman
        }]);
      } catch (error) {
        console.error("Erro no chatbot:", error);
        setMessages((m) => [...m, { 
          role: "ai", 
          text: "Desculpe, tive um problema e não consegui processar sua dúvida agora. Tente novamente ou fale com nosso suporte.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } finally {
        setTyping(false);
      }
    })();
  };

  const submitFeedback = async (msgIndex: number, knowledgeId: string, isPositive: boolean) => {
    try {
      await sendFeedback({ data: { knowledgeId, isPositive } });
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, feedbackGiven: true } : m));
      toast.success(isPositive ? "Obrigado pelo feedback!" : "Lamentamos. Vamos revisar essa resposta.");
    } catch (error) {
      console.error("Erro ao enviar feedback:", error);
    }
  };

  const handleOpenTicket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const subject = formData.get("subject") as string;
    const category = formData.get("category") as string;
    const message = (formData.get("message") as string) || "(sem mensagem)";
    
    try {
      // 1. Criar o ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          subject,
          category,
          status: "Aberto",
          priority: "normal"
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 2. Criar a primeira mensagem
      const { error: msgError } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: ticket.id,
          message,
          sender_id: user.id,
          sender_type: "student"
        });

      if (msgError) throw msgError;

      // Confirmação de abertura de chamado por e-mail (não bloqueia o fluxo)
      try {
        const { notifySupportTicketCreated } = await import("@/lib/email-triggers.functions");
        await notifySupportTicketCreated({ data: { ticket_id: ticket.id, message } });
      } catch (mailErr) {
        console.error("[Suporte] Falha ao enviar e-mail de confirmação:", mailErr);
      }

      toast.success("Seu chamado foi enviado para a equipe do Ronnei!", {
        description: `Protocolo: ${ticket.id.slice(0, 8)}`
      });
      
      setIsOpeningTicket(false);
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (error: any) {
      toast.error("Erro ao abrir chamado: " + error.message);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTicketId || !replyText.trim()) return;

    try {
      setIsSendingReply(true);
      const { error } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: selectedTicketId,
          message: replyText.trim(),
          sender_id: user.id,
          sender_type: "student"
        });

      if (error) throw error;

      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["support-messages", selectedTicketId] });
      toast.success("Mensagem enviada!");
    } catch (error: any) {
      toast.error("Erro ao enviar mensagem: " + error.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  if (isLoadingTickets) {
    return (
      <div className="animate-in fade-in duration-500">
        <PageHeader title="Central de Suporte" subtitle="Escolha como deseja ser atendido hoje." />
        <div className="mb-8 flex gap-2">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-12 w-48" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <Skeleton className="h-[600px] w-full rounded-2xl" />
          <div className="space-y-6">
            <Skeleton className="h-[200px] w-full rounded-2xl" />
            <Skeleton className="h-[300px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="Central de Suporte"
        subtitle="Escolha como deseja ser atendido hoje."
      />

      {/* Tabs Navigation */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3">
        <button 
          onClick={() => setActiveTab("chat")}
          className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-xs sm:text-sm font-bold uppercase tracking-widest transition w-full sm:w-auto h-12 sm:h-auto ${
            activeTab === "chat" 
              ? "bg-[#ff6a00] text-black shadow-lg shadow-[#ff6a00]/20" 
              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Chat com a Brasa
        </button>
        <button 
          onClick={() => setActiveTab("tickets")}
          className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-xs sm:text-sm font-bold uppercase tracking-widest transition w-full sm:w-auto h-12 sm:h-auto ${
            activeTab === "tickets" 
              ? "bg-[#ff6a00] text-black shadow-lg shadow-[#ff6a00]/20" 
              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
          }`}
        >
          <TicketIcon className="h-4 w-4" />
          Meus Chamados
        </button>
      </div>


      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Main Content Area */}
        <div className="min-h-[600px]">
          {activeTab === "chat" ? (
            <section className="glass flex h-[650px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff6a00] to-[#ff9500] shadow-lg shadow-[#ff6a00]/20">
                      <Flame className="h-6 w-6 text-black" strokeWidth={2.5} />
                    </div>
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-4 border-[#0a0a0a] bg-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Brasa</h3>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                      <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Assistente Online
                    </div>
                  </div>
                </div>
                <div className="hidden md:block">
                  <span className="rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Atendimento Inteligente
                  </span>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
                {messages.map((m, i) => (
                  <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                    <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
                      {m.role === "ai" && (
                        <div className="mb-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 sm:flex">
                          <Flame className="h-4 w-4 text-[#ff6a00]" />
                        </div>
                      )}
                      <div className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                        m.role === "user" 
                          ? "bg-[#ff6a00] text-black font-medium rounded-tr-none" 
                          : "bg-white/5 text-white/90 border border-white/5 rounded-tl-none"
                      }`}>
                        {m.text}
                      </div>
                    </div>
                    
                    {/* Feedback and Contextual Actions */}
                    {m.role === "ai" && m.knowledgeId && !m.feedbackGiven && (
                      <div className="mt-2 flex items-center gap-3 px-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Isso ajudou?</span>
                        <button 
                          onClick={() => submitFeedback(i, m.knowledgeId!, true)}
                          className="hover:text-emerald-500 text-white/20 transition-colors"
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button 
                          onClick={() => submitFeedback(i, m.knowledgeId!, false)}
                          className="hover:text-fire text-white/20 transition-colors"
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {m.role === "ai" && m.needsHuman && (
                      <div className="mt-3 flex gap-2 px-2">
                        <button 
                          onClick={() => setActiveTab("tickets")}
                          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ff6a00] hover:bg-white/10 transition"
                        >
                          <TicketIcon className="h-3 w-3" /> Falar com suporte
                        </button>
                      </div>
                    )}

                    <span className="mt-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-white/20">
                      {m.time}
                    </span>
                  </div>
                ))}
                
                {typing && (
                  <div className="flex items-start gap-2">
                    <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 sm:flex">
                      <Flame className="h-4 w-4 text-[#ff6a00]" />
                    </div>
                    <div className="flex gap-1 rounded-2xl bg-white/5 px-5 py-4 border border-white/5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/20" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/20 [animation-delay:0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/20 [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-white/5 bg-white/[0.01] p-4">
                <form
                  onSubmit={(e) => { e.preventDefault(); send(input); }}
                  className="relative flex items-center"
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escreva sua pergunta aqui..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-6 pr-16 text-sm outline-none transition-all placeholder:text-white/20 focus:border-[#ff6a00]/50 focus:bg-white/10"
                  />
                  <button 
                    type="submit" 
                    disabled={!input.trim()}
                    className="absolute right-2 grid h-10 w-10 place-items-center rounded-xl bg-[#ff6a00] text-black shadow-lg shadow-[#ff6a00]/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    aria-label="Enviar"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
                <p className="mt-3 text-center text-[10px] font-medium text-white/20 uppercase tracking-[0.15em]">
                  Respostas instantâneas baseadas no conteúdo do curso
                </p>
              </div>
            </section>
          ) : (
            <section className="space-y-6">
              {/* Ticket Creation Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/5 p-6 lg:p-8">
                <div className="max-w-md">
                  <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                    <PlusCircle className="h-6 w-6 text-[#ff6a00]" />
                    Precisa de ajuda humana?
                  </h3>
                  <p className="mt-1 text-sm text-white/50 leading-relaxed">
                    Abra um chamado direto para a equipe do Ronnei. Respondemos em até 24 horas úteis.
                  </p>
                </div>
                {!isOpeningTicket && (
                  <button 
                    onClick={() => setIsOpeningTicket(true)}
                    className="btn-fire px-8 py-3.5 text-sm font-bold uppercase tracking-widest whitespace-nowrap"
                  >
                    Abrir Novo Chamado
                  </button>
                )}
              </div>

              {/* Ticket Form */}
              {isOpeningTicket && (
                <div className="glass rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:p-8 animate-in zoom-in-95 duration-300">
                  <div className="mb-8 flex items-center justify-between">
                    <h4 className="font-display text-lg font-bold text-white">Novo Ticket de Suporte</h4>
                    <button 
                      onClick={() => setIsOpeningTicket(false)}
                      className="text-xs font-bold uppercase tracking-widest text-white/30 hover:text-white transition"
                    >
                      Cancelar
                    </button>
                  </div>
                  <form onSubmit={handleOpenTicket} className="grid gap-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Assunto</label>
                        <input 
                          name="subject"
                          required
                          placeholder="Ex: Dúvida sobre finalização de espeto"
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00]"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Categoria</label>
                        <select 
                          name="category"
                          required
                          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm outline-none focus:border-[#ff6a00]"
                        >
                          <option value="Dúvida Técnica">Dúvida Técnica (Receitas)</option>
                          <option value="Acesso">Acesso à Plataforma</option>
                          <option value="Financeiro">Financeiro / Pagamentos</option>
                          <option value="Outros">Sugestões / Outros</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Sua Mensagem</label>
                      <textarea 
                        name="message"
                        required
                        rows={4}
                        placeholder="Descreva detalhadamente como podemos te ajudar..."
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-[#ff6a00] resize-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" className="btn-fire w-full sm:w-auto px-10 py-4 text-sm font-bold uppercase tracking-widest">
                        Enviar para Equipe
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Tickets List and Messages View */}
              <div className="glass overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="bg-white/5 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h4 className="font-display text-sm font-bold uppercase tracking-widest text-white/60">
                    {selectedTicketId ? "Conversa do Chamado" : "Histórico de Chamados"}
                  </h4>
                  {selectedTicketId && (
                    <button 
                      onClick={() => setSelectedTicketId(null)}
                      className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00] hover:underline"
                    >
                      Voltar para lista
                    </button>
                  )}
                </div>

                <div className="divide-y divide-white/5">
                  {isLoadingTickets ? (
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#ff6a00]" />
                    </div>
                  ) : selectedTicketId ? (
                    <div className="flex flex-col h-[500px]">
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {isLoadingMessages ? (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-[#ff6a00]" />
                          </div>
                        ) : ticketMessages.length > 0 ? (
                          ticketMessages.map((m: any) => (
                            <div key={m.id} className={`flex flex-col ${m.sender_type === 'student' ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm break-words ${
                                m.sender_type === 'student' 
                                  ? 'bg-[#ff6a00] text-black font-medium rounded-tr-none' 
                                  : 'bg-white/10 text-white rounded-tl-none'
                              }`}>
                                {m.message}
                              </div>
                              <span className="mt-1 text-[9px] text-white/20 uppercase font-bold">
                                {new Date(m.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-10 text-white/20 uppercase text-[10px] font-bold tracking-widest">
                            Nenhuma mensagem neste chamado.
                          </div>
                        )}
                      </div>
                      <div className="p-4 bg-white/5 border-t border-white/5">
                        <form onSubmit={handleSendReply} className="relative flex items-center">
                          <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Responda aqui..."
                            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-12 text-sm outline-none transition focus:border-[#ff6a00]/50"
                          />
                          <button 
                            type="submit" 
                            disabled={!replyText.trim() || isSendingReply}
                            className="absolute right-1.5 grid h-8 w-8 place-items-center rounded-lg bg-[#ff6a00] text-black transition hover:scale-105 active:scale-95 disabled:opacity-50"
                          >
                            {isSendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : myTickets.length > 0 ? (
                    myTickets.map((t) => (
                      <div 
                        key={t.id} 
                        onClick={() => setSelectedTicketId(t.id)}
                        className="group flex flex-wrap items-center justify-between gap-4 p-6 transition-colors hover:bg-white/[0.03] cursor-pointer"
                      >
                        <div className="flex items-start gap-4">
                          <div className={`mt-1 grid h-10 w-10 place-items-center rounded-xl bg-white/5 transition group-hover:bg-white/10 ${
                            t.status === "resolved" ? "text-emerald-500" : "text-[#ff6a00]"
                          }`}>
                            {t.status === "resolved" ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[10px] font-bold text-[#ff6a00] uppercase tracking-widest">{t.id.slice(0, 8)}</span>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">{t.category}</span>
                            </div>
                            <h5 className="mt-1 font-bold text-white group-hover:text-[#ff6a00] transition break-words">{t.subject}</h5>
                            <div className="mt-2 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/30">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
                              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {t.status === 'resolved' ? 'Finalizado' : 'Aguardando'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                              t.status === 'resolved' ? 'text-emerald-500' : 'text-[#ff6a00]'
                            }`}>
                              {t.status === 'resolved' ? 'Resolvido' : 'Em Aberto'}
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-white/10 transition group-hover:translate-x-1 group-hover:text-white/40" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center">
                      <div className="mb-4 rounded-full bg-white/5 p-4">
                        <TicketIcon className="h-8 w-8 text-white/20" />
                      </div>
                      <h5 className="text-sm font-bold text-white/40 uppercase tracking-widest">Nenhum chamado aberto</h5>
                      <p className="mt-2 text-xs text-white/20">Seus chamados e respostas aparecerão aqui.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar Context */}
        <aside className="space-y-8">
          {/* FAQ / Fast Support */}
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-[#ff6a00]">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h4 className="font-display text-lg font-bold text-white uppercase tracking-wide">Dúvidas Rápidas</h4>
            </div>
            
            <div className="grid gap-3">
              {[
                "Onde estão meus cursos?",
                "Como baixar E-books?",
                "Como instalar o App (PWA)",
                "Esqueci minha senha",
                "Receitas Espetinho na Veia"
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setActiveTab("chat");
                    send(q);
                  }}
                  className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left transition hover:border-[#ff6a00]/30 hover:bg-[#ff6a00]/5"
                >
                  <span className="text-sm font-medium text-white/60 group-hover:text-white transition whitespace-normal">
                    {q}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/10 group-hover:text-[#ff6a00] transition" />
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-white/20 font-medium italic">
              "A dúvida de um é o sucesso de todos."
            </p>
          </section>

          {/* Social / Contact Info */}
          <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3 rounded-xl bg-[#ff6a00]/10 p-4">
              <AlertCircle className="h-5 w-5 text-[#ff6a00]" />
              <div className="text-xs font-bold uppercase tracking-widest text-[#ff6a00] leading-snug">
                Horário de Atendimento Humano
              </div>
            </div>
            <div className="space-y-3 px-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-white/30">Segunda à Sexta</span>
                <span className="text-white/60">09h às 18h</span>
              </div>
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-white/30">Sábado</span>
                <span className="text-white/60">09h às 12h</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
