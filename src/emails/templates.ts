/**
 * Registro central de templates de e-mail (premium, responsivos).
 * Cada template recebe as variáveis dinâmicas do evento e devolve
 * assunto + HTML + texto. Todos são totalmente editáveis por código.
 */
import {
  BRAND,
  LINKS,
  renderEmailLayout,
  renderEmailText,
  type EmailBlock,
  type EmailOptions,
} from "./layout";

export type EmailData = Record<string, any>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const val = (data: EmailData, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const v = data?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
};

const firstName = (data: EmailData) => val(data, ["name", "nome", "first_name", "aluno"], "Churrasqueiro");
const link = (data: EmailData, keys: string[], fallback: string) => val(data, keys, fallback) || fallback;

function build(options: EmailOptions & { subject: string }): RenderedEmail {
  const { subject, ...rest } = options;
  return { subject, html: renderEmailLayout(rest), text: renderEmailText(rest) };
}

type Builder = (data: EmailData) => RenderedEmail;

/* ============================ 1. BOAS-VINDAS ============================ */
const welcome: Builder = (d) =>
  build({
    subject: `🔥 Bem-vindo ao ${BRAND.name}, ${firstName(d)}!`,
    preview: "Sua conta está pronta. Seu acesso já está liberado.",
    heading: "🔥 Bem-vindo ao Ronnei na Veia",
    subheading: "Sua jornada para o churrasco de outro nível começa agora.",
    greeting: `Fala, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Sua conta foi criada com sucesso e seu acesso já está liberado." },
      { type: "text", text: "Prepare-se para aprender, evoluir e elevar seu churrasco para outro nível.", highlight: true },
      {
        type: "checklist",
        title: "Sua conta está pronta!",
        items: [
          "Acesso aos cursos completos",
          "eBooks e materiais exclusivos",
          "Receitas testadas na prática",
          "Bônus e conteúdos exclusivos",
          "Suporte e atualizações constantes",
        ],
      },
    ],
    cta: { label: "Acessar minha área", url: link(d, ["dashboard_url", "link", "access_link"], LINKS.dashboard) },
  });

/* ========================= 2. ACESSO LIBERADO ========================== */
const accessGranted: Builder = (d) =>
  build({
    subject: "✅ Seu acesso foi liberado",
    preview: "Pagamento aprovado — seu conteúdo já está disponível.",
    heading: "✅ Seu acesso foi liberado",
    subheading: "Pagamento aprovado com sucesso.",
    greeting: `Parabéns, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Confirmamos seu pagamento e liberamos o acesso ao seu conteúdo agora mesmo." },
      {
        type: "details",
        title: "Detalhes da compra",
        rows: [
          { label: "Plano / Produto", value: val(d, ["plan", "product_name", "produto", "title"], "Acesso Ronnei na Veia") },
          { label: "Valor pago", value: val(d, ["amount", "valor", "value"], "-") },
          { label: "Data da compra", value: val(d, ["date", "data", "purchase_date"], new Date().toLocaleDateString("pt-BR")) },
        ],
      },
    ],
    cta: { label: "Entrar agora", url: link(d, ["access_link", "link", "dashboard_url"], LINKS.dashboard) },
  });

/* ====================== 3. RECUPERAÇÃO DE SENHA ======================== */
const passwordReset: Builder = (d) =>
  build({
    subject: "🔒 Redefinir senha",
    preview: "Crie uma nova senha para sua conta Ronnei na Veia.",
    heading: "🔒 Redefinir senha",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Recebemos uma solicitação para alterar sua senha." },
      { type: "text", text: "Clique no botão abaixo para criar uma nova senha com segurança." },
      { type: "note", text: "Se não foi você que solicitou, ignore este e-mail — sua senha atual continua ativa." },
    ],
    cta: { label: "Criar nova senha", url: link(d, ["reset_url", "link", "url"], `${BRAND.site}/auth`) },
    footnote: "Este link expira em 60 minutos.",
  });

