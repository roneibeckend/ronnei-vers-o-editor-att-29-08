/**
 * Política de presença, falta (no-show) e remarcação das consultorias.
 * Regras puras — sem dependência de servidor, reaproveitadas nos testes.
 */

/** Taxa cobrada a partir da segunda remarcação do mesmo pedido. */
export const RESCHEDULE_FEE_BRL = 29.9;
/** Cortesia: 1 remarcação gratuita por compra/pedido. */
export const FREE_RESCHEDULES_PER_ORDER = 1;
/** Antecedência mínima para o aluno remarcar sozinho um encontro futuro. */
export const RESCHEDULE_LEAD_HOURS = 12;
/** Prazo para pagar a taxa antes de a remarcação pendente cair. */
export const RESCHEDULE_FEE_HOLD_MINUTES = 60;
/** A partir daqui pedimos a confirmação de presença por e-mail. */
export const ATTENDANCE_REQUEST_MIN_AHEAD = 8 * 60;
export const ATTENDANCE_REQUEST_MAX_AHEAD = 24 * 60;
/** Se faltar isso e o aluno não confirmou, o Ronnei é avisado para chamar. */
export const ATTENDANCE_ALERT_AHEAD_MINUTES = 4 * 60;

export function formatFee(value = RESCHEDULE_FEE_BRL) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Quantas remarcações gratuitas ainda restam neste pedido. */
export function freeReschedulesLeft(usedInOrder: number) {
  return Math.max(0, FREE_RESCHEDULES_PER_ORDER - Math.max(0, usedInOrder));
}

/** A próxima remarcação deste pedido é paga? */
export function rescheduleRequiresFee(usedInOrder: number) {
  return freeReschedulesLeft(usedInOrder) === 0;
}

/** Deve pedir confirmação de presença agora? */
export function shouldRequestAttendance(
  row: { scheduled_at: string; attendance_requested_at?: string | null; attendance_confirmed_at?: string | null },
  now: number | Date = Date.now(),
) {
  if (row.attendance_requested_at || row.attendance_confirmed_at) return false;
  const ahead = (+new Date(row.scheduled_at) - (now instanceof Date ? now.getTime() : now)) / 60_000;
  return ahead > ATTENDANCE_REQUEST_MIN_AHEAD && ahead <= ATTENDANCE_REQUEST_MAX_AHEAD;
}

/** Deve alertar o Ronnei para chamar o aluno manualmente? */
export function shouldAlertUnconfirmed(
  row: { scheduled_at: string; attendance_confirmed_at?: string | null },
  now: number | Date = Date.now(),
) {
  if (row.attendance_confirmed_at) return false;
  const ahead = (+new Date(row.scheduled_at) - (now instanceof Date ? now.getTime() : now)) / 60_000;
  return ahead > 0 && ahead <= ATTENDANCE_ALERT_AHEAD_MINUTES;
}
