import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GraduationCap,
  Video,
  Calendar,
  MonitorPlay,
  HardDrive,
  BookOpen,
  Users,
  Mail,
  Shield,
  FileText,
  ExternalLink,
  CheckCircle,
} from "lucide-react";

const SITE_URL = "https://ronneinv.lovable.app";

export const Route = createFileRoute("/google")({
  head: () => ({
    meta: [
      { title: "Ronnei na Veia" },
      {
        name: "description",
        content:
          "Plataforma de cursos, e-books, consultorias, comunidade, fidelização de clientes e ferramentas para negócios de alimentação.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/google` },
      { property: "og:title", content: "Ronnei na Veia" },
      {
        property: "og:description",
        content:
          "Plataforma de cursos, e-books, consultorias, comunidade, fidelização de clientes e ferramentas para negócios de alimentação.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Ronnei na Veia" },
      {
        name: "twitter:description",
        content:
          "Plataforma de cursos, e-books, consultorias, comunidade, fidelização de clientes e ferramentas para negócios de alimentação.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/google` }],
  }),
  component: GoogleVerificationPage,
});

const features = [
  {
    icon: GraduationCap,
    title: "Área do aluno",
    description:
      "Ambiente exclusivo para alunos acessarem cursos, e-books, aulas em vídeo, materiais complementares e acompanhar seu progresso de forma simples e organizada.",
  },
  {
    icon: Video,
    title: "Consultorias online",
    description:
      "Atendimentos personalizados com Ronnei via videochamada para quem quer acelerar resultados, tirar dúvidas específicas e montar um plano de ação para o próprio negócio.",
  },
  {
    icon: Calendar,
    title: "Integração com Google Calendar",
    description:
      "Os agendamentos de consultorias e eventos da plataforma são sincronizados automaticamente com o Google Calendar, garantindo organização e lembretes pontuais.",
  },
  {
    icon: MonitorPlay,
    title: "Integração com Google Meet",
    description:
      "As reuniões online são criadas com links automáticos do Google Meet, facilitando o acesso do aluno sem precisar de configurações extras.",
  },
  {
    icon: HardDrive,
    title: "Gravações no Google Drive",
    description:
      "As gravações das consultorias e conteúdos exclusivos são armazenadas de forma segura no Google Drive, disponíveis para os alunos consultarem quando precisarem.",
  },
  {
    icon: BookOpen,
    title: "Gestão de conteúdo",
    description:
      "A plataforma gerencia cursos, e-books, receitas, materiais de apoio, certificados e comunidade em um só lugar, com acesso controlado por nível de assinatura ou compra.",
  },
];

function GoogleVerificationPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Ronnei na Veia
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Plataforma de cursos, e-books, consultorias, comunidade, fidelização de clientes e ferramentas para negócios de alimentação.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Ir para o site
          </Link>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-card/60 p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            Página pública de verificação do Google OAuth
          </div>

          <h2 className="font-display text-2xl font-semibold text-foreground">
            O que fazemos
          </h2>
          <p className="mt-2 text-muted-foreground">
            Abaixo estão os principais recursos da plataforma que utilizam ou integram serviços do Google de forma segura e transparente.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/30"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </span>
                  <h3 className="font-semibold text-foreground">{feature.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-border bg-background p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">Comunidade e fidelização</h3>
                <p className="text-sm text-muted-foreground">
                  Além dos conteúdos, a plataforma oferece acesso a grupos exclusivos, suporte direto e ferramentas para ajudar donos de negócios de alimentação a manterem e fidelizarem seus clientes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">Ronnei na Veia</p>
              <p className="text-sm text-muted-foreground">
                contato@espetinhonaveia.com
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link
                to="/politica-de-privacidade"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Shield className="h-4 w-4" />
                Política de Privacidade
              </Link>
              <Link
                to="/termos-de-uso"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-4 w-4" />
                Termos de Uso
              </Link>
              <a
                href="mailto:contato@espetinhonaveia.com"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                Contato
              </a>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Ronnei na Veia. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </main>
  );
}