/* =================== 4. CONFIRMAÇÃO DE PAGAMENTO ======================= */
const paymentApproved: Builder = (d) =>
  build({
    subject: "💳 Pagamento aprovado",
    preview: "Recebemos seu pagamento com sucesso.",
    heading: "💳 Pagamento aprovado",
    greeting: `Obrigado, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Seu pagamento foi confirmado. Veja o resumo da transação:" },
      {
        type: "details",
        title: "Resumo",
        rows: [
          { label: "Produto", value: val(d, ["product_name", "produto", "plan", "title"], "-") },
          { label: "Valor", value: val(d, ["amount", "valor", "value"], "-") },
          { label: "Método de pagamento", value: val(d, ["method", "payment_method", "metodo"], "-") },
          { label: "Data", value: val(d, ["date", "data"], new Date().toLocaleDateString("pt-BR")) },
        ],
      },
    ],
    cta: { label: "Ver detalhes", url: link(d, ["link", "details_url", "access_link"], `${LINKS.dashboard}/perfil`) },
  });

/* ========================= 5. FATURA GERADA =========================== */
const invoiceCreated: Builder = (d) =>
  build({
    subject: "📄 Nova fatura disponível",
    preview: "Sua nova cobrança já está disponível para pagamento.",
    heading: "📄 Nova fatura disponível",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Geramos uma nova cobrança para sua conta." },
      { type: "highlight", title: "Valor da fatura", value: val(d, ["amount", "valor", "value"], "-") },
      {
        type: "details",
        rows: [
          { label: "Vencimento", value: val(d, ["due_date", "vencimento", "date"], "-") },
          { label: "Status", value: val(d, ["status"], "Aguardando pagamento") },
        ],
      },
    ],
    cta: { label: "Pagar fatura", url: link(d, ["invoice_url", "payment_url", "link"], LINKS.dashboard) },
  });

/* ======================== 6. FATURA VENCENDO ========================== */
const invoiceDue: Builder = (d) =>
  build({
    subject: "⚠️ Sua cobrança vence em breve",
    preview: "Evite bloqueio do acesso: sua fatura vence em poucos dias.",
    heading: "⚠️ Sua cobrança vence em breve",
    greeting: `Atenção, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua fatura está próxima do vencimento. Garanta a continuidade do seu acesso." },
      { type: "highlight", title: "Valor", value: val(d, ["amount", "valor", "value"], "-"), hint: `Vence em ${val(d, ["due_date", "vencimento", "date"], "breve")}` },
    ],
    cta: { label: "Pagar agora", url: link(d, ["invoice_url", "payment_url", "link"], LINKS.dashboard) },
  });

/* ======================== 7. FATURA ATRASADA ========================== */
const invoiceOverdue: Builder = (d) =>
  build({
    subject: "🚨 Pagamento pendente",
    preview: "Sua cobrança está vencida — regularize para manter o acesso.",
    heading: "🚨 Pagamento pendente",
    greeting: `${firstName(d)}, sua fatura está vencida`,
    blocks: [
      { type: "text", text: "Identificamos uma cobrança em atraso na sua conta. Regularize agora para manter seu acesso ativo.", highlight: true },
      { type: "highlight", title: "Valor devido", value: val(d, ["amount", "valor", "value"], "-"), hint: `${val(d, ["days_late", "dias_atraso", "days"], "-")} dia(s) em atraso` },
    ],
    cta: { label: "Regularizar agora", url: link(d, ["invoice_url", "payment_url", "link"], LINKS.dashboard) },
  });

