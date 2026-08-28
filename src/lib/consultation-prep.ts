// Preparação automática das consultorias (puro, sem dependências de servidor).
// Gera resumo executivo, dados identificados e roteiro sugerido a partir do
// briefing do aluno + histórico de compras + consultorias anteriores.
// Também gera o resumo/plano de ação a partir das observações pós-reunião.

import { challengeLabel, type ConsultationBriefing } from "@/lib/consultation-briefing";

export type PurchaseItem = { title: string; type: "curso" | "ebook" | "consultoria"; date?: string | null };

export type PreviousConsultation = {
  id: string;
  title: string;
  date: string;
  status: string;
  summary?: string | null;
  actionPlan?: string | null;
};

export type ConsultationDossier = {
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  productTitle: string;
  scheduledAt: string;
  durationMinutes: number;
  amount: number | null;
  meetLink: string | null;
  briefing: Partial<ConsultationBriefing> | null;
  briefingText: string | null;
  purchases: PurchaseItem[];
  previous: PreviousConsultation[];
};

export type ConsultationPrep = {
  /** Resumo executivo em parágrafos curtos. */
  executiveSummary: string[];
  /** Dados identificados automaticamente (rótulo → valor). */
  identified: { label: string; value: string }[];
  /** Roteiro sugerido, dividido em blocos com tempo estimado. */
  script: { title: string; minutes: number; bullets: string[] }[];
  /** Pontos de atenção detectados. */
  alerts: string[];
  generatedAt: string;
};

const dateBR = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(
        new Date(iso),
      )
    : "—";

const money = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const clean = (v?: string | null) => (v ?? "").trim();

/** Instagram sempre normalizado como @handle. */
export function normalizeInstagram(value?: string | null) {
  const raw = clean(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/+$/, "")
    .replace(/^@+/, "");
  return raw ? `@${raw}` : "—";
}

/** Blocos de roteiro sugeridos por desafio declarado. */
const PLAYBOOK: { match: RegExp; title: string; bullets: string[] }[] = [
  {
    match: /precifica|lucro|cmv/i,
    title: "Precificação e CMV",
    bullets: [
      "Levantar custo real do espetinho (carne, carvão, embalagem, gás, perda)",
      "Calcular CMV atual e definir a meta de margem",
      "Ajustar tabela de preços e combos com base no CMV",
    ],
  },
  {
    match: /clientes|marketing|tráfego|trafego|fideliza/i,
    title: "Atração e retenção de clientes",
    bullets: [
      "Revisar posicionamento e bio do Instagram",
      "Definir rotina de conteúdo (3 posts + stories diários)",
      "Criar oferta de recompra / cartão fidelidade",
    ],
  },
  {
    match: /delivery/i,
    title: "Delivery",
    bullets: [
      "Checar embalagem, tempo de entrega e taxa",
      "Ajustar cardápio digital e fotos dos produtos",
      "Definir raio de entrega e política de frete",
    ],
  },
  {
    match: /cardápio|cardapio/i,
    title: "Cardápio",
    bullets: [
      "Enxugar itens de baixa margem e baixa saída",
      "Criar 2 combos âncora e 1 item premium",
      "Padronizar gramatura e ficha técnica",
    ],
  },
  {
    match: /gestão|gestao/i,
    title: "Gestão e rotina",
    bullets: [
      "Definir controle diário de vendas e compras",
      "Organizar produção e estoque (mise en place)",
      "Definir indicadores semanais para acompanhar",
    ],
  },
];

function revenueStage(revenue?: string) {
  const r = clean(revenue);
  if (/ainda não|ainda nao/i.test(r)) return "validação" as const;
  if (/2\.000/.test(r) && /até|ate/i.test(r)) return "início" as const;
  if (/Acima/i.test(r)) return "escala" as const;
  return "crescimento" as const;
}

