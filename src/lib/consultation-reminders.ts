/**
 * Regras puras dos lembretes de consultoria (sem dependência de servidor),
 * usadas pela rotina automática e pelos testes.
 */

export type ReminderWindow = "24h" | "8h" | "1h";

export type ReminderTarget = {
  scheduled_at: string;
  reminder_24h_sent_at?: string | null;
  reminder_8h_sent_at?: string | null;
  reminder_1h_sent_at?: string | null;
};

export const REMINDER_WINDOWS: { window: ReminderWindow; from: number; to: number; field: string }[] = [
  { window: "24h", from: 8 * 60, to: 24 * 60, field: "reminder_24h_sent_at" },
  { window: "8h", from: 60, to: 8 * 60, field: "reminder_8h_sent_at" },
  { window: "1h", from: 0, to: 60, field: "reminder_1h_sent_at" },
];

export function minutesAhead(scheduledAt: string, now: number | Date = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return (+new Date(scheduledAt) - nowMs) / 60_000;
}

export function reminderField(window: ReminderWindow) {
  return REMINDER_WINDOWS.find((w) => w.window === window)!.field;
}

/**
 * Janelas de lembrete devidas agora para a reunião — já considerando
 * idempotência (nunca reenvia o que possui carimbo de envio).
 */
export function dueReminderWindows(
  row: ReminderTarget,
  now: number | Date = Date.now(),
): ReminderWindow[] {
  const ahead = minutesAhead(row.scheduled_at, now);
  const due: ReminderWindow[] = [];
  for (const w of REMINDER_WINDOWS) {
    const alreadySent = (row as Record<string, unknown>)[w.field];
    if (alreadySent) continue;
    if (ahead <= w.to && ahead > w.from) due.push(w.window);
  }
  return due;
}

/** Valida um link do Google Meet. */
export function isValidMeetLink(url?: string | null) {
  if (!url) return false;
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i.test(url.trim());
}

/** Valida o identificador de um evento do Google Calendar. */
export function isValidCalendarEventId(id?: string | null) {
  if (!id) return false;
  return /^[a-z0-9_-]{5,1024}$/i.test(id.trim());
}
