// Briefing estruturado das consultorias — schema, opções e formatação.
// Usado tanto no formulário do aluno (multi-etapas) quanto no resumo do admin.

import { z } from "zod";

export const REVENUE_OPTIONS = [
  "Ainda não vendo",
  "Até R$ 2.000",
  "R$ 2.000 a R$ 5.000",
  "R$ 5.000 a R$ 10.000",
  "Acima de R$ 10.000",
] as const;

export const CHALLENGE_OPTIONS = [
  "Conseguir mais clientes",
  "Aumentar lucro",
  "Delivery",
  "Cardápio",
  "Precificação",
  "Gestão",
  "Marketing",
  "Tráfego pago",
  "Fidelização de clientes",
  "Outro",
] as const;

export const briefingSchema = z.object({
  business_name: z.string().trim().min(2, "Informe o nome do negócio").max(120),
  whatsapp: z.string().trim().min(8, "Informe um WhatsApp válido").max(30),
  instagram: z.string().trim().min(2, "Informe o Instagram").max(80),
  city_state: z.string().trim().min(3, "Informe cidade e estado").max(120),
  works_with_skewers: z.enum(["Sim", "Não"]),
  monthly_revenue: z.enum(REVENUE_OPTIONS),
  main_challenge: z.array(z.enum(CHALLENGE_OPTIONS)).min(1, "Selecione pelo menos um desafio"),
  main_challenge_other: z.string().trim().max(120).optional().default(""),
  goal: z.string().trim().min(10, "Conte em poucas palavras o que espera alcançar").max(500),
  specific_question: z.string().trim().max(500).optional().default(""),
});

export type ConsultationBriefing = z.infer<typeof briefingSchema>;

export const BRIEFING_LABELS: Record<keyof ConsultationBriefing, string> = {
  business_name: "Nome do negócio",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  city_state: "Cidade/Estado",
  works_with_skewers: "Já trabalha com espetinhos",
  monthly_revenue: "Faturamento mensal",
  main_challenge: "Principais desafios",
  main_challenge_other: "Desafio (detalhe)",
  goal: "O que espera alcançar",
  specific_question: "Dúvidas específicas",
};

export function challengeLabel(b: Partial<ConsultationBriefing>) {
  const list = b.main_challenge ?? [];
  const challenges = Array.isArray(list) ? list : [list];
  const hasOther = challenges.includes("Outro");
  const baseList = challenges.filter((c) => c !== "Outro");
  let base = baseList.length > 0 ? baseList.join(", ") : "";
  if (hasOther && b.main_challenge_other) {
    base = base ? `${base}, ${b.main_challenge_other}` : b.main_challenge_other;
  } else if (hasOther) {
    base = base || "Outro";
  }
  return base || "-";
}

/** Versão em texto — usada no evento do Calendar, e-mails e histórico legado. */
export function formatBriefingText(b: ConsultationBriefing) {
  return [
    `Negócio: ${b.business_name}`,
    `WhatsApp: ${b.whatsapp}`,
    `Instagram: ${b.instagram}`,
    `Cidade/Estado: ${b.city_state}`,
    `Já trabalha com espetinhos: ${b.works_with_skewers}`,
    `Faturamento mensal: ${b.monthly_revenue}`,
    `Principais desafios: ${challengeLabel(b)}`,
    `Objetivo: ${b.goal}`,
    b.specific_question ? `Dúvidas específicas: ${b.specific_question}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Etapas do formulário mobile-first (usadas para a barra de progresso). */
export const BRIEFING_STEPS: { title: string; fields: (keyof ConsultationBriefing)[] }[] = [
  { title: "Seu negócio", fields: ["business_name", "city_state"] },
  { title: "Contato", fields: ["whatsapp", "instagram"] },
  { title: "Momento atual", fields: ["works_with_skewers", "monthly_revenue"] },
  { title: "Seu desafio", fields: ["main_challenge", "main_challenge_other"] },
  { title: "Objetivo", fields: ["goal", "specific_question"] },
];

export const EMPTY_BRIEFING: ConsultationBriefing = {
  business_name: "",
  whatsapp: "",
  instagram: "",
  city_state: "",
  works_with_skewers: "Sim",
  monthly_revenue: REVENUE_OPTIONS[0],
  main_challenge: [],
  main_challenge_other: "",
  goal: "",
  specific_question: "",
};

/** Valida apenas os campos de uma etapa. */
export function isStepValid(step: number, value: ConsultationBriefing) {
  const fields = BRIEFING_STEPS[step]?.fields ?? [];
  return fields.every((f) => {
    if (f === "main_challenge_other") {
      const hasOther = Array.isArray(value.main_challenge) && value.main_challenge.includes("Outro");
      return !hasOther || (value.main_challenge_other ?? "").trim().length >= 2;
    }
    if (f === "specific_question") return true;
    const single = (briefingSchema.shape as any)[f];
    return single.safeParse((value as any)[f]).success;
  });
}