/* ======================= 8. NOVO EBOOK LIBERADO ======================= */
const newEbook: Builder = (d) =>
  build({
    subject: `📚 Novo material liberado: ${val(d, ["title", "ebook_name", "product_name"], "eBook exclusivo")}`,
    preview: "Um novo eBook acabou de entrar na sua área de membros.",
    heading: "📚 Novo material liberado",
    greeting: `Boas notícias, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: `Acabamos de liberar o eBook <strong>${val(d, ["title", "ebook_name", "product_name"], "novo material")}</strong> na sua área.` },
      { type: "quote", text: val(d, ["description", "descricao", "resumo"], "Conteúdo prático para você aplicar no seu churrasco hoje mesmo.") },
    ],
    cta: { label: "Acessar conteúdo", url: link(d, ["link", "access_link"], `${LINKS.dashboard}/ebooks`) },
  });

/* ====================== 9. NOVO CURSO DISPONÍVEL ====================== */
const newCourse: Builder = (d) =>
  build({
    subject: `🎓 Novo curso disponível: ${val(d, ["title", "course_name", "product_name"], "conteúdo novo")}`,
    preview: "Um novo curso acabou de ser publicado para você.",
    heading: "🎓 Novo curso disponível",
    greeting: `Chegou conteúdo novo, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: `O curso <strong>${val(d, ["title", "course_name", "product_name"], "novo curso")}</strong> já está publicado na sua área de membros.` },
      { type: "quote", text: val(d, ["description", "descricao", "resumo"], "Aulas diretas ao ponto para você evoluir na prática.") },
    ],
    cta: { label: "Começar agora", url: link(d, ["link", "access_link"], `${LINKS.dashboard}/cursos`) },
  });

/* ==================== 10. COMISSÃO DE AFILIADO ======================== */
const affiliateCommission: Builder = (d) =>
  build({
    subject: "💰 Nova comissão recebida",
    preview: "Você acabou de gerar uma nova venda como afiliado.",
    heading: "💰 Nova comissão recebida",
    greeting: `Parabéns, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Uma nova venda foi registrada com o seu link de afiliado." },
      { type: "highlight", title: "Comissão gerada", value: val(d, ["commission", "comissao", "commission_amount"], "-") },
      {
        type: "details",
        rows: [
          { label: "Produto", value: val(d, ["product_name", "produto", "title"], "-") },
          { label: "Valor da venda", value: val(d, ["amount", "sale_amount", "valor"], "-") },
          { label: "Data", value: val(d, ["date", "data"], new Date().toLocaleDateString("pt-BR")) },
        ],
      },
    ],
    cta: { label: "Ver comissões", url: link(d, ["link"], `${LINKS.dashboard}/afiliados`) },
  });

/* ================= 11. SOLICITAÇÃO DE SAQUE APROVADA ================== */
const withdrawApproved: Builder = (d) =>
  build({
    subject: "✅ Seu saque foi aprovado",
    preview: "Seu saque foi aprovado e está sendo processado.",
    heading: "✅ Seu saque foi aprovado",
    greeting: `Boa, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Sua solicitação de saque foi aprovada e será processada via PIX." },
      { type: "highlight", title: "Valor aprovado", value: val(d, ["amount", "valor", "value"], "-") },
      {
        type: "details",
        rows: [
          { label: "Chave PIX", value: val(d, ["pix_key", "pix"], "-") },
          { label: "Data", value: val(d, ["date", "data"], new Date().toLocaleDateString("pt-BR")) },
        ],
      },
    ],
    cta: { label: "Ver extrato", url: link(d, ["link"], `${LINKS.dashboard}/afiliados/saques`) },
  });

/* ======================== 12. CONTATO/SUPORTE ========================= */
const supportReply: Builder = (d) =>
  build({
    subject: "📩 Resposta da equipe",
    preview: "Nossa equipe respondeu seu atendimento.",
    heading: "📩 Resposta da equipe",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua solicitação de suporte recebeu uma nova resposta." },
      { type: "quote", text: val(d, ["message", "mensagem", "summary", "resumo"], "Abra o atendimento para ler a resposta completa.") },
      ...(val(d, ["ticket_id", "protocolo"])
        ? ([{ type: "details", rows: [{ label: "Protocolo", value: val(d, ["ticket_id", "protocolo"]) }] }] as EmailBlock[])
        : []),
    ],
    cta: { label: "Ver resposta", url: link(d, ["link", "ticket_url"], `${LINKS.dashboard}/suporte`) },
  });

