import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  Flame,
  FolderOpen,
  Layers,
  MessageCircle,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Ticket as TicketIcon,
  X,
} from "lucide-react";
import { getChatbotResponse, getKnowledgeMenu, submitKnowledgeFeedback } from "@/lib/chatbot.functions";
import type { KnowledgeMenuCategory } from "@/lib/chatbot.functions";
import { landingFaqs } from "@/lib/landing-faq";

type Msg = {
  role: "user" | "ai";
  text: string;
  knowledgeId?: string | null;
  feedbackGiven?: boolean;
  needsHuman?: boolean;
};

/**
 * Widget interativo da assistente (FAQ + chat).
 * Carregado sob demanda (lazy) porque fica abaixo da dobra: o bundle inicial
 * da landing não precisa carregar o chat nem o cliente das server functions.
 */
export default function BrasaChat() {
  const getChatbot = useServerFn(getChatbotResponse);
  const sendFeedback = useServerFn(submitKnowledgeFeedback);
  const fetchMenu = useServerFn(getKnowledgeMenu);

  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", text: "Olá! 👋 Eu sou a Brasa, sua assistente. Escolha uma pergunta ao lado ou escreva sua dúvida que eu te respondo na hora." },
  ]);
  const [typing, setTyping] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [activeKnowledgeId, setActiveKnowledgeId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<KnowledgeMenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (!menuOpen || menuData.length > 0) return;
    let cancelled = false;
    setMenuLoading(true);
    fetchMenu({ data: undefined })
      .then((res) => {
        if (!cancelled) setMenuData(res.categories);
      })
      .catch((err) => {
        console.error("Erro ao carregar categorias:", err);
      })
      .finally(() => {
        if (!cancelled) setMenuLoading(false);
      });
    return () => { cancelled = true; };
  }, [menuOpen, menuData.length, fetchMenu]);

  const handleFeedback = async (msgIndex: number, knowledgeId: string, isPositive: boolean) => {
    try {
      await sendFeedback({ data: { knowledgeId, isPositive } });
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, feedbackGiven: true } : m)));
      toast.success(isPositive ? "Obrigado!" : "Entendido. Vamos melhorar.");
    } catch (error) {
      console.error("Erro ao enviar feedback:", error);
    }
  };

  const ask = async (text: string, index?: number) => {
    if (typing || !text.trim()) return;

    if (index !== undefined) setActiveIdx(index);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    try {
      const result = await getChatbot({
        data: {
          message: text,
          context: {
            url: window.location.href,
            path: window.location.pathname,
          },
        },
      });

      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: result.answer,
          knowledgeId: result.knowledgeId,
          needsHuman: result.needsHuman,
        },
      ]);
    } catch (error) {
      console.error("Erro no chatbot:", error);
      setMessages((m) => [
        ...m,
        { role: "ai", text: "Desculpe, tive um problema ao processar sua dúvida. Tente novamente em instantes." },
      ]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-6">
      {/* Left: questions */}
      <div className="rounded-2xl border border-border bg-card/60 p-3 backdrop-blur sm:p-4">
        <div className="mb-3 flex items-center gap-2 px-2 pt-1 text-xs uppercase tracking-widest text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5 text-[color:var(--gold)]" />
          Perguntas
        </div>
        <ul className="space-y-2">
          {landingFaqs.map((f, i) => {
            const active = activeIdx === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => ask(f.q, i)}
                  disabled={typing}
                  className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition disabled:opacity-70 ${
                    active
                      ? "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 text-foreground"
                      : "border-border bg-background/40 hover:border-[color:var(--gold)]/40 hover:bg-background/70"
                  }`}
                >
                  <span className="font-medium">{f.q}</span>
                  <ArrowRight className={`h-4 w-4 shrink-0 transition ${active ? "text-[color:var(--gold)]" : "text-muted-foreground group-hover:text-[color:var(--gold)]"}`} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right: chat */}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-fire shadow-fire">
                <Flame className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-400" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Brasa • Assistente</div>
              <div className="text-xs text-muted-foreground">Online • responde na hora</div>
            </div>
          </div>
          <div className="hidden items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] uppercase tracking-widest text-muted-foreground sm:flex">
            <Sparkles className="h-3 w-3 text-[color:var(--gold)]" /> IA
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
          {messages.map((m, i) =>
            m.role === "ai" ? (
              <div key={i} className="flex flex-col items-start gap-1">
                <div className="flex items-end gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fire">
                    <Flame className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-background/70 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                    {m.text}
                  </div>
                </div>
                {m.knowledgeId && !m.feedbackGiven && (
                  <div className="ml-9 mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Ajudou?</span>
                    <button onClick={() => handleFeedback(i, m.knowledgeId!, true)} className="text-muted-foreground hover:text-emerald-500 transition-colors"><ThumbsUp className="h-3 w-3" /></button>
                    <button onClick={() => handleFeedback(i, m.knowledgeId!, false)} className="text-muted-foreground hover:text-fire transition-colors"><ThumbsDown className="h-3 w-3" /></button>
                  </div>
                )}
                {m.needsHuman && (
                  <div className="ml-9 mt-1">
                    <Link to="/login" className="flex items-center gap-1.5 rounded-lg bg-fire/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fire hover:bg-fire/20 transition">
                      <TicketIcon className="h-3 w-3" /> Falar com suporte
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-fire px-4 py-2.5 text-sm leading-relaxed text-white shadow-fire">
                  {m.text}
                </div>
              </div>
            )
          )}
          {typing && (
            <div className="flex items-end gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fire">
                <Flame className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-border bg-background/70 px-4 py-3">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--gold)] [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--gold)] [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--gold)]" />
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 bg-background/40 px-4 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="relative flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escreva sua dúvida..."
              className="w-full rounded-full border border-border bg-background/60 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--gold)]/50 focus:bg-background/80"
            />
            <button
              type="submit"
              disabled={typing || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fire text-white shadow-fire transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            Suporte instantâneo via Inteligência Brasa
          </p>
        </div>
      </div>
    </div>
  );
}
