/**
 * Catálogo de eventos de e-mail do sistema.
 * Define, para cada evento: rótulo, categoria, campos obrigatórios
 * (com aliases aceitos) e um exemplo de dados reais para prévia/teste.
 *
 * Este catálogo é a fonte da verdade da validação: nenhum e-mail é enviado
 * sem todos os campos obrigatórios preenchidos (evita e-mails incompletos).
 */

export type EmailFieldKind = "text" | "url" | "money" | "date" | "email" | "long";

export interface EmailField {
  /** Chave canônica usada no template. */
  key: string;
  label: string;
  kind: EmailFieldKind;
  required: boolean;
  /** Outras chaves aceitas pelo template para o mesmo dado. */
  aliases?: string[];
  sample: string;
}

export interface EmailCatalogEntry {
  event: string;
  label: string;
  category: "Conta" | "Acesso" | "Financeiro" | "Conteúdo" | "Afiliados" | "Suporte";
  description: string;
  fields: EmailField[];
}

const DASHBOARD = "https://ronneinaveia.com.br/app";
const today = () => new Date().toLocaleDateString("pt-BR");

const f = (
  key: string,
  label: string,
  kind: EmailFieldKind,
  sample: string,
  required = true,
  aliases: string[] = [],
): EmailField => ({ key, label, kind, sample, required, aliases });

const NAME = () => f("name", "Nome do aluno", "text", "João Silva", true, ["nome", "first_name", "aluno"]);
const DASH = (url = DASHBOARD) =>
  f("dashboard_url", "URL do painel", "url", url, true, ["link", "access_link", "url"]);

