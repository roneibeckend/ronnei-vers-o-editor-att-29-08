import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import * as pdf from "pdf-parse";
import * as mammoth from "mammoth";

// Using require for pdf-parse if default import fails or to handle type mismatch
// @ts-ignore
let pdfParser: any;
try {
  // @ts-ignore
  pdfParser = pdf.default || pdf;
} catch (e) {
  console.error("Critical: Failed to initialize pdf-parse", e);
}

interface ProcessedSection {
  title: string;
  content: string;
  order_index: number;
}

async function processDocxContent(buffer: Buffer): Promise<ProcessedSection[]> {
  try {
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;
    
    if (!html || html.trim().length === 0) {
      throw new Error("O arquivo Word parece estar vazio ou não pôde ser lido.");
    }

    // Split by common chapter/section patterns in HTML
    // Mammoth generates <h2> or <h1> for titles usually, or we can look for specific text
    let sections = html.split(/<h[1-3][^>]*>/i);
    
    // If no headers, try to split by bold text or common keywords
    if (sections.length <= 1) {
      sections = html.split(/<p><strong>(?=(?:CAPÍTULO|MÓDULO|PARTE|CHAPTER|MODULE|SECTION)\s+\d+)/i);
    }

    return sections
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 20)
      .slice(0, 100)
      .map((content: string, index: number) => {
        // Clean up HTML tags for the title
        const titleMatch = content.match(/^([^<]+)/);
        const title = titleMatch ? titleMatch[1].trim() : `Seção ${index + 1}`;
        const body = content.replace(/^[^<]+/, '').trim();
        
        return {
          title: title.length < 100 ? title : `Capítulo ${index + 1}`,
          content: body || content, // Preserve HTML from mammoth
          order_index: index
        };
      });
  } catch (error: any) {
    console.error("DOCX processing error:", error);
    throw new Error("Falha ao processar o arquivo Word. Verifique se o arquivo não está corrompido.");
  }
}

async function processPdfContent(buffer: Buffer): Promise<ProcessedSection[]> {
  let rawText = "";
  try {
    if (!pdfParser) {
      throw new Error("O mecanismo de processamento de PDF não foi inicializado corretamente.");
    }
    
    const parsePromise = pdfParser(buffer);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("TIMEOUT_PDF_INFRA")), 45000)
    );

    const data = await Promise.race([parsePromise, timeoutPromise]) as any;
    rawText = data?.text || "";
    
    if (rawText.includes("<!doctype html>") || rawText.includes("<html") || rawText.includes("This page didn't load")) {
      throw new Error("INFRA_ERROR_HTML");
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("O PDF parece estar vazio ou não pôde ser lido.");
    }
    
    const sections = rawText.split(/\n(?=(?:CAPÍTULO|MÓDULO|PARTE|CHAPTER|MODULE|SECTION)\s+\d+)/i);
    
    return sections
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 20) 
      .slice(0, 100)
      .map((content: string, index: number) => {
        const lines = content.split('\n');
        const title = lines[0].length < 100 ? lines[0].trim() : `Seção ${index + 1}`;
        const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : content;
        
        return {
          title: title || `Capítulo ${index + 1}`,
          content: body.replace(/\n/g, '<br />'),
          order_index: index
        };
      });
  } catch (error: any) {
    console.error("Detailed PDF processing error:", error);

    if (error.message === "TIMEOUT_PDF_INFRA") {
       throw new Error("O servidor demorou muito para processar este PDF. Tente um arquivo menor ou com menos imagens.");
    }

    if (error.message === "INFRA_ERROR_HTML" || error.message?.includes("<!doctype html>") || error.message?.includes("This page didn't load")) {
       throw new Error("Ocorreu uma instabilidade na infraestrutura ao tentar processar o arquivo. Tente dividir o arquivo.");
    }

    if (error.message && (error.message.includes("PDF") || error.message.includes("mecanismo"))) {
      throw error;
    }
    
    throw new Error("Falha ao processar o arquivo PDF. Verifique se o arquivo não está corrompido ou protegido por senha.");
  }
}