/* ================= EXTRAS já usados pela plataforma ================== */
const emailConfirmation: Builder = (d) =>
  build({
    subject: "🔐 Seu código de confirmação",
    preview: "Use o código para confirmar seu e-mail.",
    heading: "🔐 Confirme seu e-mail",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Use o código abaixo para confirmar seu cadastro:" },
      { type: "highlight", title: "Código de confirmação", value: val(d, ["code", "codigo"], "------"), hint: "Válido por 15 minutos" },
      { type: "note", text: "Se não foi você, ignore este e-mail." },
    ],
  });

const payoutRequested: Builder = (d) =>
  build({
    subject: "📤 Recebemos sua solicitação de saque",
    preview: "Sua solicitação de saque entrou na fila de análise.",
    heading: "📤 Solicitação de saque recebida",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Recebemos sua solicitação e ela já está na fila de análise." },
      { type: "highlight", title: "Valor solicitado", value: val(d, ["amount", "valor"], "-") },
      { type: "details", rows: [{ label: "Chave PIX", value: val(d, ["pix_key"], "-") }, { label: "Data", value: val(d, ["date"], "-") }] },
    ],
    cta: { label: "Ver extrato", url: link(d, ["link"], `${LINKS.dashboard}/afiliados/saques`) },
  });

const payoutAnalyzing: Builder = (d) =>
  build({
    subject: "🔎 Seu saque está em análise",
    preview: "Estamos analisando sua solicitação de saque.",
    heading: "🔎 Saque em análise",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua solicitação está em análise pela nossa equipe financeira." },
      { type: "highlight", title: "Valor", value: val(d, ["amount", "valor"], "-") },
    ],
    cta: { label: "Ver extrato", url: link(d, ["link"], `${LINKS.dashboard}/afiliados/saques`) },
  });

const payoutPaid: Builder = (d) =>
  build({
    subject: "🏦 Seu saque foi pago",
    preview: "O valor do seu saque já foi enviado via PIX.",
    heading: "🏦 Saque pago",
    greeting: `Boa, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "O valor do seu saque foi transferido via PIX." },
      { type: "highlight", title: "Valor pago", value: val(d, ["amount", "valor"], "-") },
      { type: "details", rows: [{ label: "Chave PIX", value: val(d, ["pix_key"], "-") }, { label: "Data", value: val(d, ["date"], "-") }] },
    ],
    cta: { label: "Ver extrato", url: link(d, ["link"], `${LINKS.dashboard}/afiliados/saques`) },
  });

const payoutRejected: Builder = (d) =>
  build({
    subject: "❌ Sua solicitação de saque foi recusada",
    preview: "Sua solicitação de saque não pôde ser aprovada.",
    heading: "❌ Saque recusado",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Não foi possível aprovar sua solicitação de saque. O valor retornou ao seu saldo." },
      { type: "details", rows: [{ label: "Valor", value: val(d, ["amount", "valor"], "-") }, { label: "Motivo", value: val(d, ["reason"], "-") }] },
    ],
    cta: { label: "Falar com o suporte", url: LINKS.support },
  });

const payoutAdminNew: Builder = (d) =>
  build({
    subject: "🔔 Nova solicitação de saque",
    preview: "Um usuário solicitou um saque e aguarda análise.",
    heading: "🔔 Nova solicitação de saque",
    blocks: [
      { type: "text", text: "Uma nova solicitação de saque aguarda análise no painel." },
      {
        type: "details",
        title: "Solicitante",
        rows: [
          { label: "Nome", value: val(d, ["name"], "-") },
          { label: "E-mail", value: val(d, ["email"], "-") },
          { label: "Valor", value: val(d, ["amount"], "-") },
          { label: "Chave PIX", value: val(d, ["pix_key"], "-") },
          { label: "Data", value: val(d, ["date"], "-") },
        ],
      },
    ],
    cta: { label: "Abrir painel", url: link(d, ["link"], `${BRAND.site}/admin/financeiro`) },
  });

const liveClass: Builder = (d) =>
  build({
    subject: `🎥 Nova aula ao vivo: ${val(d, ["title"], "não perca!")}`,
    preview: "Uma nova aula ao vivo foi agendada.",
    heading: "🎥 Nova aula ao vivo",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: `A aula <strong>${val(d, ["title"], "ao vivo")}</strong> foi agendada. Anote na agenda!` },
      { type: "details", rows: [{ label: "Data e horário", value: val(d, ["date", "data"], "-") }] },
    ],
    cta: { label: "Ver aula", url: link(d, ["link", "access_link"], `${LINKS.dashboard}/aulas-ao-vivo`) },
  });

/* ============ EXTRAS: conclusão, certificado, novo conteúdo ============ */
const courseCompleted: Builder = (d) =>
  build({
    subject: `🏆 Parabéns! Você concluiu ${val(d, ["title", "course_name", "product_name"], "seu treinamento")}`,
    preview: "Treinamento concluído com sucesso.",
    heading: "🏆 Treinamento concluído",
    greeting: `Parabéns, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: `Você concluiu <strong>${val(d, ["title", "course_name", "product_name"], "o treinamento")}</strong>. Excelente trabalho!` },
      { type: "text", text: "Continue evoluindo: novos conteúdos são liberados constantemente na sua área.", highlight: true },
    ],
    cta: { label: "Ver meu certificado", url: link(d, ["link", "certificate_url"], `${LINKS.dashboard}/certificados`) },
  });