export const EMAIL_CATALOG: EmailCatalogEntry[] = [
  {
    event: "welcome",
    label: "Boas-vindas",
    category: "Conta",
    description: "Enviado após a criação da conta do aluno.",
    fields: [NAME(), DASH()],
  },
  {
    event: "email_confirmation",
    label: "Confirmação de e-mail",
    category: "Conta",
    description: "Código de 6 dígitos para confirmar o cadastro.",
    fields: [NAME(), f("code", "Código de confirmação", "text", "482913", true, ["codigo"])],
  },
  {
    event: "password_reset",
    label: "Recuperação de senha",
    category: "Conta",
    description: "Link seguro para criar nova senha.",
    fields: [
      NAME(),
      f("reset_url", "URL de redefinição", "url", "https://ronneinaveia.com.br/auth?type=recovery", true, ["link", "url"]),
    ],
  },
  {
    event: "access_granted",
    label: "Acesso liberado",
    category: "Acesso",
    description: "Pagamento aprovado e conteúdo liberado.",
    fields: [
      NAME(),
      f("product_name", "Produto / Plano", "text", "Curso Churrasco Profissional", true, ["plan", "produto", "title"]),
      f("amount", "Valor pago", "money", "R$ 297,00", true, ["valor", "value"]),
      f("date", "Data da compra", "date", today(), true, ["data", "purchase_date"]),
      f("access_link", "URL de acesso", "url", `${DASHBOARD}/cursos`, true, ["link", "dashboard_url"]),
    ],
  },
  {
    event: "payment_approved",
    label: "Pagamento aprovado",
    category: "Financeiro",
    description: "Confirmação de transação com resumo.",
    fields: [
      NAME(),
      f("product_name", "Produto", "text", "eBook 0 aos 10k", true, ["produto", "plan", "title"]),
      f("amount", "Valor", "money", "R$ 97,00", true, ["valor", "value"]),
      f("method", "Forma de pagamento", "text", "PIX", true, ["payment_method", "metodo"]),
      f("date", "Data", "date", today(), true, ["data"]),
      f("link", "URL de detalhes", "url", `${DASHBOARD}/perfil`, true, ["details_url", "access_link"]),
    ],
  },
  {
    event: "invoice_created",
    label: "Fatura gerada",
    category: "Financeiro",
    description: "Nova cobrança disponível para pagamento.",
    fields: [
      NAME(),
      f("amount", "Valor da fatura", "money", "R$ 197,00", true, ["valor", "value"]),
      f("due_date", "Vencimento", "date", today(), true, ["vencimento", "date"]),
      f("invoice_url", "URL da fatura", "url", "https://www.asaas.com/i/exemplo123", true, ["payment_url", "link"]),
      f("status", "Status", "text", "Aguardando pagamento", false),
    ],
  },
  {
    event: "invoice_due",
    label: "Fatura vencendo",
    category: "Financeiro",
    description: "Aviso de vencimento próximo.",
    fields: [
      NAME(),
      f("amount", "Valor", "money", "R$ 197,00", true, ["valor", "value"]),
      f("due_date", "Vencimento", "date", today(), true, ["vencimento", "date"]),
      f("invoice_url", "URL da fatura", "url", "https://www.asaas.com/i/exemplo123", true, ["payment_url", "link"]),
    ],
  },
  {
    event: "invoice_overdue",
    label: "Fatura atrasada",
    category: "Financeiro",
    description: "Cobrança vencida — regularização.",
    fields: [
      NAME(),
      f("amount", "Valor devido", "money", "R$ 197,00", true, ["valor", "value"]),
      f("days_late", "Dias em atraso", "text", "3", true, ["dias_atraso", "days"]),
      f("invoice_url", "URL da fatura", "url", "https://www.asaas.com/i/exemplo123", true, ["payment_url", "link"]),
    ],
  },
  {
    event: "new_ebook",
    label: "Novo eBook liberado",
    category: "Conteúdo",
    description: "Novo material publicado na área de membros.",
    fields: [
      NAME(),
      f("title", "Título do eBook", "text", "Guia de Temperos e Marinadas", true, ["ebook_name", "product_name"]),
      f("description", "Descrição curta", "long", "12 marinadas testadas para carnes nobres e cortes do dia a dia.", false, ["descricao"]),
      f("link", "URL do conteúdo", "url", `${DASHBOARD}/ebooks`, true, ["access_link"]),
    ],
  },
  {
    event: "new_course",
    label: "Novo curso disponível",
    category: "Conteúdo",
    description: "Novo treinamento publicado.",
    fields: [
      NAME(),
      f("title", "Título do curso", "text", "Costela na Brasa do Zero", true, ["course_name", "product_name"]),
      f("description", "Descrição curta", "long", "Aulas práticas do preparo ao ponto ideal da costela.", false, ["descricao"]),
      f("link", "URL do curso", "url", `${DASHBOARD}/cursos`, true, ["access_link"]),
    ],
  },
  {
    event: "course_completed",
    label: "Conclusão de treinamento",
    category: "Conteúdo",
    description: "Parabenização por concluir o curso.",
    fields: [
      NAME(),
      f("title", "Treinamento", "text", "Costela na Brasa do Zero", true, ["course_name", "product_name"]),
      f("link", "URL do certificado", "url", `${DASHBOARD}/certificados`, true, ["certificate_url"]),
    ],
  },
  {
    event: "certificate_issued",
    label: "Certificado emitido",
    category: "Conteúdo",
    description: "Certificado disponível para download.",
    fields: [
      NAME(),
      f("title", "Treinamento", "text", "Costela na Brasa do Zero", true, ["course_name", "product_name"]),
      f("hours", "Carga horária", "text", "12 horas", true, ["workload_hours", "carga_horaria"]),
      f("date", "Data de emissão", "date", today(), true, ["data"]),
      f("link", "URL do certificado", "url", `${DASHBOARD}/certificados`, true, ["certificate_url"]),
    ],
  },
  {
    event: "affiliate_commission",
    label: "Comissão de afiliado",
    category: "Afiliados",
    description: "Nova venda registrada pelo link do afiliado.",
    fields: [
      NAME(),
      f("commission", "Comissão gerada", "money", "R$ 89,10", true, ["comissao", "commission_amount"]),
      f("amount", "Valor da venda", "money", "R$ 297,00", true, ["valor", "value"]),
      f("product_name", "Produto vendido", "text", "Curso Churrasco Profissional", true, ["produto", "title"]),
      f("date", "Data da venda", "date", today(), true, ["data"]),
      f("link", "URL do painel de afiliado", "url", `${DASHBOARD}/afiliados`, true, ["dashboard_url"]),
    ],
  },
  {
    event: "payout_requested",
    label: "Saque solicitado",
    category: "Afiliados",
    description: "Solicitação de saque recebida.",
    fields: [
      NAME(),
      f("amount", "Valor solicitado", "money", "R$ 450,00", true, ["valor"]),
      f("pix_key", "Chave PIX", "text", "joao@email.com", true, ["pix"]),
      f("date", "Data da solicitação", "date", today(), true, ["data"]),
      f("link", "URL do extrato", "url", `${DASHBOARD}/afiliados/saques`, true),
    ],
  },
  {
    event: "payout_paid",
    label: "Saque pago",
    category: "Afiliados",
    description: "Transferência PIX concluída.",
    fields: [
      NAME(),
      f("amount", "Valor pago", "money", "R$ 450,00", true, ["valor"]),
      f("pix_key", "Chave PIX", "text", "joao@email.com", true, ["pix"]),
      f("date", "Data do pagamento", "date", today(), true, ["data"]),
      f("link", "URL do extrato", "url", `${DASHBOARD}/afiliados/saques`, true),
    ],
  },
  {
    event: "payout_rejected",
    label: "Saque recusado",
    category: "Afiliados",
    description: "Solicitação recusada com motivo.",
    fields: [
      NAME(),
      f("amount", "Valor", "money", "R$ 450,00", true, ["valor"]),
      f("reason", "Motivo da recusa", "long", "Documento de identificação ilegível.", true, ["motivo"]),
    ],
  },
  {
    event: "support_received",
    label: "Suporte recebido",
    category: "Suporte",
    description: "Confirmação de abertura de atendimento.",
    fields: [
      NAME(),
      f("message", "Resumo da mensagem", "long", "Não consigo acessar o módulo 2 do curso.", true, ["mensagem", "summary"]),
      f("ticket_id", "Protocolo", "text", "TCK-10482", false, ["protocolo"]),
      f("link", "URL do atendimento", "url", `${DASHBOARD}/suporte`, true, ["ticket_url"]),
    ],
  },
  {
    event: "support_reply",
    label: "Resposta do suporte",
    category: "Suporte",
    description: "Nova resposta da equipe no atendimento.",
    fields: [
      NAME(),
      f("message", "Resposta da equipe", "long", "Liberamos o módulo 2 na sua conta. Pode acessar agora!", true, ["mensagem", "summary"]),
      f("ticket_id", "Protocolo", "text", "TCK-10482", false, ["protocolo"]),
      f("link", "URL do atendimento", "url", `${DASHBOARD}/suporte`, true, ["ticket_url"]),
    ],
  },
  {
    event: "live_class",
    label: "Aula ao vivo agendada",
    category: "Conteúdo",
    description: "Aviso de nova aula ao vivo.",
    fields: [
      NAME(),
      f("title", "Título da aula", "text", "Live: Cortes Nobres na Prática", true),
      f("date", "Data e horário", "date", `${today()} às 20h`, true, ["data"]),
      f("link", "URL da aula", "url", `${DASHBOARD}/aulas-ao-vivo`, true, ["access_link"]),
    ],
  },
  {
    event: "fidelize_access",
    label: "Acesso à Fidelize liberado",
    category: "Acesso",
    description: "Conta criada automaticamente na Fidelize após o pagamento aprovado.",
    fields: [
      NAME(),
      f("plan", "Plano contratado", "text", "Fidelize Pro", true, ["plano", "product_name"]),
      f("login", "Login", "email", "joao@email.com", true, ["email"]),
      f("temporary_password", "Senha temporária", "text", "Fd8x2Kq1", true, ["senha_temporaria"]),
      f("login_url", "Link de acesso", "url", "https://app.fidelize.com.br/login", true, ["link", "url"]),
      f("modules", "Módulos liberados", "text", "Cartão fidelidade, Campanhas, Relatórios", false, ["modulos"]),
    ],
  },
];

