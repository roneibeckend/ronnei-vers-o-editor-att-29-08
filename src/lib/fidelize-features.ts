/**
 * Catálogo de recursos (feature keys) da Fidelize.
 * Traduz as chaves técnicas retornadas pela API (`plan_modules`) em rótulos
 * amigáveis, agrupados por categoria. Nenhuma chave snake_case deve chegar à UI.
 */

export type FidelizeFeatureGroup =
  | "Fidelidade"
  | "Cardápio & Vitrine"
  | "Marketing"
  | "Atendimento"
  | "Relatórios"
  | "Gestão";

export const FIDELIZE_FEATURE_GROUP_ORDER: FidelizeFeatureGroup[] = [
  "Fidelidade",
  "Cardápio & Vitrine",
  "Marketing",
  "Atendimento",
  "Relatórios",
  "Gestão",
];

export interface FidelizeFeature {
  /** Chave canônica (após normalização de sinônimos). */
  key: string;
  label: string;
  description: string;
  group: FidelizeFeatureGroup;
}

/** Sinônimos/plurais que apontam para a mesma funcionalidade. */
const SYNONYMS: Record<string, string> = {
  loyalty_cards: "loyalty_card",
  loyalty: "loyalty_card",
  cartao_fidelidade: "loyalty_card",
  stamp: "stamps",
  selos: "stamps",
  menu: "digital_menu",
  digital_menus: "digital_menu",
  cardapio_digital: "digital_menu",
  link_tree: "linktree",
  bio_link: "linktree",
  coupon: "coupons",
  cupons: "coupons",
  rewards: "coupons",
  campaign: "campaigns",
  campanhas: "campaigns",
  automations: "campaigns",
  whatsapp_integration: "whatsapp",
  whats: "whatsapp",
  customer: "customers",
  clientes: "customers",
  crm: "customers",
  report: "reports",
  relatorios: "reports",
  basic_reports: "reports",
  advanced_reports: "analytics",
  dashboards: "analytics",
  multi_units: "multi_unit",
  multi_store: "multi_unit",
  units: "multi_unit",
  api_access: "api",
  integrations: "api",
  push: "push_notifications",
  notifications: "push_notifications",
  support: "priority_support",
  qrcode: "qr_code",
  qr: "qr_code",
  cash_back: "cashback",
  birthdays: "birthday",
  feedbacks: "feedback",
  reviews: "feedback",
  order: "orders",
  pedidos: "orders",
};

const CATALOG: Record<string, Omit<FidelizeFeature, "key">> = {
  loyalty_card: {
    label: "Cartão fidelidade digital",
    description: "Seu cartão de carimbos direto no celular do cliente.",
    group: "Fidelidade",
  },
  stamps: {
    label: "Carimbos e recompensas",
    description: "Regras de carimbo e prêmios liberados automaticamente.",
    group: "Fidelidade",
  },
  cashback: {
    label: "Cashback",
    description: "Devolva parte do valor da compra como crédito.",
    group: "Fidelidade",
  },
  points: {
    label: "Programa de pontos",
    description: "Acúmulo de pontos por compra e troca por benefícios.",
    group: "Fidelidade",
  },
  qr_code: {
    label: "Check-in por QR Code",
    description: "O cliente registra a visita escaneando o código.",
    group: "Fidelidade",
  },
  digital_menu: {
    label: "Cardápio digital",
    description: "Cardápio online sempre atualizado, sem impressão.",
    group: "Cardápio & Vitrine",
  },
  linktree: {
    label: "Página de links",
    description: "Uma página só sua com todos os seus canais e ofertas.",
    group: "Cardápio & Vitrine",
  },
  custom_domain: {
    label: "Domínio próprio",
    description: "Use o endereço da sua marca nas páginas públicas.",
    group: "Cardápio & Vitrine",
  },
  orders: {
    label: "Pedidos online",
    description: "Receba pedidos direto pelo cardápio digital.",
    group: "Cardápio & Vitrine",
  },
  campaigns: {
    label: "Campanhas automáticas",
    description: "Mensagens disparadas sozinhas para trazer o cliente de volta.",
    group: "Marketing",
  },
  coupons: {
    label: "Cupons e promoções",
    description: "Descontos e brindes com controle de uso.",
    group: "Marketing",
  },
  birthday: {
    label: "Aniversariantes",
    description: "Ofertas automáticas no mês de aniversário do cliente.",
    group: "Marketing",
  },
  push_notifications: {
    label: "Notificações push",
    description: "Avisos instantâneos no celular do cliente.",
    group: "Marketing",
  },
  whatsapp: {
    label: "WhatsApp integrado",
    description: "Fale com o cliente pelo canal que ele mais usa.",
    group: "Atendimento",
  },
  customers: {
    label: "Cadastro de clientes",
    description: "Base organizada com histórico de cada cliente.",
    group: "Atendimento",
  },
  feedback: {
    label: "Avaliações e feedback",
    description: "Ouça o cliente e melhore o que importa.",
    group: "Atendimento",
  },
  priority_support: {
    label: "Suporte prioritário",
    description: "Atendimento na frente da fila quando você precisar.",
    group: "Atendimento",
  },
  reports: {
    label: "Relatórios essenciais",
    description: "Visão simples de visitas, resgates e recorrência.",
    group: "Relatórios",
  },
  analytics: {
    label: "Relatórios avançados",
    description: "Métricas detalhadas para decidir com dados.",
    group: "Relatórios",
  },
  multi_unit: {
    label: "Múltiplas unidades",
    description: "Gerencie várias lojas em uma única conta.",
    group: "Gestão",
  },
  api: {
    label: "Integrações e API",
    description: "Conecte a Fidelize aos sistemas que você já usa.",
    group: "Gestão",
  },
  team: {
    label: "Equipe e permissões",
    description: "Vários usuários com acessos separados.",
    group: "Gestão",
  },
};

