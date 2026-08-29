import { useState, useEffect, useRef } from "react";
import { Loader2, Paperclip, Trash2, Download, FileText, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "course-assets";
const MAX_BYTES = 50 * 1024 * 1024; // limite do Storage do projeto

interface MaterialRow {
  id: string;
  title: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  order_index: number;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ModuleMaterialsManager({
  moduleId,
  courseId,
  isPersisted,
}: {
  moduleId: string;
  courseId: string;
  isPersisted: boolean;
}) {
  const [items, setItems] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPersisted) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, isPersisted]);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("course_module_materials" as any)
        .select("id, title, file_url, file_name, file_size, mime_type, order_index")
        .eq("module_id", moduleId)
        .order("order_index");
      if (error) throw error;
      setItems((data as any) || []);
    } catch (e: any) {
      toast.error("Erro ao carregar anexos: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error("O arquivo deve ter no máximo 50MB.");
      return;
    }

    try {
      setUploading(true);
      const ext = file.name.split(".").pop() || "bin";
      const path = `module-materials/${moduleId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || undefined,
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("course_module_materials" as any)
        .insert({
          module_id: moduleId,
          course_id: courseId,
          title: title.trim() || file.name,
          file_url: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          order_index: items.length,
        } as any);
      if (insErr) throw insErr;

      setTitle("");
      toast.success("Anexo enviado!");
      load();
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: MaterialRow) {
    if (!confirm(`Excluir o anexo "${item.title}"?`)) return;
    try {
      const { error } = await supabase
        .from("course_module_materials" as any)
        .delete()
        .eq("id", item.id);
      if (error) throw error;
      if (!/^https?:\/\//i.test(item.file_url)) {
        await supabase.storage.from(BUCKET).remove([item.file_url]);
      }
      toast.success("Anexo excluído");
      load();
    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message);
    }
  }

  async function handleDownload(item: MaterialRow) {
    try {
      const { getModuleMaterialDownloadUrl } = await import("@/lib/module-materials.functions");
      const res: any = await getModuleMaterialDownloadUrl({ data: { materialId: item.id } });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível baixar o arquivo.");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-[#ff6a00]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Materiais do módulo (PDF, DOCX, ZIP…)
        </span>
      </div>

      {!isPersisted ? (
        <p className="text-xs text-white/40">
          Salve o módulo primeiro para poder anexar arquivos.
        </p>
      ) : (
        <>
          {loading ? (
            <div className="py-3 text-center text-xs text-white/40">Carregando anexos...</div>
          ) : items.length === 0 ? (
            <p className="text-xs text-white/40">Nenhum anexo neste módulo ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-white/5 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-white/30" />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{item.title}</p>
                      <p className="truncate text-[10px] text-white/40">
                        {item.file_name} {formatSize(item.file_size) && `• ${formatSize(item.file_size)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      className="p-2 text-white/40 hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="p-2 text-white/40 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do anexo (opcional)"
              className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm outline-none focus:border-[#ff6a00]"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#ff6a00] px-4 text-xs font-bold text-black transition-colors hover:bg-[#ff8c33]">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Anexar
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,image/*"
                onChange={handleUpload}
              />
            </label>
          </div>
          <p className="text-[10px] text-white/30">
            Tamanho máximo por arquivo: 50MB (suficiente para e-books extensos em PDF).
          </p>
        </>
      )}
    </div>
  );
}