const certificateIssued: Builder = (d) =>
  build({
    subject: "📜 Seu certificado está disponível",
    preview: "Seu certificado foi emitido e já pode ser baixado.",
    heading: "📜 Certificado emitido",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Seu certificado foi emitido com sucesso." },
      {
        type: "details",
        title: "Dados do certificado",
        rows: [
          { label: "Treinamento", value: val(d, ["title", "course_name", "product_name"], "-") },
          { label: "Carga horária", value: val(d, ["hours", "workload_hours", "carga_horaria"], "-") },
          { label: "Emissão", value: val(d, ["date", "data"], new Date().toLocaleDateString("pt-BR")) },
        ],
      },
    ],
    cta: { label: "Baixar certificado", url: link(d, ["link", "certificate_url"], `${LINKS.dashboard}/certificados`) },
  });

const newContent: Builder = (d) =>
  build({
    subject: val(d, ["subject"], `✨ Novo conteúdo liberado: ${val(d, ["title"], "confira agora")}`),
    preview: "Um novo conteúdo acabou de entrar na sua área de membros.",
    heading: val(d, ["heading"], "✨ Novo conteúdo liberado"),
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: val(d, ["message", "mensagem", "html", "body"], `Liberamos <strong>${val(d, ["title", "product_name"], "um novo conteúdo")}</strong> na sua área de membros.`) },
      ...(val(d, ["description", "descricao"]) ? ([{ type: "quote", text: val(d, ["description", "descricao"]) }] as EmailBlock[]) : []),
    ],
    cta: { label: "Acessar conteúdo", url: link(d, ["link", "access_link"], LINKS.dashboard) },
  });

const supportReceived: Builder = (d) =>
  build({
    subject: "📩 Recebemos sua mensagem",
    preview: "Sua solicitação de suporte foi registrada.",
    heading: "📩 Recebemos sua mensagem",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Registramos sua solicitação e nossa equipe responderá em breve." },
      { type: "quote", text: val(d, ["message", "mensagem", "summary"], "Você será avisado por e-mail assim que houver resposta.") },
      ...(val(d, ["ticket_id", "protocolo"])
        ? ([{ type: "details", rows: [{ label: "Protocolo", value: val(d, ["ticket_id", "protocolo"]) }] }] as EmailBlock[])
        : []),
    ],
    cta: { label: "Acompanhar atendimento", url: link(d, ["link", "ticket_url"], `${LINKS.dashboard}/suporte`) },
  });

/* ========================= CONSULTORIAS ========================= */
const consultationRows = (d: EmailData) => [
  { label: "Consultoria", value: val(d, ["title"], "-") },
  { label: "Data e horário", value: `${val(d, ["date", "data"], "-")} (horário de Brasília)` },
  { label: "Duração", value: val(d, ["duration"], "-") },
];

