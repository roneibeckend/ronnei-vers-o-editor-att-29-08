import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Proibido");
}

/** Status da integração + configurações + últimos logs. */
export const getGoogleIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const [{ getConnectionStatus }, { getGoogleSettings }] = await Promise.all([
      import("@/lib/google-oauth.server"),
      import("@/lib/google-calendar.server"),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [status, settings, logs] = await Promise.all([
      getConnectionStatus(),
      getGoogleSettings(),
      supabaseAdmin
        .from("google_api_logs")
        .select("id, action, status, http_status, duration_ms, error, created_at")
        .order("created_at", { ascending: false })
        .limit(20)
        .then((r) => r.data ?? []),
    ]);

    return { status, settings, logs };
  });

/** Cadastra/atualiza o Client ID e Client Secret do Google (secret criptografado). */
export const saveGoogleOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clientId: z.string().trim().min(10).max(300),
        clientSecret: z.string().trim().min(6).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveGoogleClient } = await import("@/lib/google-oauth.server");
    return saveGoogleClient({ ...data, userId: context.userId });
  });

/** Gera a URL de consentimento do Google para conectar a conta oficial. */
export const startGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { origin: string }) => z.object({ origin: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { createConsentUrl, googleClientConfigured } = await import("@/lib/google-oauth.server");
    if (!(await googleClientConfigured())) {
      throw new Error(
        "Credenciais OAuth do Google ausentes. Cadastre o Client ID e o Client Secret antes de conectar.",
      );
    }
    return createConsentUrl(data.origin, context.userId);
  });


export const disconnectGoogleAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { disconnectGoogle } = await import("@/lib/google-oauth.server");
    return disconnectGoogle();
  });

/** Agendas com permissão de escrita na conta conectada. */
export const listGoogleCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listCalendars } = await import("@/lib/google-calendar.server");
    return listCalendars();
  });

const settingsSchema = z.object({
  calendar_id: z.string().min(1).max(200),
  timezone: z.string().min(1).max(60),
  default_duration_minutes: z.number().int().min(15).max(480),
  drive_recordings_folder_id: z.string().max(200).nullable().optional(),
  create_meet_links: z.boolean(),
  send_calendar_invites: z.boolean(),
  enabled: z.boolean(),
});

export const saveGoogleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getGoogleSettings } = await import("@/lib/google-calendar.server");
    const current = await getGoogleSettings();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_integration_settings")
      .update({
        calendar_id: data.calendar_id,
        timezone: data.timezone,
        default_duration_minutes: data.default_duration_minutes,
        drive_recordings_folder_id: data.drive_recordings_folder_id || null,
        create_meet_links: data.create_meet_links,
        send_calendar_invites: data.send_calendar_invites,
        enabled: data.enabled,
      })
      .eq("id", current.id);

    if (error) throw new Error(`Falha ao salvar: ${error.message}`);
    return { saved: true };
  });

/** Cria e apaga um evento de teste, devolvendo o link do Meet gerado. */
export const testGoogleIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [{ runCalendarSelfTest }, { getDriveAbout }] = await Promise.all([
      import("@/lib/google-calendar.server"),
      import("@/lib/google-drive.server"),
    ]);

    const calendar = await runCalendarSelfTest();
    let drive: { ok: boolean; email?: string | null; error?: string } = { ok: false };
    try {
      const about = await getDriveAbout();
      drive = { ok: true, email: about.email };
    } catch (err: any) {
      drive = { ok: false, error: err?.message ?? "Falha no Drive" };
    }

    return { calendar, drive };
  });
