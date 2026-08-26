import { useAuth } from "./use-auth";
import { useEnrollments } from "./use-enrollments";

/**
 * Define se o usuário tem acesso liberado aos recursos exclusivos
 * (materiais, notificações e aulas ao vivo).
 * Somente quem possui alguma compra/matrícula — ou equipe interna — libera.
 */
export function useHasPurchase() {
  const { user, isAdmin, isManager, isAgent, isLoading: isLoadingAuth } = useAuth();
  const { courseEnrollments, ebookEnrollments, isLoading: isLoadingEnrollments } = useEnrollments();

  const isStaff = isAdmin || isManager || isAgent;
  const hasEnrollment = courseEnrollments.length > 0 || ebookEnrollments.length > 0;

  return {
    hasPurchase: !!user && (isStaff || hasEnrollment),
    isLoading: isLoadingAuth || isLoadingEnrollments,
  };
}