/** Chaves de recurso por plano — usadas como fallback e para comparar planos. */
export const FIDELIZE_PLAN_FEATURE_KEYS: Record<string, string[]> = {
  starter: ["loyalty_card", "stamps", "digital_menu", "linktree", "customers", "reports"],
  pro: [
    "loyalty_card",
    "stamps",
    "digital_menu",
    "linktree",
    "customers",
    "reports",
    "campaigns",
    "coupons",
    "whatsapp",
    "birthday",
    "analytics",
  ],
  premium: [
    "loyalty_card",
    "stamps",
    "digital_menu",
    "linktree",
    "customers",
    "reports",
    "campaigns",
    "coupons",
    "whatsapp",
    "birthday",
    "analytics",
    "multi_unit",
    "api",
    "team",
    "priority_support",
  ],
};

function titleCase(raw: string) {
  return raw
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Normaliza uma chave crua da API para a chave canônica do catálogo. */
export function canonicalFeatureKey(raw: string): string {
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SYNONYMS[key] ?? key;
}

/** Converte uma chave (conhecida ou não) em um recurso apresentável. */
export function describeFeature(raw: string): FidelizeFeature {
  const key = canonicalFeatureKey(raw);
  const known = CATALOG[key];
  if (known) return { key, ...known };
  return { key, label: titleCase(raw), description: "Recurso incluído no seu plano.", group: "Gestão" };
}

/** Lista de recursos únicos, ordenada por grupo, a partir de chaves cruas. */
export function describeFeatures(keys: readonly string[]): FidelizeFeature[] {
  const seen = new Set<string>();
  const list: FidelizeFeature[] = [];
  for (const raw of keys) {
    if (!raw || typeof raw !== "string") continue;
    const feature = describeFeature(raw);
    if (seen.has(feature.key)) continue;
    seen.add(feature.key);
    list.push(feature);
  }
  return list.sort(
    (a, b) =>
      FIDELIZE_FEATURE_GROUP_ORDER.indexOf(a.group) - FIDELIZE_FEATURE_GROUP_ORDER.indexOf(b.group) ||
      a.label.localeCompare(b.label, "pt-BR"),
  );
}

/** Agrupa recursos por categoria, preservando a ordem canônica dos grupos. */
export function groupFeatures(features: FidelizeFeature[]): { group: FidelizeFeatureGroup; items: FidelizeFeature[] }[] {
  const map = new Map<FidelizeFeatureGroup, FidelizeFeature[]>();
  for (const feature of features) {
    const bucket = map.get(feature.group) ?? [];
    bucket.push(feature);
    map.set(feature.group, bucket);
  }
  return FIDELIZE_FEATURE_GROUP_ORDER.filter((g) => map.has(g)).map((group) => ({
    group,
    items: map.get(group)!,
  }));
}
