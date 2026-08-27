// Gera um link "Adicionar ao Google Agenda" (template) preenchido com os
// dados da consultoria. Diferente do htmlLink do evento (que pertence à
// agenda do Ronnei e abre a tela padrão para o aluno), este link abre a
// tela de criação de evento na agenda do próprio aluno.

function toGCalDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildAddToGoogleCalendarUrl(input: {
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
  location?: string;
}) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toGCalDate(input.startIso)}/${toGCalDate(input.endIso)}`,
  });
  if (input.description) params.set("details", input.description);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function consultationCalendarUrl(c: {
  product_title: string;
  scheduled_at: string;
  ends_at: string;
  meet_link?: string | null;
}) {
  return buildAddToGoogleCalendarUrl({
    title: `Consultoria Ronnei na Veia — ${c.product_title}`,
    startIso: c.scheduled_at,
    endIso: c.ends_at,
    description: [
      `Consultoria: ${c.product_title}`,
      c.meet_link ? `Link da reunião (Google Meet): ${c.meet_link}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    location: c.meet_link ?? undefined,
  });
}