const consultationConfirmed: Builder = (d) =>
  build({
    subject: `✅ Consultoria confirmada — ${val(d, ["date", "data"], "veja os detalhes")}`,
    preview: "Sua consultoria está agendada. Guarde o link da reunião.",
    heading: "✅ Consultoria confirmada",
    subheading: "Sua conversa com o Ronnei está na agenda.",
    greeting: `Fala, ${firstName(d)}!`,
    blocks: [
      { type: "text", text: "Recebemos seu agendamento e a reunião já está confirmada na agenda." },
      { type: "details", title: "Detalhes da reunião", rows: consultationRows(d) },
      {
        type: "checklist",
        title: "Para aproveitar ao máximo",
        items: [
          "Entre pelo link do Google Meet no horário marcado",
          "Tenha seus números em mãos (custos, preços, volume de vendas)",
          "Mantenha seu briefing atualizado na plataforma",
          "Use fones de ouvido e um lugar silencioso",
        ],
      },
    ],
    cta: { label: "Entrar na reunião (Google Meet)", url: link(d, ["meet_link", "link"], LINKS.dashboard) },
  });

const consultationReminder8h: Builder = (d) =>
  build({
    subject: `⏰ Sua consultoria é hoje — ${val(d, ["date", "data"], "confira o horário")}`,
    preview: "Faltam poucas horas para a sua consultoria.",
    heading: "⏰ Falta pouco para a sua consultoria",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua consultoria acontece em <strong>menos de 8 horas</strong>. Já deixe tudo pronto." },
      { type: "details", title: "Detalhes da reunião", rows: consultationRows(d) },
      ...(d?.briefing_pending
        ? ([
            {
              type: "text",
              text: "⚠️ Seu <strong>briefing ainda não foi enviado</strong>. Preencha agora na plataforma para o Ronnei chegar preparado.",
              highlight: true,
            },
          ] as EmailBlock[])
        : []),
    ],
    cta: { label: "Entrar na reunião", url: link(d, ["meet_link", "link"], LINKS.dashboard) },
  });

const consultationReminder1h: Builder = (d) =>
  build({
    subject: "🔥 Sua consultoria começa em 1 hora",
    preview: "Sua consultoria começa em 1 hora. Link da reunião aqui.",
    heading: "🔥 Começa em 1 hora",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua consultoria começa em aproximadamente <strong>1 hora</strong>." },
      { type: "details", rows: consultationRows(d) },
      { type: "text", text: "Teste câmera e microfone antes de entrar para não perder tempo.", highlight: true },
    ],
    cta: { label: "Entrar na reunião", url: link(d, ["meet_link", "link"], LINKS.dashboard) },
  });

const consultationRecording: Builder = (d) =>
  build({
    subject: "🎬 A gravação da sua consultoria está disponível",
    preview: "Assista quantas vezes quiser a gravação da sua consultoria.",
    heading: "🎬 Gravação disponível",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "A gravação da sua consultoria já está disponível para assistir quando quiser." },
      { type: "details", rows: consultationRows(d) },
      { type: "text", text: "Reveja os pontos combinados e coloque o plano de ação em prática.", highlight: true },
    ],
    cta: { label: "Assistir gravação", url: link(d, ["recording_url", "link"], LINKS.dashboard) },
  });

const consultationReminder24h: Builder = (d) =>
  build({
    subject: `📅 Sua consultoria é amanhã — ${val(d, ["date", "data"], "confira o horário")}`,
    preview: "Falta 1 dia para a sua consultoria.",
    heading: "📅 Sua consultoria é amanhã",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua consultoria acontece em <strong>aproximadamente 24 horas</strong>." },
      { type: "details", title: "Detalhes da reunião", rows: consultationRows(d) },
      ...(d?.briefing_pending
        ? ([
            {
              type: "text",
              text: "⚠️ Seu <strong>briefing ainda não foi enviado</strong>. Preencha hoje para o Ronnei chegar preparado.",
              highlight: true,
            },
          ] as EmailBlock[])
        : []),
    ],
    cta: { label: "Ver minha consultoria", url: link(d, ["link", "meet_link"], LINKS.dashboard) },
  });