export const importEbookFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    ebook_id: z.string().uuid(),
    file_base64: z.string(),
    file_name: z.string().optional(),
    mime_type: z.string().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const startTime = Date.now();
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      throw new Error("Acesso negado: permissão de administrador necessária.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      console.log(`[importEbookFromFile] Iniciando processamento de ${data.file_name || 'arquivo'} (${data.file_base64.length} bytes base64)`);
      
      if (data.file_base64.length > 85 * 1024 * 1024) {
        throw new Error("LIMITE_EXCEDIDO: O arquivo excede o limite de 60MB para processamento automático.");
      }

      const base64Data = data.file_base64.split(',')[1] || data.file_base64;
      const buffer = Buffer.from(base64Data, 'base64');
      
      const fileName = data.file_name?.toLowerCase() || '';
      const mimeType = data.mime_type?.toLowerCase() || '';
      
      let processedSections: ProcessedSection[] = [];
      
      if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
        processedSections = await processPdfContent(buffer);
      } else if (mimeType.includes('word') || mimeType.includes('officedocument') || fileName.endsWith('.docx')) {
        processedSections = await processDocxContent(buffer);
      } else {
        throw new Error("Formato de arquivo não suportado. Use PDF ou DOCX.");
      }

      console.log(`[importEbookFromFile] Conteúdo extraído: ${processedSections.length} seções em ${Date.now() - startTime}ms`);

      if (processedSections.length === 0) {
        throw new Error("Nenhum conteúdo estruturado encontrado no arquivo.");
      }

      const { data: module, error: moduleError } = await supabaseAdmin
        .from('ebook_modules')
        .insert({
          ebook_id: data.ebook_id,
          title: "Conteúdo Importado",
          order_index: 0
        })
        .select()
        .maybeSingle();

      if (moduleError || !module) throw new Error("Erro ao criar módulo: " + (moduleError?.message || "Módulo não retornado após inserção"));

      const chaptersToInsert = processedSections.map((section: ProcessedSection) => ({
        ebook_id: data.ebook_id,
        module_id: module.id,
        title: section.title,
        content: sanitizeRichHtml(section.content),
        order_index: section.order_index
      }));

      // Inserção em lotes (batching) com verificação de erro individual para maior resiliência
      const chunkSize = 15; // Reduzido ligeiramente para evitar sobrecarga de payload
      for (let i = 0; i < chaptersToInsert.length; i += chunkSize) {
        const chunk = chaptersToInsert.slice(i, i + chunkSize);
        console.log(`[importEbookFromFile] Inserindo lote de capítulos ${i + 1} até ${Math.min(i + chunkSize, chaptersToInsert.length)}`);
        
        const { error: chapterError } = await supabaseAdmin
          .from('ebook_chapters')
          .insert(chunk);
          
        if (chapterError) {
          console.error(`[importEbookFromFile] Erro no lote ${i}:`, chapterError);
          throw new Error("Erro ao inserir capítulos: " + chapterError.message);
        }
      }

      const duration = Date.now() - startTime;
      return { 
        success: true, 
        chapters_count: processedSections.length,
        duration_ms: duration
      };
    } catch (err: any) {
      console.error("Server function error [importEbookFromFile]:", err);
      
      const errorMessage = err.message || "";
      
      // If it's a DOCX error, provide a specific prefix to differentiate from generic PDF infra errors
      if (data.mime_type?.includes('officedocument') || data.file_name?.toLowerCase().endsWith('.docx')) {
        if (errorMessage.includes("<!doctype html>") || errorMessage.includes("This page didn't load")) {
          throw new Error("DOCX_INFRA_ERROR: O servidor encontrou uma instabilidade ao processar o Word. Tente simplificar o documento ou dividi-lo.");
        }
      }

      if (errorMessage.includes("<!doctype html>") || errorMessage.includes("This page didn't load") || errorMessage.includes("INFRA_ERROR_HTML")) {
        throw new Error("Ocorreu uma instabilidade na infraestrutura ao tentar processar o arquivo. Isso pode ser causado por um arquivo muito complexo ou denso (muitas imagens/gráficos). Tente simplificar o conteúdo ou dividir o arquivo em partes ainda menores.");
      }

      const cleanMessage = errorMessage;
      throw new Error(cleanMessage || "Erro interno no servidor");
    }
  });

// Keep alias for backward compatibility
export const importEbookFromPdf = importEbookFromFile;