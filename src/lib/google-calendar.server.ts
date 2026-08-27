// Google Calendar + Google Meet (server-only).
// Cria/atualiza/cancela eventos na agenda oficial e gera o link do Meet.

import { googleFetch } from "@/lib/google-oauth.server";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleIntegrationSettings = {
  id: string;
  calendar_id: string;
  timezone: string;
  default_duration_minutes: number;
  drive_recordings_folder_id: string | null;
  create_meet_links: boolean;
  send_calendar_invites: boolean;
  enabled: boolean;
};

export async function getGoogleSettings(): Promise<GoogleIntegrationSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("google_integration_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data) return data as GoogleIntegrationSettings;

  const { data: created, error } = await supabaseAdmin
    .from("google_integration_settings")
    .insert({ calendar_id: "primary" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao carregar configurações do Google: ${error.message}`);
  return created as GoogleIntegrationSettings;
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  /** ISO 8601 com offset, ex.: 2026-09-01T14:00:00-03:00 */
  startIso: string;
  endIso?: string;
  durationMinutes?: number;
  attendees?: string[];
  /** Cria conferência do Google Meet (padrão: conforme configuração). */
  withMeet?: boolean;
  location?: string;
  /** Chave estável para evitar conferências duplicadas em retries. */
  requestId?: string;
};

export type CalendarEventResult = {
  eventId: string;
  htmlLink: string | null;
  meetLink: string | null;
  startIso: string;
  endIso: string;
  calendarId: string;
};

function computeEnd(input: CalendarEventInput, fallbackMinutes: number) {
  if (input.endIso) return input.endIso;
  const minutes = input.durationMinutes ?? fallbackMinutes;
  return new Date(new Date(input.startIso).getTime() + minutes * 60000).toISOString();
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
  const settings = await getGoogleSettings();
  const endIso = computeEnd(input, settings.default_duration_minutes);
  const withMeet = input.withMeet ?? settings.create_meet_links;

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: { dateTime: input.startIso, timeZone: settings.timezone },
    end: { dateTime: endIso, timeZone: settings.timezone },
    attendees: (input.attendees ?? []).map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  if (withMeet) {
    body["conferenceData"] = {
      createRequest: {
        requestId: input.requestId || `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const params = new URLSearchParams({
    conferenceDataVersion: withMeet ? "1" : "0",
    sendUpdates: settings.send_calendar_invites ? "all" : "none",
  });

  const event = await googleFetch<any>(
    "calendar.events.insert",
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(settings.calendar_id)}/events?${params}`,
    { method: "POST", body: JSON.stringify(body) },
  );

  return {
    eventId: event.id,
    htmlLink: event.htmlLink ?? null,
    meetLink:
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
      null,
    startIso: event.start?.dateTime ?? input.startIso,
    endIso: event.end?.dateTime ?? endIso,
    calendarId: settings.calendar_id,
  };
}

export async function updateCalendarEvent(
  eventId: string,
  patch: Partial<CalendarEventInput>,
): Promise<CalendarEventResult> {
  const settings = await getGoogleSettings();
  const body: Record<string, unknown> = {};

  if (patch.summary) body["summary"] = patch.summary;
  if (patch.description !== undefined) body["description"] = patch.description;
  if (patch.location !== undefined) body["location"] = patch.location;
  if (patch.startIso) body["start"] = { dateTime: patch.startIso, timeZone: settings.timezone };
  if (patch.startIso || patch.endIso) {
    const endIso = patch.endIso
      ? patch.endIso
      : computeEnd(
          { summary: "", startIso: patch.startIso! , durationMinutes: patch.durationMinutes },
          settings.default_duration_minutes,
        );
    body["end"] = { dateTime: endIso, timeZone: settings.timezone };
  }
  if (patch.attendees) body["attendees"] = patch.attendees.map((email) => ({ email }));

  const params = new URLSearchParams({
    sendUpdates: settings.send_calendar_invites ? "all" : "none",
  });

  const event = await googleFetch<any>(
    "calendar.events.patch",
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(settings.calendar_id)}/events/${encodeURIComponent(eventId)}?${params}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );

  return {
    eventId: event.id,
    htmlLink: event.htmlLink ?? null,
    meetLink: event.hangoutLink ?? null,
    startIso: event.start?.dateTime ?? "",
    endIso: event.end?.dateTime ?? "",
    calendarId: settings.calendar_id,
  };
}

export async function deleteCalendarEvent(eventId: string, notify = true) {
  const settings = await getGoogleSettings();
  const params = new URLSearchParams({ sendUpdates: notify ? "all" : "none" });
  await googleFetch(
    "calendar.events.delete",
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(settings.calendar_id)}/events/${encodeURIComponent(eventId)}?${params}`,
    { method: "DELETE" },
  );
  return { deleted: true };
}

export async function listCalendars() {
  const data = await googleFetch<any>(
    "calendar.calendarList.list",
    `${CALENDAR_BASE}/users/me/calendarList?minAccessRole=writer&maxResults=50`,
  );
  return ((data.items ?? []) as any[]).map((c) => ({
    id: c.id as string,
    summary: (c.summaryOverride || c.summary) as string,
    primary: Boolean(c.primary),
    timeZone: c.timeZone as string | undefined,
  }));
}

/** Cria e remove um evento de teste, devolvendo o link do Meet gerado. */
export async function runCalendarSelfTest() {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);

  const created = await createCalendarEvent({
    summary: "[TESTE] Integração Ronnei na Veia",
    description: "Evento de teste criado automaticamente para validar a integração. Pode ser ignorado.",
    startIso: start.toISOString(),
    durationMinutes: 15,
    withMeet: true,
    requestId: `selftest-${Date.now()}`,
  });

  await deleteCalendarEvent(created.eventId, false).catch(() => undefined);

  return {
    ok: true,
    meetLink: created.meetLink,
    calendarId: created.calendarId,
    eventId: created.eventId,
  };
}