const consultationCompleted: Builder = (d) =>
  build({
    subject: "✅ Consultoria concluída — materiais liberados",
    preview: "Veja o resumo, os materiais e a gravação da sua consultoria.",
    heading: "✅ Consultoria concluída",
    greeting: `Olá, ${firstName(d)}`,
    blocks: [
      { type: "text", text: "Sua consultoria foi concluída. Obrigado pela conversa!" },
      { type: "details", rows: consultationRows(d) },
      {
        type: "text",
        text: d?.has_recording
          ? "A <strong>gravação</strong> e os <strong>materiais complementares</strong> já estão liberados na plataforma."
          : "Os <strong>materiais complementares</strong> e as observações do Ronnei já estão liberados na plataforma.",
        highlight: true,
      },
    ],
    cta: { label: "Abrir minhas consultorias", url: `${LINKS.dashboard}/minhas-consultorias` },
  });

/** Nomes canônicos + aliases usados no código atual da plataforma. */
export const EMAIL_TEMPLATES: Record<string, Builder> = {
  consultoria_confirmada: consultationConfirmed,
  consultation_confirmed: consultationConfirmed,
  consultoria_lembrete_24h: consultationReminder24h,
  consultoria_lembrete_8h: consultationReminder8h,
  consultoria_lembrete_1h: consultationReminder1h,
  consultoria_gravacao: consultationRecording,
  consultation_recording: consultationRecording,
  consultoria_concluida: consultationCompleted,
  consultation_completed: consultationCompleted,


  welcome,
  boas_vindas: welcome,
  access_granted: accessGranted,
  acesso_liberado: accessGranted,
  course_access: accessGranted,
  ebook_access: accessGranted,
  password_reset: passwordReset,
  recuperacao_senha: passwordReset,
  payment_approved: paymentApproved,
  pagamento_confirmado: paymentApproved,
  invoice_created: invoiceCreated,
  fatura_gerada: invoiceCreated,
  invoice_due: invoiceDue,
  fatura_vencendo: invoiceDue,
  invoice_overdue: invoiceOverdue,
  fatura_atrasada: invoiceOverdue,
  new_ebook: newEbook,
  novo_ebook: newEbook,
  new_course: newCourse,
  novo_curso: newCourse,
  affiliate_commission: affiliateCommission,
  comissao_afiliado: affiliateCommission,
  withdraw_approved: withdrawApproved,
  saque_aprovado: withdrawApproved,
  support_reply: supportReply,
  suporte_resposta: supportReply,
  confirmacao_email: emailConfirmation,
  email_confirmation: emailConfirmation,
  saque_solicitado: payoutRequested,
  payout_requested: payoutRequested,
  saque_em_analise: payoutAnalyzing,
  payout_analyzing: payoutAnalyzing,
  saque_pago: payoutPaid,
  payout_paid: payoutPaid,
  saque_recusado: payoutRejected,
  payout_rejected: payoutRejected,
  saque_admin_novo: payoutAdminNew,
  nova_aula_ao_vivo: liveClass,
  live_class: liveClass,
  aula_ao_vivo: liveClass,
  acesso_liberado_produto: accessGranted,
  conclusao_curso: courseCompleted,
  course_completed: courseCompleted,
  certificado_emitido: certificateIssued,
  certificate_issued: certificateIssued,
  novo_conteudo: newContent,
  new_content: newContent,
  suporte_recebido: supportReceived,
  support_received: supportReceived,
  contato_suporte: supportReply,
};

export function hasEmailTemplate(event: string) {
  return Boolean(EMAIL_TEMPLATES[event]);
}

/** Renderiza um template pelo nome do evento. */
export function renderEmailTemplate(event: string, data: EmailData = {}): RenderedEmail | null {
  const builder = EMAIL_TEMPLATES[event];
  return builder ? builder(data) : null;
}

/** Lista para preview/testes de renderização. */
export const EMAIL_TEMPLATE_LIST = [
  "welcome",
  "access_granted",
  "password_reset",
  "payment_approved",
  "invoice_created",
  "invoice_due",
  "invoice_overdue",
  "new_ebook",
  "new_course",
  "affiliate_commission",
  "withdraw_approved",
  "support_reply",
] as const;
