import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "course-assets";

function resolveStoragePath(fileUrl: string): { bucket: string; path: string } {
  let bucket = BUCKET;
  let path = String(fileUrl);

  if (/^https?:\/\//i.test(path)) {
    let parsed: URL;
    try {
      parsed = new URL(path);
    } catch {
      throw new Error("URL do arquivo inválida.");
    }

    const markers = ["/storage/v1/object/public/", "/storage/v1/object/sign/"];
    let storagePath: string | null = null;

    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index !== -1) {
        storagePath = parsed.pathname.slice(index + marker.length);
        break;
      }
    }

    if (!storagePath) throw new Error("O arquivo não pertence ao Storage configurado.");

    storagePath = decodeURIComponent(storagePath);
    const slash = storagePath.indexOf("/");
    if (slash < 1) throw new Error("Caminho do Storage inválido.");

    bucket = storagePath.slice(0, slash);
    path = storagePath.slice(slash + 1);
  }

  if (!path) throw new Error("Caminho do arquivo não identificado.");
  return { bucket, path };
}

export const getModuleMaterialDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({ materialId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: material, error } = await supabaseAdmin
      .from("course_module_materials" as any)
      .select("id, module_id, file_url, file_name, is_active")
      .eq("id", data.materialId)
      .maybeSingle();

    if (error) throw new Error("Não foi possível localizar o material.");
    if (!material) throw new Error("Material não encontrado.");
    if (!(material as any).is_active) throw new Error("Material indisponível.");

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (!isAdmin) {
      const { data: mod } = await supabaseAdmin
        .from("course_modules")
        .select("course_id")
        .eq("id", (material as any).module_id)
        .maybeSingle();

      if (!mod) throw new Error("Módulo não encontrado.");

      const { data: course } = await supabaseAdmin
        .from("courses")
        .select("id, price, status")
        .eq("id", (mod as any).course_id)
        .maybeSingle();

      const isFreeCourse =
        !!course && Number((course as any).price || 0) === 0 && (course as any).status === "active";

      if (!isFreeCourse) {
        const { data: enrollment } = await supabaseAdmin
          .from("course_enrollments")
          .select("id")
          .eq("course_id", (mod as any).course_id)
          .eq("user_id", context.userId)
          .maybeSingle();

        if (!enrollment) throw new Error("Você não possui matrícula neste curso.");
      }
    }

    const { bucket, path } = resolveStoragePath((material as any).file_url);

    let downloadName =
      (material as any).file_name || path.split("/").pop() || `material-${data.materialId}`;
    downloadName = String(downloadName).replace(/[\r\n"]/g, "_").slice(0, 180);

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 5, { download: downloadName });

    if (signedError || !signed?.signedUrl) {
      throw new Error("Não foi possível preparar o arquivo para download.");
    }

    return { url: signed.signedUrl, filename: downloadName };
  });
