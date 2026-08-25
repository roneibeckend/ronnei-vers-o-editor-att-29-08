import { createFileRoute } from "@tanstack/react-router";

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseStorageLocation(original: string) {
  let bucket = "platform-materials";
  let path = original;

  if (!/^https?:\/\//i.test(original)) {
    return { bucket, path };
  }

  const url = new URL(original);

  const markers = [
    "/storage/v1/object/public/",
    "/storage/v1/object/sign/",
    "/storage/v1/object/authenticated/",
  ];

  let storagePath: string | null = null;

  for (const marker of markers) {
    const index = url.pathname.indexOf(marker);

    if (index !== -1) {
      storagePath = url.pathname.slice(
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

  storagePath = decodeURIComponent(storagePath);

  const slash = storagePath.indexOf("/");

  if (slash < 1) {
    throw new Error(
      "Caminho do Storage inválido."
    );
  }

  bucket = storagePath.slice(0, slash);
  path = storagePath.slice(slash + 1);

  return { bucket, path };
}

function safeFilename(value: string) {
  let filename =
    value.split("/").pop() || "material";

  try {
    filename = decodeURIComponent(filename);
  } catch {
    // mantém original
  }

  return filename
    .replace(/[\r\n"\\]/g, "_")
    .slice(0, 180);
}

export const Route =
  createFileRoute("/api/material-download")({
    server: {
      handlers: {
        POST: async ({ request }) => {
          try {
            const form = await request.formData();

            const materialId =
              String(
                form.get("materialId") || ""
              ).trim();

            const accessToken =
              String(
                form.get("accessToken") || ""
              ).trim();

            if (!accessToken) {
              return textError(
                "Sessão não informada.",
                401
              );
            }

            if (!materialId) {
              return textError(
                "Material não informado.",
                400
              );
            }

            const { supabaseAdmin } =
              await import(
                "@/integrations/supabase/client.server"
              );

            const {
              data: userResult,
              error: userError,
            } =
              await supabaseAdmin.auth.getUser(
                accessToken
              );

            const user = userResult?.user;

            if (userError || !user) {
              console.warn(
                "[material-download-proxy] sessão inválida:",
                userError?.message ||
                  "usuário ausente"
              );

              return textError(
                "Sua sessão expirou. Entre novamente.",
                401
              );
            }

            const {
              data: material,
              error: materialError,
            } =
              await supabaseAdmin
                .from("platform_materials")
                .select("*")
                .eq("id", materialId)
                .maybeSingle();

            if (materialError) {
              console.error(
                "[material-download-proxy] banco:",
                materialError
              );

              return textError(
                "Erro ao localizar o material.",
                500
              );
            }

            if (!material) {
              return textError(
                "Material não encontrado.",
                404
              );
            }

            if (!material.is_active) {
              return textError(
                "Material indisponível.",
                403
              );
            }

            const {
              data: isAdmin,
              error: roleError,
            } =
              await supabaseAdmin.rpc(
                "has_role",
                {
                  _user_id: user.id,
                  _role: "admin",
                }
              );

            if (roleError) {
              console.error(
                "[material-download-proxy] role:",
                roleError
              );

              return textError(
                "Não foi possível validar a permissão.",
                500
              );
            }

            if (!isAdmin) {
              const item = material as any;

              if (item.course_id) {
                const { data: course } =
                  await supabaseAdmin
                    .from("courses")
                    .select("status")
                    .eq("id", item.course_id)
                    .maybeSingle();

                if (
                  (course as any)?.status === "draft"
                ) {
                  return textError(
                    "Conteúdo ainda não publicado.",
                    403
                  );
                }

                const { data: enrollment } =
                  await supabaseAdmin
                    .from("course_enrollments")
                    .select("id")
                    .eq(
                      "course_id",
                      item.course_id
                    )
                    .eq(
                      "user_id",
                      user.id
                    )
                    .maybeSingle();

                if (!enrollment) {
                  return textError(
                    "Você não possui matrícula neste curso.",
                    403
                  );
                }
              }

              if (item.ebook_id) {
                const { data: ebook } =
                  await supabaseAdmin
                    .from("ebooks")
                    .select("status")
                    .eq("id", item.ebook_id)
                    .maybeSingle();

                if (
                  (ebook as any)?.status === "draft"
                ) {
                  return textError(
                    "Conteúdo ainda não publicado.",
                    403
                  );
                }

                const { data: enrollment } =
                  await supabaseAdmin
                    .from("ebook_enrollments")
                    .select("id")
                    .eq(
                      "ebook_id",
                      item.ebook_id
                    )
                    .eq(
                      "user_id",
                      user.id
                    )
                    .maybeSingle();

                if (!enrollment) {
                  return textError(
                    "Você não possui acesso a este e-book.",
                    403
                  );
                }
              }
            }

            if (!material.file_url) {
              return textError(
                "Material sem arquivo.",
                404
              );
            }

            let location;

            try {
              location =
                parseStorageLocation(
                  String(material.file_url)
                );
            } catch (error: any) {
              console.error(
                "[material-download-proxy] path:",
                error
              );

              return textError(
                error?.message ||
                  "Caminho inválido.",
                500
              );
            }

            const filename =
              safeFilename(location.path);

            const {
              data: signed,
              error: signedError,
            } =
              await supabaseAdmin.storage
                .from(location.bucket)
                .createSignedUrl(
                  location.path,
                  60
                );

            if (
              signedError ||
              !signed?.signedUrl
            ) {
              console.error(
                "[material-download-proxy] signed:",
                signedError
              );

              return textError(
                "Não foi possível preparar o arquivo.",
                502
              );
            }

            const upstream =
              await fetch(
                signed.signedUrl,
                {
                  redirect: "follow",
                  cache: "no-store",
                }
              );

            if (
              !upstream.ok ||
              !upstream.body
            ) {
              console.error(
                "[material-download-proxy] upstream HTTP",
                upstream.status
              );

              return textError(
                "O Storage não entregou o arquivo.",
                502
              );
            }

            console.info(
              `[material-download-proxy] OK material=${materialId} storage=${upstream.status}`
            );

            const headers =
              new Headers();

            headers.set(
              "Content-Type",
              upstream.headers.get(
                "content-type"
              ) ||
                "application/octet-stream"
            );

            const length =
              upstream.headers.get(
                "content-length"
              );

            if (length) {
              headers.set(
                "Content-Length",
                length
              );
            }

            headers.set(
              "Content-Disposition",
              `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(
                filename
              )}`
            );

            headers.set(
              "Cache-Control",
              "private, no-store, max-age=0"
            );

            headers.set(
              "X-Content-Type-Options",
              "nosniff"
            );

            return new Response(
              upstream.body,
              {
                status: 200,
                headers,
              }
            );
          } catch (error) {
            console.error(
              "[material-download-proxy] fatal:",
              error
            );

            return textError(
              "Erro interno durante o download.",
              500
            );
          }
        },
      },
    },
  });
