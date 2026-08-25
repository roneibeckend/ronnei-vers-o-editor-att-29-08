import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Download, 
  Image as ImageIcon, 
  Video, 
  FileText,
  Search,
  Loader2
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/afiliados/materiais")({
  component: AffiliateMaterialsPage,
});

function AffiliateMaterialsPage() {
  const [search, setSearch] = useState("");

  const { data: materials, isLoading } = useQuery({
    queryKey: ["affiliate-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_materials" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as any[];
    }
  });

  const filtered = materials?.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Materiais de Divulgação</h2>
          <p className="text-sm text-muted-foreground">Artes, vídeos e textos prontos para você usar em suas campanhas.</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/20" />
          <input 
            placeholder="Buscar material..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 py-2 pl-10 pr-4 rounded-lg text-sm outline-none focus:border-fire/50" 
          />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered?.map((material) => (
          <div key={material.id} className="glass rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden group flex flex-col">
            <div className="aspect-video bg-white/5 relative">
              {material.thumbnail_url ? (
                <img src={material.thumbnail_url} alt={material.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/10">
                  {material.category === 'banner' && <ImageIcon className="w-12 h-12" />}
                  {material.category === 'video' && <Video className="w-12 h-12" />}
                  {material.category === 'copy' && <FileText className="w-12 h-12" />}
                </div>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(material.file_url, { cache: "no-store" });
                      await downloadFromResponse(
                        res,
                        material.file_url.split("/").pop() || material.title
                      );
                    } catch {
                      openExternal(material.file_url);
                    }
                  }}
                  aria-label={`Baixar ${material.title}`}
                  className="bg-fire text-white p-3 rounded-full hover:scale-110 transition-transform"
                >
                  <Download className="w-5 h-5" />
                </button>

              </div>
            </div>
            <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-fire mb-1 truncate">{material.category}</div>
              <h4 className="font-bold text-sm mb-1 truncate leading-tight">{material.title}</h4>
              {material.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-auto pt-2">{material.description}</p>
              )}
            </div>
          </div>
        ))}

        {filtered?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground italic">
            Nenhum material de apoio disponível no momento.
          </div>
        )}
      </div>
    </div>
  );
}