/** Catálogo dos planos da Fidelize (client-safe). */

export type FidelizePlan = "starter" | "pro" | "premium";

export const FIDELIZE_PLANS: FidelizePlan[] = ["starter", "pro", "premium"];

export interface FidelizePlanInfo {
  plan: FidelizePlan;
  label: string;
  /** Preço padrão (pode ser sobrescrito nas configurações da integração). */
  price: number;
  description: string;
  modules: string[];
}

export const FIDELIZE_PLAN_CATALOG: Record<FidelizePlan, FidelizePlanInfo> = {
  starter: {
    plan: "starter",
    label: "Fidelize Starter",
    price: 97,
    description: "Programa de fidelidade essencial para começar a reter clientes.",
    modules: ["Cartão fidelidade digital", "Cadastro de clientes", "Relatórios básicos"],
  },
  pro: {
    plan: "pro",
    label: "Fidelize Pro",
    price: 197,
    description: "Automação de campanhas e recompensas para escalar o delivery.",
    modules: [
      "Cartão fidelidade digital",
      "Cadastro de clientes",
      "Campanhas automáticas",
      "Cupons e recompensas",
      "Relatórios avançados",
    ],
  },
  premium: {
    plan: "premium",
    label: "Fidelize Premium",
    price: 297,
    description: "Plataforma completa com múltiplas unidades e integrações.",
    modules: [
      "Cartão fidelidade digital",
      "Cadastro de clientes",
      "Campanhas automáticas",
      "Cupons e recompensas",
      "Relatórios avançados",
      "Múltiplas unidades",
      "Integrações e API",
      "Suporte prioritário",
    ],
  },
};

export function isFidelizePlan(value: unknown): value is FidelizePlan {
  return typeof value === "string" && (FIDELIZE_PLANS as string[]).includes(value);
}

export function fidelizePlanLabel(plan: string | null | undefined): string {
  return isFidelizePlan(plan) ? FIDELIZE_PLAN_CATALOG[plan].label : "Fidelize";
}
