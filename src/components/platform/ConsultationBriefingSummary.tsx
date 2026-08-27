import { challengeLabel, type ConsultationBriefing } from "@/lib/consultation-briefing";

/** Resumo organizado do briefing — usado no painel admin e no histórico do aluno. */
export function ConsultationBriefingSummary({
  data,
  fallback,
}: {
  data?: Partial<ConsultationBriefing> | null;
  fallback?: string | null;
}) {
  if (!data || typeof data !== "object" || !Object.keys(data).length) {
    return fallback ? (
      <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{fallback}</p>
    ) : null;
  }

  const rows: [string, string | undefined][] = [
    ["Negócio", data.business_name],
    ["Cidade/Estado", data.city_state],
    ["WhatsApp", data.whatsapp],
    ["Instagram", data.instagram],
    ["Já vende espetinhos", data.works_with_skewers],
    ["Faturamento", data.monthly_revenue],
    ["Principal desafio", challengeLabel(data)],
  ];

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([label, v]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="break-words font-medium">{v}</dd>
            </div>
          ))}
      </dl>

      {data.goal && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objetivo da consultoria</p>
          <p className="whitespace-pre-wrap text-sm">{data.goal}</p>
        </div>
      )}
      {data.specific_question && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dúvidas específicas</p>
          <p className="whitespace-pre-wrap text-sm">{data.specific_question}</p>
        </div>
      )}
    </div>
  );
}
