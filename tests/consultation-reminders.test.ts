import { describe, expect, it } from "vitest";
import {
  dueReminderWindows,
  isValidCalendarEventId,
  isValidMeetLink,
  minutesAhead,
} from "@/lib/consultation-reminders";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function meeting(hoursAhead: number, extra: Record<string, unknown> = {}) {
  return {
    scheduled_at: new Date(NOW.getTime() + hoursAhead * 3600_000).toISOString(),
    reminder_24h_sent_at: null,
    reminder_8h_sent_at: null,
    reminder_1h_sent_at: null,
    google_event_id: "abc123defg",
    meet_link: "https://meet.google.com/abc-defg-hij",
    ...extra,
  };
}

describe("reunião criada", () => {
  it("gera horário futuro coerente", () => {
    const m = meeting(3);
    expect(minutesAhead(m.scheduled_at, NOW)).toBeCloseTo(180, 5);
  });

  it("evento do Google Calendar é válido", () => {
    expect(isValidCalendarEventId(meeting(3).google_event_id)).toBe(true);
    expect(isValidCalendarEventId(null)).toBe(false);
    expect(isValidCalendarEventId("abc")).toBe(false);
  });

  it("link do Meet é válido", () => {
    expect(isValidMeetLink(meeting(3).meet_link)).toBe(true);
    expect(isValidMeetLink("https://zoom.us/j/123")).toBe(false);
    expect(isValidMeetLink("https://meet.google.com/")).toBe(false);
    expect(isValidMeetLink(null)).toBe(false);
  });
});

describe("lembrete programado", () => {
  it("programa o lembrete de 8h dentro da janela", () => {
    expect(dueReminderWindows(meeting(7), NOW)).toEqual(["8h"]);
  });

  it("programa o lembrete de 1h dentro da janela", () => {
    expect(dueReminderWindows(meeting(0.5), NOW)).toEqual(["1h"]);
  });

  it("programa o lembrete de 24h dentro da janela", () => {
    expect(dueReminderWindows(meeting(20), NOW)).toEqual(["24h"]);
  });

  it("não programa nada fora das janelas", () => {
    expect(dueReminderWindows(meeting(48), NOW)).toEqual([]);
    expect(dueReminderWindows(meeting(-1), NOW)).toEqual([]);
  });
});

describe("idempotência", () => {
  it("não reenvia lembrete já enviado", () => {
    const m = meeting(7, { reminder_8h_sent_at: NOW.toISOString() });
    expect(dueReminderWindows(m, NOW)).toEqual([]);
  });

  it("não reenvia lembrete de 1h já enviado", () => {
    const m = meeting(0.5, { reminder_1h_sent_at: NOW.toISOString() });
    expect(dueReminderWindows(m, NOW)).toEqual([]);
  });

  it("duas execuções seguidas produzem um único envio por janela", () => {
    const m = meeting(7);
    const first = dueReminderWindows(m, NOW);
    expect(first).toEqual(["8h"]);
    // simula o carimbo gravado pela rotina após o envio
    const after = { ...m, reminder_8h_sent_at: NOW.toISOString() };
    expect(dueReminderWindows(after, new Date(NOW.getTime() + 15 * 60_000))).toEqual([]);
  });
});
