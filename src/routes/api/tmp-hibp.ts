import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tmp-hibp")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { patchAuthConfig } = await import("@/lib/oauth-admin.server");
          const result = await patchAuthConfig({ password_hibp_enabled: true });
          return Response.json({
            ok: true,
            password_hibp_enabled:
              (result as Record<string, unknown>)["password_hibp_enabled"] ?? null,
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
