import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Item {
  id: string;
  title: string;
  file_name: string | null;
  file_size: number | null;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ModuleMaterialsList({
  moduleId,
  lessonId = null,
}: {
  moduleId?: string;
  lessonId?: string | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let query = supabase
        .from("course_module_materials" as any)
        .select("id, title, file_name, file_size")
        .eq("is_active", true);
      if (lessonId) query = query.eq("lesson_id", lessonId);
      else if (moduleId) query = query.eq("module_id", moduleId).is("lesson_id", null);
      const { data } = await query.order("order_index");
      if (active) setItems(((data as any) || []) as Item[]);
    })();
    return () => {
      active = false;
    };
  }, [moduleId, lessonId]);

  if (items.length === 0) return null;

  async function handleDownload(item: Item) {
    try {
      setDownloadingId(item.id);
      const { getModuleMaterialDownloadUrl } = await import("@/lib/module-materials.functions");
      const res: any = await getModuleMaterialDownloadUrl({ data: { materialId: item.id } });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível baixar o material.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-1 px-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {lessonId ? "Materiais da aula" : "Materiais do módulo"}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => handleDownload(item)}
              disabled={downloadingId === item.id}
              className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left text-xs transition hover:bg-white/10 disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-fire" />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatSize(item.file_size)}
              </span>
              {downloadingId === item.id ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
