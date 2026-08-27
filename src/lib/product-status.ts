/**
 * Status de publicação de cursos e e-books.
 * - draft: rascunho, invisível para alunos
 * - coming_soon: "Em breve" — visível na vitrine, sem compra/matrícula/afiliados
 * - active: publicado, compra liberada
 */
export const PRODUCT_STATUS = {
  draft: "draft",
  comingSoon: "coming_soon",
  active: "active",
} as const;

/** Status visíveis para alunos na vitrine e busca. */
export const VISIBLE_STATUSES = [PRODUCT_STATUS.active, PRODUCT_STATUS.comingSoon];

export function isComingSoon(status?: string | null) {
  return status === PRODUCT_STATUS.comingSoon;
}

/** Somente conteúdos publicados podem ser comprados/matriculados. */
export function isPurchasable(status?: string | null) {
  return status === PRODUCT_STATUS.active;
}

export function statusLabel(status?: string | null) {
  if (status === PRODUCT_STATUS.active) return "PUBLICADO";
  if (status === PRODUCT_STATUS.comingSoon) return "EM BREVE";
  return "RASCUNHO";
}

export const COMING_SOON_NOTICE = "Este conteúdo será lançado em breve.";
