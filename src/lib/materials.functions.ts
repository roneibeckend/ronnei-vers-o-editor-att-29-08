import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: { context: any }) => {

    try {
      if (!context) throw new Error("Unauthorized");
      
      const { data, error } = await context.supabase
        .from("platform_materials")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });


      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("Server side error in getMaterials:", e);
      throw e;
    }
  });

export const upsertMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    id: z.string().uuid().optional(),
    title: z.string(),
    description: z.string().optional(),
    type: z.string(),
    file_url: z.string().nullable().optional(),
    external_url: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    is_active: z.boolean().default(true),
  }).parse(data))
  .handler(async ({ data, context }: { data: any, context: any }) => {

    if (!context) throw new Error("Internal Server Error: No context");
    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" 
    });

    if (roleError) {
      console.error("Erro ao validar permissão para salvar material:", roleError);
      throw new Error("Não foi possível validar a permissão de administrador");
    }
    if (!hasRole) throw new Error("Acesso negado: apenas administradores podem gerenciar materiais");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: result, error } = await supabaseAdmin
      .from("platform_materials")
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("Erro ao salvar material (Admin Client):", error);
      throw error;
    }
    return result;
  });


export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }: { data: any, context: any }) => {

    const { data: hasRole, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" 
    });

    if (roleError) {
      console.error("Erro ao validar permissão para excluir material:", roleError);
      throw new Error("Não foi possível validar a permissão de administrador");
    }
    if (!hasRole) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("platform_materials")
      .delete()
      .eq("id", data.id);

    if (error) throw error;
    return { success: true };
  });

export const getMaterialDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((data: any) =>
    z.object({
      materialId: z.string().uuid(),
      accessToken: z.string().min(20),
    }).parse(data)
  )
  .handler(async ({ data }: { data: any }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    /*
     * IMPORTANTE:
     * O token chega no corpo POST.
     * Não dependemos mais de um Authorization header implícito
     * do TanStack/browser.
     */
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.getUser(
      data.accessToken
    );

    const user = authData?.user;

    if (authError || !user) {
      console.warn(
        "[material-download] sessão inválida:",
        authError?.message || "usuário ausente"
      );

      throw new Error(
        "Sua sessão expirou. Entre novamente na plataforma."
      );
    }

    const userId = user.id;

    const {
      data: material,
      error: fetchError,
    } = await supabaseAdmin
      .from("platform_materials")
      .select("*")
      .eq("id", data.materialId)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "[material-download] erro material:",
        fetchError
      );

      throw new Error(
        "Não foi possível localizar o material."
      );
    }

    if (!material) {
      throw new Error(
        "Material não encontrado."
      );
    }

    if (!material.is_active) {
      throw new Error(
        "Material indisponível."
      );
    }

    /*
     * A autorização é feita server-side com o usuário
     * validado acima. O service role nunca vai para o browser.
     */
    const {
      data: isAdmin,
      error: roleError,
    } = await supabaseAdmin.rpc(
      "has_role",
      {
        _user_id: userId,
        _role: "admin",
      }
    );

    if (roleError) {
      console.error(
        "[material-download] erro de role:",
        roleError
      );

      throw new Error(
        "Não foi possível validar sua permissão."
      );
    }

    if (!isAdmin) {
      const item = material as any;

      if (item.course_id) {
        const {
          data: course,
        } = await supabaseAdmin
          .from("courses")
          .select("status")
          .eq("id", item.course_id)
          .maybeSingle();

        if ((course as any)?.status === "draft") {
          throw new Error(
            "Conteúdo ainda não publicado."
          );
        }

        const {
          data: enrollment,
        } = await supabaseAdmin
          .from("course_enrollments")
          .select("id")
          .eq("course_id", item.course_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!enrollment) {
          throw new Error(
            "Você não possui matrícula neste curso."
          );
        }
      } else if (item.ebook_id) {
        const {
          data: ebook,
        } = await supabaseAdmin
          .from("ebooks")
          .select("status")
          .eq("id", item.ebook_id)
          .maybeSingle();

        if ((ebook as any)?.status === "draft") {
          throw new Error(
            "Conteúdo ainda não publicado."
          );
        }

        const {
          data: enrollment,
        } = await supabaseAdmin
          .from("ebook_enrollments")
          .select("id")
          .eq("ebook_id", item.ebook_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!enrollment) {
          throw new Error(
            "Você não possui acesso a este e-book."
          );
        }
      }
    }

    const originalFileUrl =
      material.file_url;

    if (!originalFileUrl) {
      throw new Error(
        "Este material não possui arquivo para download."
      );
    }

    let bucketName =
      "platform-materials";

    let filePath =
      String(originalFileUrl);

    /*
     * Os uploads do Admin são salvos usando getPublicUrl().
     * Extraímos apenas bucket/path dessa URL.
     */
    if (/^https?:\/\//i.test(filePath)) {
      let parsed: URL;

      try {
        parsed = new URL(filePath);
      } catch {
        throw new Error(
          "URL do arquivo inválida."
        );
      }

      const markers = [
        "/storage/v1/object/public/",
        "/storage/v1/object/sign/",
      ];

      let storagePath:
        | string
        | null = null;

      for (const marker of markers) {
        const index =
          parsed.pathname.indexOf(marker);

        if (index !== -1) {
          storagePath =
            parsed.pathname.slice(
              index + marker.length
            );

          break;
        }
      }

      if (!storagePath) {
        throw new Error(
          "O arquivo não pertence ao Storage configurado."
        );
      }

      storagePath =
        decodeURIComponent(storagePath);

      const slash =
        storagePath.indexOf("/");

      if (slash < 1) {
        throw new Error(
          "Caminho do Storage inválido."
        );
      }

      bucketName =
        storagePath.slice(0, slash);

      filePath =
        storagePath.slice(slash + 1);
    }

    if (!filePath) {
      throw new Error(
        "Caminho do arquivo não identificado."
      );
    }

    let downloadName =
      filePath.split("/").pop()
      || `material-${data.materialId}`;

    try {
      downloadName =
        decodeURIComponent(downloadName);
    } catch {
      // Mantém o nome original.
    }

    /*
     * Evita caracteres problemáticos no Content-Disposition.
     */
    downloadName =
      downloadName
        .replace(/[\r\n"]/g, "_")
        .slice(0, 180);

    /*
     * A opção download força Content-Disposition attachment.
     * Isso é fundamental no mobile.
     */
    const {
      data: signedData,
      error: signedError,
    } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUrl(
        filePath,
        60 * 5,
        {
          download: downloadName,
        }
      );

    if (
      signedError ||
      !signedData?.signedUrl
    ) {
      console.error(
        "[material-download] signed URL:",
        signedError
      );

      throw new Error(
        "Não foi possível preparar o arquivo para download."
      );
    }

    return {
      url: signedData.signedUrl,
      filename: downloadName,
    };
  });