/** Monta o dossiê de preparação da reunião. */
export function buildConsultationPrep(d: ConsultationDossier): ConsultationPrep {
  const b = d.briefing ?? {};
  const challenges = challengeLabel(b);
  const stage = revenueStage(b.monthly_revenue as string | undefined);
  const alerts: string[] = [];

  if (!d.briefing) alerts.push("Briefing não preenchido — abrir a reunião com diagnóstico rápido.");
  if (!d.meetLink) alerts.push("Link do Meet ainda não gerado para esta reunião.");
  if (clean(b.works_with_skewers as string) === "Não") {
    alerts.push("Ainda não trabalha com espetinhos — foco em começar do zero, não em otimizar.");
  }
  if (!d.purchases.length) alerts.push("Cliente sem cursos/ebooks — indicar material de apoio no final.");
  if (d.previous.length) alerts.push(`Já fez ${d.previous.length} consultoria(s) — retomar o plano de ação anterior.`);

  const identified: { label: string; value: string }[] = [
    { label: "Negócio", value: clean(b.business_name as string) || "—" },
    { label: "Faturamento mensal", value: clean(b.monthly_revenue as string) || "—" },
    { label: "Principal desafio", value: challenges },
    { label: "Objetivo", value: clean(b.goal as string) || "—" },
    { label: "Cidade/Estado", value: clean(b.city_state as string) || "—" },
    { label: "Instagram", value: normalizeInstagram(b.instagram as string) },
    { label: "WhatsApp", value: clean(b.whatsapp as string) || clean(d.clientPhone) || "—" },
    { label: "Já vende espetinho", value: clean(b.works_with_skewers as string) || "—" },
    {
      label: "Histórico de compras",
      value: d.purchases.length
        ? d.purchases.map((p) => `${p.title} (${p.type})`).join(" · ")
        : "Nenhuma compra registrada",
    },
    {
      label: "Consultorias anteriores",
      value: d.previous.length
        ? d.previous.map((p) => `${p.title} — ${dateBR(p.date)}`).join(" · ")
        : "Primeira consultoria",
    },
    { label: "Dúvida específica", value: clean(b.specific_question as string) || "—" },
  ];

  const executiveSummary = [
    `${d.clientName || "Aluno"}${clean(b.business_name as string) ? ` (${clean(b.business_name as string)})` : ""} de ${
      clean(b.city_state as string) || "cidade não informada"
    } tem reunião de ${d.productTitle} em ${dateBR(d.scheduledAt)}, ${d.durationMinutes} minutos, ${money(d.amount)}.`,
    `Momento do negócio: fase de ${stage}, faturando ${clean(b.monthly_revenue as string) || "valor não informado"}${
      clean(b.works_with_skewers as string) === "Não" ? ", ainda sem vender espetinhos" : ""
    }.`,
    `Principal desafio: ${challenges}. Objetivo declarado: ${clean(b.goal as string) || "não informado"}.`,
    d.purchases.length
      ? `Já consumiu: ${d.purchases.map((p) => p.title).join(", ")}.`
      : "Ainda não comprou cursos ou ebooks na plataforma.",
    d.previous.length
      ? `Histórico: ${d.previous.length} consultoria(s) anterior(es); revisar o que ficou pendente no último plano de ação.`
      : "Primeira consultoria com o Ronnei.",
  ];

  // Roteiro sugerido, escalado conforme a duração contratada.
  const total = d.durationMinutes;
  const challengeBlocks = PLAYBOOK.filter((p) => p.match.test(challenges) || p.match.test(clean(b.goal as string)));
  const core = challengeBlocks.length
    ? challengeBlocks
    : [
        {
          match: /./,
          title: "Diagnóstico do negócio",
          bullets: [
            "Entender operação atual (produção, ponto, equipe)",
            "Levantar números básicos: ticket médio, vendas/dia, custo",
            "Definir a maior alavanca de curto prazo",
          ],
        },
      ];

  const openMin = Math.max(4, Math.round(total * 0.12));
  const closeMin = Math.max(5, Math.round(total * 0.18));
  const coreMin = Math.max(5, Math.round((total - openMin - closeMin) / core.length));

  const script = [
    {
      title: "Abertura e confirmação do cenário",
      minutes: openMin,
      bullets: [
        `Confirmar faturamento (${clean(b.monthly_revenue as string) || "não informado"}) e estrutura atual`,
        `Confirmar objetivo: ${clean(b.goal as string) || "definir junto na reunião"}`,
        d.previous.length ? "Retomar pendências da última consultoria" : "Alinhar expectativa da reunião",
      ],
    },
    ...core.map((blk) => ({ title: blk.title, minutes: coreMin, bullets: blk.bullets })),
    {
      title: "Plano de ação e próximos passos",
      minutes: closeMin,
      bullets: [
        "Fechar 3 ações prioritárias com prazo",
        "Definir métrica de acompanhamento",
        d.purchases.length
          ? "Indicar material já adquirido para reforçar o plano"
          : "Indicar curso/ebook complementar",
      ],
    },
  ];

  if (clean(b.specific_question as string)) {
    script.splice(script.length - 1, 0, {
      title: "Dúvida específica do aluno",
      minutes: Math.max(4, Math.round(total * 0.1)),
      bullets: [clean(b.specific_question as string)],
    });
  }

  return { executiveSummary, identified, script, alerts, generatedAt: new Date().toISOString() };
}

/** Roteiro em texto puro — vira o valor inicial do campo editável do Ronnei. */
export function prepScriptToText(prep: ConsultationPrep) {
  return prep.script
    .map((s) => `${s.title} (${s.minutes} min)\n${s.bullets.map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");
}

/* --------------------------- Pós-reunião --------------------------- */

export type ConsultationOutcome = { summary: string; actionPlan: string };

/**
 * Gera o resumo da consultoria e o plano de ação a partir das observações
 * registradas pelo Ronnei depois da reunião.
 */
export function buildConsultationOutcome(input: {
  notes: string;
  dossier: ConsultationDossier;
  prep?: ConsultationPrep | null;
}): ConsultationOutcome {
  const b = input.dossier.briefing ?? {};
  const lines = input.notes
    .split(/\n|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 2);

  const actionable = lines.filter((l) => /\b(fazer|ajustar|criar|testar|revisar|comprar|montar|definir|subir|postar|negociar|treinar|padronizar|calcular|separar)\b/i.test(l));
  const insights = lines.filter((l) => !actionable.includes(l));

  const summary = [
    `Consultoria ${input.dossier.productTitle} realizada em ${dateBR(input.dossier.scheduledAt)} com ${
      input.dossier.clientName || "o aluno"
    }${clean(b.business_name as string) ? ` (${clean(b.business_name as string)})` : ""}.`,
    `Foco da conversa: ${challengeLabel(b)}. Objetivo trabalhado: ${clean(b.goal as string) || "não informado"}.`,
    ...(insights.length ? ["", "Principais pontos:", ...insights.slice(0, 8).map((l) => `• ${l}`)] : []),
  ].join("\n");

  const steps = (actionable.length ? actionable : insights).slice(0, 6);
  const actionPlan = steps.length
    ? steps.map((l, i) => `${i + 1}. ${l.charAt(0).toUpperCase()}${l.slice(1)}`).join("\n")
    : [
        "1. Levantar custos e recalcular o preço dos espetinhos",
        "2. Ajustar cardápio e combos conforme conversamos",
        "3. Manter rotina de conteúdo e acompanhar as vendas diárias",
      ].join("\n");

  return { summary, actionPlan };
}