export const EMAIL_CATALOG_MAP: Record<string, EmailCatalogEntry> = Object.fromEntries(
  EMAIL_CATALOG.map((entry) => [entry.event, entry]),
);

/** Aliases de eventos → evento canônico do catálogo. */
export const EVENT_ALIASES: Record<string, string> = {
  boas_vindas: "welcome",
  acesso_liberado: "access_granted",
  acesso_liberado_produto: "access_granted",
  course_access: "access_granted",
  ebook_access: "access_granted",
  recuperacao_senha: "password_reset",
  pagamento_confirmado: "payment_approved",
  fatura_gerada: "invoice_created",
  fatura_vencendo: "invoice_due",
  fatura_atrasada: "invoice_overdue",
  novo_ebook: "new_ebook",
  novo_curso: "new_course",
  comissao_afiliado: "affiliate_commission",
  conclusao_curso: "course_completed",
  certificado_emitido: "certificate_issued",
  suporte_recebido: "support_received",
  contato_suporte: "support_reply",
  saque_solicitado: "payout_requested",
  saque_pago: "payout_paid",
  saque_recusado: "payout_rejected",
  aula_ao_vivo: "live_class",
  confirmacao_email: "email_confirmation",
};

export function resolveCatalogEntry(event: string): EmailCatalogEntry | null {
  const canonical = EMAIL_CATALOG_MAP[event] ? event : EVENT_ALIASES[event];
  return canonical ? (EMAIL_CATALOG_MAP[canonical] ?? null) : null;
}

const isFilled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

export interface EmailValidationResult {
  valid: boolean;
  /** Rótulos amigáveis dos campos ausentes. */
  missing: { key: string; label: string }[];
  message?: string;
}

/**
 * Valida os dados de um evento contra o catálogo.
 * Eventos fora do catálogo são considerados válidos (não há contrato definido).
 */
export function validateEmailData(event: string, data: Record<string, any> = {}): EmailValidationResult {
  const entry = resolveCatalogEntry(event);
  if (!entry) return { valid: true, missing: [] };

  const missing = entry.fields
    .filter((field) => field.required)
    .filter((field) => ![field.key, ...(field.aliases ?? [])].some((k) => isFilled(data[k])))
    .map((field) => ({ key: field.key, label: field.label }));

  if (missing.length === 0) return { valid: true, missing: [] };

  return {
    valid: false,
    missing,
    message: `E-mail "${entry.label}" bloqueado: campos obrigatórios ausentes — ${missing
      .map((m) => `${m.label} (${m.key})`)
      .join(", ")}.`,
  };
}

/** Dados de exemplo (variáveis reais) para prévia e envio de teste. */
export function sampleDataFor(event: string): Record<string, string> {
  const entry = resolveCatalogEntry(event);
  if (!entry) return {};
  return Object.fromEntries(entry.fields.map((field) => [field.key, field.sample]));
}
