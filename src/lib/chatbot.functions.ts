import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Definindo tipos para evitar erros de 'never'
interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  questions: string[] | null;
  keywords: string[] | null;
  status: string;
}

export type KnowledgeMenuCategory = {
  name: string;
  items: { id: string; title: string }[];
};

export type ChatSuggestion = { label: string; to?: string; ask?: string };

/**
 * Categorias públicas: são as únicas usadas pelo chat da landing.
 * Nenhuma delas depende de dados de alunos, matrículas, pagamentos,
 * chamados, afiliados ou qualquer informação pessoal — apenas conteúdo
 * público de conhecimento (espetinhos, negócio, produto e plataforma).
 */
const PUBLIC_CATEGORIES = new Set([
  "DO ZERO AOS 10K",
  "RONNEI NA VEIA",
  "RECEITAS",
  "CARNES",
  "TEMPEROS",
  "PRODUCAO",
  "PRODUÇÃO",
  "CMV E PRECIFICACAO",
  "PRECO E LUCRO",
  "EQUIPAMENTOS",
  "CONSERVACAO",
  "CONSERVAÇÃO",
  "SEGURANCA ALIMENTAR",
  "SEGURANÇA ALIMENTAR",
  "DELIVERY",
  "VENDAS",
  "GESTAO",
  "GESTAO DO NEGOCIO",
  "GESTÃO DO NEGÓCIO",
  "CURSOS",
  "CURSO E CONTEUDO",
  "EBOOKS",
  "MATERIAIS",
  "GARANTIA",
  "COMPRAS",
  "PAGAMENTOS",
  "PLATAFORMA",
  "CERTIFICADOS",
  "PWA",
  "CONTA",
  "SUPORTE",
  "AFILIADOS",
]);

const isPublicCategory = (category?: string | null) =>
  PUBLIC_CATEGORIES.has((category || "").trim().toUpperCase());

/** Chamadas comerciais naturais, escolhidas pelo tema da resposta. */
const COMMERCIAL_HOOKS: { match: RegExp; line: string }[] = [
  { match: /(preco|preço|cmv|lucro|margem|custo|calcul)/i, line: "Esse cálculo está detalhado dentro do treinamento Do Zero aos 10K — e você também recebe planilhas prontas para fazer essa conta." },
  { match: /(vend|ifood|whatsapp|delivery|client|marketing|instagram)/i, line: "Essa estratégia é ensinada passo a passo dentro do método Ronnei na Veia." },
  { match: /(carne|tempero|receita|marinada|corte|brasa|assar)/i, line: "As receitas, cortes e temperos completos estão dentro do treinamento — posso te mostrar tudo que está incluso." },
  { match: /(equipamento|conserva|higien|producao|produção|estoque|gest)/i, line: "Tem um passo a passo completo disso no treinamento, com checklists e planilhas prontas." },
];

const commercialLineFor = (text: string): string | null => {
  for (const hook of COMMERCIAL_HOOKS) {
    if (hook.match.test(text)) return hook.line;
  }
  return null;
};

const LANDING_SUGGESTIONS: ChatSuggestion[] = [
  { label: "Ver conteúdo do treinamento", ask: "O que vem no treinamento Do Zero aos 10K?" },
  { label: "Ver receitas", ask: "Quais receitas de espetinho estão incluídas?" },
  { label: "Ver garantia", ask: "Como funciona a garantia?" },
  { label: "Ver formas de pagamento", ask: "Quais são as formas de pagamento?" },
  { label: "Falar com suporte", to: "/login" },
];

