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


export const getChatbotResponse = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    message: z.string(),
    context: z.object({
      url: z.string().optional(),
      path: z.string().optional()
    }).optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { message, context: requestContext } = data;
    
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

    for (const item of (knowledge as KnowledgeItem[])) {
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
