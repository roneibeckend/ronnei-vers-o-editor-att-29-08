/** Catálogo dos planos da Fidelize (client-safe). */
import coverStarter from "@/assets/fidelize-starter.jpg";
import coverPro from "@/assets/fidelize-pro.jpg";
import coverPremium from "@/assets/fidelize-premium.jpg";

export type FidelizePlan = "starter" | "pro" | "premium";

export const FIDELIZE_PLANS: FidelizePlan[] = ["starter", "pro", "premium"];

export interface FidelizePlanInfo {
  plan: FidelizePlan;
  label: string;
  /** Preço padrão (pode ser sobrescrito nas configurações da integração). */
  price: number;
  description: string;
  modules: string[];
  /** Imagem de capa padrão (pode ser sobrescrita pelo admin). */
  cover: string;
  /** Frase curta de posicionamento exibida sobre a capa. */
  tagline: string;
  /** Destaque visual ("mais vendido"). */
  highlight?: boolean;
}

export const FIDELIZE_PLAN_CATALOG: Record<FidelizePlan, FidelizePlanInfo> = {
  starter: {
    plan: "starter",
    label: "Fidelize Starter",
    price: 97,
    description: "Programa de fidelidade essencial para começar a reter clientes.",
    cover: coverStarter,
    tagline: "Comece a fidelizar",
    modules: ["Cartão fidelidade digital", "Cadastro de clientes", "Relatórios básicos"],
  },
  pro: {
    plan: "pro",
    label: "Fidelize Pro",
    price: 197,
    description: "Automação de campanhas e recompensas para escalar o delivery.",
    cover: coverPro,
    tagline: "O mais escolhido",
    highlight: true,
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
    cover: coverPremium,
    tagline: "Para escalar sem limites",
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
