import { createFileRoute } from "@tanstack/react-router";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — remover após validação.
export const Route = createFileRoute("/api/public/_tmp-drive-check")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { checkRecordingsFolder } = await import("@/lib/google-drive.server");
          const { getConnectionStatus } = await import("@/lib/google-oauth.server");
          const status = await getConnectionStatus();
          const folder = await checkRecordingsFolder(null, 5);
          return Response.json({ status, folder });
        } catch (err: any) {
          return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
        }
      },
    },
  },
});
