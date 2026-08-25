import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Layout, Package, Share2, ExternalLink, Loader2, Presentation } from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { materials as staticMaterials } from "@/lib/platform-data";
import { generateCostSpreadsheet, generatePricingCalculator, generateInventoryControl } from "@/lib/materials-generator";
import { generateShoppingListPDF, generateEquipmentChecklistPDF } from "@/lib/pdf-generator";
import { generateEditableMenuPPTX } from "@/lib/pptx-generator";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadFromResponse, openExternal } from "@/lib/download";



export const Route = createFileRoute("/app/materiais")({
  head: () => ({ meta: [{ title: "Planilhas e materiais — Ronnei na Veia" }] }),
  component: MaterialsPage,
});

function MaterialsPage() {
  const { data, isLoading, error } = useQuery({

    queryKey: ["platform-materials"],
    queryFn: async () => {
      const { data: materials, error } = await supabase
        .from("platform_materials")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return materials || [];
    },
  });

  if (error) {
    console.error("Error fetching materials:", error);
  }

  const dynamicMaterials = (data as any[]) || [];
  // Os materiais agora são gerenciados inteiramente pelo banco de dados.
  // Mantemos staticMaterials apenas como um fallback de UI se necessário, 
  // mas a lógica de download agora prioriza o que vem do banco.
  const materials = dynamicMaterials.length > 0 ? dynamicMaterials : staticMaterials;

  const handleDownload = async (materialId: string, title: string, fileUrl?: string, externalUrl?: string) => {
    if (externalUrl) {
      openExternal(externalUrl);
      return;
    }

    if (fileUrl) {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        let accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          const { data: refreshed, error: refreshError } =
            await supabase.auth.refreshSession();

          if (refreshError || !refreshed.session?.access_token) {
            throw new Error("Sua sessão expirou. Entre novamente.");
          }

          accessToken = refreshed.session.access_token;
        }

        toast.loading(`Baixando "${title}"...`, { id: `dl-${materialId}` });

        const body = new FormData();
        body.set("materialId", materialId);
        body.set("accessToken", accessToken);

        // Busca via fetch + blob: o PWA nunca navega para fora,
        // então o cliente continua dentro do app após baixar.
        const response = await fetch("/api/material-download", {
          method: "POST",
          body,
        });

        await downloadFromResponse(response, `${title}`.trim() || "material");

        toast.success(`"${title}" baixado.`, { id: `dl-${materialId}` });
      } catch (err: any) {
        console.error("[materiais] falha ao iniciar download:", err);

        toast.error(
          err?.message || "Não foi possível iniciar o download.",
          { id: `dl-${materialId}` }
        );
      }

      return;
    }




    try {
      // Verifica se o ID ou título corresponde a um gerador local conhecido
      const isKnownGenerator = [
        "m1", "Planilha de custos",
        "m2", "Calculadora de preço",
        "m3", "Controle de estoque",
        "m4", "Lista de compras semanal",
        "m5", "Checklist de equipamentos",
        "m6", "Cardápio editável"
      ].includes(materialId) || [
        "Planilha de custos",
        "Calculadora de preço",
        "Controle de estoque",
        "Lista de compras semanal",
        "Checklist de equipamentos",
        "Cardápio editável"
      ].includes(title);

      if (isKnownGenerator) {
        switch (materialId) {
          case "m1":
          case (materials.find(m => m.title === "Planilha de custos")?.id):
            await generateCostSpreadsheet();
            break;
          case "m2":
          case (materials.find(m => m.title === "Calculadora de preço")?.id):
            await generatePricingCalculator();
            break;
          case "m3":
          case (materials.find(m => m.title === "Controle de estoque")?.id):
            await generateInventoryControl();
            break;
          case "m4":
          case (materials.find(m => m.title === "Lista de compras semanal")?.id):
            generateShoppingListPDF();
            break;
          case "m5":
          case (materials.find(m => m.title === "Checklist de equipamentos")?.id):
            generateEquipmentChecklistPDF();
            break;
          case "m6":
          case (materials.find(m => m.title === "Cardápio editável")?.id):
            await generateEditableMenuPPTX();
            break;
        }
      } else if (!fileUrl && !externalUrl) {
        toast.info(`O material "${title}" ainda não está disponível para download.`);
        return;
      }
      if (isKnownGenerator) {
        toast.success(`Download de "${title}" iniciado com sucesso!`);
      }
    } catch (error) {
      console.error("Erro no download:", error);
      toast.error("Ocorreu um erro ao gerar o arquivo. Tente novamente.");
    }
  };

  const getIcon = (id: string, type: string, title?: string) => {
    if (["XLSX", "CSV", "ODS"].includes(type)) return <FileSpreadsheet className="h-6 w-6" />;
    if (type === "PDF") return <FileText className="h-6 w-6" />;
    if (type === "CANVA" || type === "PPTX") return <Presentation className="h-6 w-6" />;
    if (id === "m7" || title === "Artes para divulgação") return <Share2 className="h-6 w-6" />;
    return <Package className="h-6 w-6" />;
  };

  return (
    <div>
      <PageHeader 
        title="Planilhas e materiais" 
        subtitle="Materiais profissionais e funcionais para gestão completa do seu negócio de churrasco." 
      />
      
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-20 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : materials.map((m: any) => (
          <div key={m.id} className="glass card-tilt group flex flex-col rounded-2xl p-6 transition-all hover:border-fire/50 h-full">
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-fire/10 text-primary ring-1 ring-fire/20 transition-transform group-hover:scale-110">
                {getIcon(m.id, m.type, m.title)}
              </div>
              <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {m.type}
              </span>
            </div>
            
            <div className="mt-5 flex-grow">
              <h3 className="font-display text-xl font-bold text-white group-hover:text-primary transition-colors">
                {m.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                {m.description}
              </p>
            </div>

            <button 
              onClick={() => handleDownload(m.id, m.title, m.file_url, m.external_url)}
              className="btn-fire mt-auto w-full py-3 text-sm font-bold flex items-center justify-center gap-2 group/btn active:scale-[0.98] touch-action-manipulation"
            >
              <Download className="h-4 w-4 transition-transform group-hover/btn:-translate-y-0.5" /> 
              Baixar material
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
