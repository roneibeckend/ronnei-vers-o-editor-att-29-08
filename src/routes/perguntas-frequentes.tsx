import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { useState } from "react";

const SITE_URL = "https://ronneinaveia.com.br";

export const Route = createFileRoute("/perguntas-frequentes")({
  head: () => ({
    meta: [
      { title: "Perguntas Frequentes — Espetinho na Veia" },
      { name: "description", content: "Tire suas dúvidas sobre o eBook Espetinho na Veia — Do Zero aos 10k: acesso, garantia, pagamento, suporte e conteúdo." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/perguntas-frequentes` },
      { property: "og:title", content: "Perguntas Frequentes — Espetinho na Veia" },
      { property: "og:description", content: "Respostas rápidas sobre compra, acesso, garantia e conteúdo do eBook." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Perguntas Frequentes — Espetinho na Veia" },
      { name: "twitter:description", content: "Respostas rápidas sobre compra, acesso, garantia e conteúdo do eBook." },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/perguntas-frequentes` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: FAQPage,
});

const faqs = [
  { q: "Como recebo o eBook depois da compra?", a: "Assim que o pagamento é confirmado, você recebe um e-mail com o link de acesso ao eBook e a todos os bônus. Se não encontrar, olhe a caixa de spam ou fale com o suporte." },
  { q: "Em quais aparelhos consigo ler?", a: "O eBook é em PDF e abre em celular, tablet, notebook e computador. Você pode baixar e ler offline quantas vezes quiser." },
  { q: "Preciso ter experiência com espetinho?", a: "Não. O método é feito para começar do zero — desde a escolha da carne até a venda no ponto certo." },
  { q: "Quanto preciso investir para começar?", a: "Dá para começar com pouco, usando o que você já tem em casa. Dentro do eBook mostramos o passo a passo para iniciar com o mínimo." },
  { q: "Como funciona a garantia?", a: "Você tem 7 dias corridos para testar o conteúdo. Se não gostar, é só enviar um e-mail e devolvemos 100% do valor, sem enrolação." },
  { q: "Quais são as formas de pagamento?", a: "Cartão de crédito (com parcelamento), Pix e boleto — tudo pela plataforma segura de pagamento." },
  { q: "O acesso tem prazo de validade?", a: "Não. Uma vez comprado, o eBook é seu para sempre. As atualizações futuras também ficam liberadas." },
  { q: "Tem suporte para tirar dúvidas?", a: "Sim. Você entra no grupo VIP de WhatsApp (bônus) e pode falar direto com a gente por e-mail." },
  { q: "Vou virar chef ou aprender receitas mirabolantes?", a: "Não. O foco é negócio: produzir bem, vender muito e lucrar. Nada de receita complicada." },
  { q: "Preciso de MEI ou CNPJ para começar?", a: "Não é obrigatório para começar, mas explicamos quando e como formalizar para crescer de forma segura." },
];

function FAQPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para o início
      </Link>
      <div className="mt-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-fire shadow-fire">
          <HelpCircle className="h-5 w-5 text-white" />
        </span>
        <h1 className="font-display text-3xl sm:text-5xl">Perguntas Frequentes</h1>
      </div>
      <p className="mt-3 text-muted-foreground">Tudo o que você precisa saber antes de garantir o seu.</p>

      <div className="mt-10 space-y-3">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="rounded-2xl border border-border bg-card/60 backdrop-blur">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-semibold text-foreground">{f.q}</span>
                <span className={`text-2xl leading-none text-[color:var(--gold)] transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
              </button>
              {isOpen && (
                <div className="border-t border-border/60 px-5 py-4 text-[15px] leading-relaxed text-muted-foreground">
                  {f.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-12 rounded-2xl border border-border bg-card/60 p-6 text-center">
        <p className="text-muted-foreground">Ainda ficou alguma dúvida?</p>
        <p className="mt-1 text-foreground">Fale com a gente: <span className="font-semibold">contato@espetinhonaveia.com</span></p>
      </div>
    </main>
  );
}
