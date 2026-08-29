/** Mensagens amigáveis para o aluno (client-safe) a partir de erros técnicos da Fidelize. */

export function friendlyFidelizeError(raw?: string | null): string {
  const text = (raw || "").toLowerCase();

  if (!text) return "Não conseguimos concluir a ativação automática da sua conta.";

  if (/already|existe|duplicat|conflict|409/.test(text)) {
    return "Você já possui uma conta na Fidelize com este e-mail. Use o botão “Reenviar acesso” para receber os dados novamente.";
  }
  if (/timeout|tempo limite|abort/.test(text)) {
    return "A Fidelize demorou para responder. Já estamos tentando novamente — se demorar, fale com o suporte.";
  }
  if (/não configurad|not configured|api key|unauthorized|401|403/.test(text)) {
    return "A ativação está temporariamente indisponível. Nossa equipe já foi avisada e vai liberar seu acesso em instantes.";
  }
  if (/network|fetch|econn|dns|offline|502|503|504/.test(text)) {
    return "A Fidelize está fora do ar neste momento. Assim que voltar, sua conta é criada automaticamente.";
  }
  if (/e-?mail|email/.test(text) && /inv[áa]lid/.test(text)) {
    return "O e-mail informado na compra parece inválido. Fale com o suporte para corrigirmos e liberar seu acesso.";
  }

  return "Não conseguimos concluir a ativação automática da sua conta. Nossa equipe já foi avisada e vai resolver para você.";
}

/** Identifica respostas de "conta já existente" da Fidelize. */
export function isFidelizeAlreadyExists(httpCode: number, message?: string | null): boolean {
  if (httpCode === 409) return true;
  const text = (message || "").toLowerCase();
  return /already\s*(exists|registered)|j[áa]\s*(existe|cadastrad|possui)|duplicat|e-?mail\s*em\s*uso|conta\s*existente/.test(
    text,
  );
}