export const getChatbotResponse = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    message: z.string(),
    surface: z.enum(["app", "landing"]).optional(),
    context: z.object({
      url: z.string().optional(),
      path: z.string().optional()
    }).optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { message, context: requestContext } = data;
    const isLanding = data.surface === "landing";
    
    // Importação dinâmica do supabaseAdmin para evitar problemas de serialização e bundling
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Normalização aprimorada: minúsculas, remover acentos, pontuação, espaços extras
    const normalize = (str: string) => {
      if (!str) return "";
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/gi, " ") // Substitui pontuação por espaço para não colar palavras
        .replace(/\s+/g, " ") // Remove espaços duplos
        .trim();
    };

    // Tokenização básica para matching de palavras
    const tokenize = (str: string) => {
      return normalize(str).split(" ").filter(word => word.length > 2);
    };

    const query = normalize(message);
    const queryTokens = tokenize(message);

    // 1. Buscar base de conhecimento
    const { data: knowledge, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("*")
      .eq("status", "active");

    if (error || !knowledge) {
      console.error("[Chatbot] Erro ao buscar knowledge_base:", error);
      return {
        answer: "Desculpe, tive um problema ao acessar minha base de conhecimento. Tente novamente mais tarde.",
        confidence: 0,
        needsHuman: true
      };
    }

    // 2. Lógica de Matching em Camadas
    let bestMatch: KnowledgeItem | null = null;
    let maxScore = 0;

    const pool = isLanding
      ? (knowledge as KnowledgeItem[]).filter((k) => isPublicCategory(k.category))
      : (knowledge as KnowledgeItem[]);

    for (const item of pool) {
      let score = 0;
      
      const titleNormalized = normalize(item.title);
      const titleTokens = tokenize(item.title);
      const variations = (item.questions || []).map(normalize);
      const keywords = (item.keywords || []).map(normalize);

      // Camada 1: Correspondência Exata em variações ou título (Boost Máximo)
      if (variations.some(v => v === query) || titleNormalized === query) {
        score += 2.0; // Garantir match total
      }

      // Camada 2: Contenção Total (String Contém)
      if (variations.some(v => query.includes(v)) || query.includes(titleNormalized)) {
        score += 1.0;
      }

      // Camada 3: Título contém query ou query contém título tokens
      const matchesTitleToken = titleTokens.some(t => queryTokens.includes(t));
      if (matchesTitleToken) score += 0.5;

      // Camada 4: Palavras-chave
      keywords.forEach(kw => {
        if (query.includes(kw)) score += 0.4;
      });

      // Camada 5: Contexto da Rota
      if (requestContext?.path) {
        const path = requestContext.path.toLowerCase();
        if (item.category === 'PWA' && path === '/app') score += 0.2;
        if (item.category === 'CURSOS' && path.includes('/cursos')) score += 0.2;
        if (item.category === 'EBOOKS' && path.includes('/ebooks')) score += 0.2;
        if (item.category === 'MATERIAIS' && path.includes('/materiais')) score += 0.2;
      }

      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    // Normalizar score (cap at 1.0 para a UI)
    const confidence = Math.min(maxScore / 2.0, 1.0);

    // 3. Resposta Baseada em Confiança
    // Threshold ajustado para 0.25 para capturar intenções parciais
    if (bestMatch && maxScore >= 0.4) {
      return {
        answer: bestMatch.content,
        confidence,
        knowledgeId: bestMatch.id,
        needsHuman: maxScore < 0.7 // Precisa de ajuda se não houver match forte (> 0.7 real score)
      };
    }

    // 4. Fallback: Gravar pergunta não respondida via RPC SECURITY DEFINER
    try {
      await supabaseAdmin.rpc("log_unhandled_question_v2", {
        p_message: message,
        p_confidence: confidence,
        p_context: requestContext || {}
      });
    } catch (dbError) {
      console.error("[Chatbot] Erro ao registrar pergunta não respondida:", dbError);
    }

    return {
      answer: "Ainda estou aprendendo sobre isso e não tenho uma resposta exata agora. Mas não se preocupe! Você pode abrir um chamado na aba 'Meus Chamados' ou tentar perguntar com outras palavras.",
      confidence,
      needsHuman: true
    };
  });

export const submitKnowledgeFeedback = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    knowledgeId: z.string(),
    isPositive: z.boolean()
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("knowledge_feedback")
      .insert({
        knowledge_id: data.knowledgeId,
        is_positive: data.isPositive
      });
    
    if (error) {
      console.error("[Chatbot] Erro ao enviar feedback:", error);
      throw error;
    }
    return { success: true };
  });

export const getKnowledgeMenu = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("id, title, category")
      .eq("status", "active")
      .order("category", { ascending: true })
      .order("title", { ascending: true });

    if (error || !data) {
      console.error("[Chatbot] Erro ao buscar menu de categorias:", error);
      return { categories: [] as KnowledgeMenuCategory[] };
    }

    const grouped = new Map<string, { id: string; title: string }[]>();
    for (const item of data as { id: string; title: string; category: string | null }[]) {
      const category = item.category?.trim() || "Geral";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category)!.push({ id: item.id, title: item.title });
    }

    return {
      categories: Array.from(grouped.entries()).map(([name, items]) => ({
        name,
        items,
      })) as KnowledgeMenuCategory[],
    };
  });
