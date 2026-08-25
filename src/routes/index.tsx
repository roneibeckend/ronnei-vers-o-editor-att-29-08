/*
Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.
                                        
                                            
                                            
                                            oi
*/
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type JSX, Suspense, lazy, memo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { trackEvent, trackInitiateCheckout } from "@/lib/pixel";
import { supabase } from "@/integrations/supabase/client";
import { landingFaqs } from "@/lib/landing-faq";
import { useInView } from "@/hooks/use-in-view";

import {
  Flame,
  Check,
  Star,
  ShieldCheck,
  Zap,
  Clock,
  Lock,
  Award,
  TrendingUp,
  Users,
  ChefHat,
  DollarSign,
  Calculator,
  ClipboardList,
  Truck,
  BookOpen,
  Sparkles,
  ArrowRight,
  ChevronDown,
  Play,
  MessageCircle,
  Mail,
  Beef,
  Utensils,
  Target,
  Heart,
  Loader2,
  CheckCircle2,
  User,
  Phone,
  X,
} from "lucide-react";

const heroChefOriginal = { url: "/media/hero-chef.webp" };
import {
  optHeroChef as heroChef,
  optPlatter1 as platter1,
  optPlatter2 as platter2,
  optSkewerSingle as skewerSingle,
  optSkewersHeld as skewersHeld,
  optSkewersFlat as skewersFlat,
  optRibeye as ribeye,
  optChefWorking as chefWorking,
  optChefPortrait as chefPortrait,
  optAuthor as author,
} from "@/assets/optimized";
const brandLockup = { url: "/brand-lockup.webp" };
const heroVideoCover = { url: "/media/espeto-imparavel-hero.webp" };

import printWhats1 from "@/assets/opt/print-whats-1.webp";
import printWhats2 from "@/assets/opt/print-whats-2.webp";
import printWhats3 from "@/assets/opt/print-whats-3.webp";
import printPix from "@/assets/opt/print-pix.webp";


// Widget da assistente: chunk separado, carregado só quando a seção aparece.
const BrasaChat = lazy(() => import("@/components/landing/BrasaChat"));

const SITE_URL = "https://espetinhonaveia.lovable.app";
const OG_IMAGE = `${SITE_URL}${heroChefOriginal.url}`;

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Ronnei na Veia — Do Zero aos 10k | eBook Ronnei" },
      {
        name: "description",
        content:
          "eBook prático com 7 Módulos e 27 Capítulos + bônus para montar, temperar, precificar e vender espetinhos com alto lucro. Comece do zero e chegue aos 10k/mês.",
      },
      { name: "keywords", content: "espetinho, ebook espetinho, como vender espetinho, negócio de espetinho, churrasco, renda extra, Ronnei" },
      { name: "author", content: "Ronnei" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:type", content: "product" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:title", content: "Ronnei na Veia — Do Zero aos 10k | eBook Ronnei" },
      {
        property: "og:description",
        content:
          "eBook prático com 7 Módulos e 27 Capítulos + bônus para montar, temperar, precificar e vender espetinhos com alto lucro. Comece do zero e chegue aos 10k/mês.",
      },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:alt", content: "Chef especialista em espetinhos com espetos flamejantes" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "Ronnei na Veia" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Ronnei na Veia — Do Zero aos 10k | eBook Ronnei" },
      {
        name: "twitter:description",
        content:
          "eBook prático com 7 Módulos e 27 Capítulos + bônus para montar, temperar, precificar e vender espetinhos com alto lucro. Comece do zero e chegue aos 10k/mês.",
      },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "Chef especialista em espetinhos" },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      { rel: "preconnect", href: "https://i.ytimg.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://i.ytimg.com" },
      {
        rel: "preload",
        as: "image",
        href: heroVideoCover.url,
        fetchpriority: "high",
      },
    ],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Ronnei na Veia — Do Zero aos 10k",
          description:
            "eBook com 7 Módulos e 27 Capítulos + 4 bônus exclusivos para montar, temperar, precificar e vender espetinhos com alto lucro.",
          image: [OG_IMAGE],
          brand: { "@type": "Brand", name: "Ronnei na Veia" },
          author: { "@type": "Person", name: "Ronnei" },
          offers: {
            "@type": "Oferta",
            url: `${SITE_URL}/#oferta`,
            price: "47.90",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "2000",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Preciso ter experiência com churrasco para começar?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Não. O eBook foi feito para iniciantes: passo a passo do zero, escolha da carne, tempero, brasa e ponto certo.",
              },
            },
            {
              "@type": "Question",
              name: "Como recebo o eBook após a compra?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "O acesso é imediato por e-mail após a confirmação do pagamento, em PDF para ler no celular ou computador.",
              },
            },
            {
              "@type": "Question",
              name: "Existe garantia?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sim. Você tem 7 dias de garantia incondicional. Se não gostar, devolvemos 100% do valor.",
              },
            },
          ],
        }),
      },
    ],
  }),
});

// ---- Small primitives ----

type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "blur" | "rotate" | "clip" | "tilt";

function Reveal({
  children,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  variant?: RevealVariant;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  immediate?: boolean;
}) {
  // PERFORMANCE: conteúdo sempre visível.
  // Nenhum IntersectionObserver ou timer para liberar a renderização.
  return <Tag className={className}>{children}</Tag>;
}

function ScrollProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // No mobile a barra fica oculta e nenhum listener de scroll é criado.
    if (window.matchMedia("(max-width: 767px)").matches) return;

    let raf = 0;

    const update = () => {
      raf = 0;

      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? h.scrollTop / max : 0;

      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, pct))})`;
      }
    };

    const onScroll = () => {
      if (!raf) {
        raf = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-[60] hidden h-[3px] bg-transparent md:block">
      <div
        ref={barRef}
        className="h-full bg-fire shadow-fire"
        style={{
          transform: "scaleX(0)",
          transformOrigin: "left center",
          willChange: "transform",
        }}
      />
    </div>
  );
}

function Embers() {
  // Deterministic layout — no hydration mismatch
  const embers = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 7.3) % 100,
    delay: (i * 0.31) % 4,
    dur: 3.2 + ((i * 0.7) % 2.5),
    size: 4 + (i % 4),
  }));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-64 overflow-hidden">
      {embers.map((e, i) => (
        <span
          key={i}
          className="ember"
          style={{
            left: `${e.left}%`,
            width: `${e.size}px`,
            height: `${e.size}px`,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

function BrasaTicker() {
  const items = [
    "Do zero aos 10k",
    "Margens de até 300%",
    "Método na prática",
    "Brasa perfeita",
    "Tempero exclusivo",
    "Fornecedores certos",
    "Sem enrolação",
    "Feito por quem vive da grelha",
  ];
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-[color:var(--gold)]/20 bg-gradient-to-r from-[color:var(--ember)]/10 via-transparent to-[color:var(--gold)]/10 py-4 3xl:py-6">
      <div className="flex animate-marquee gap-8 whitespace-nowrap">
        {loop.map((t, i) => (
          <span key={i} className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <Flame className="h-4 w-4 shrink-0 text-[color:var(--gold)]" />
            <span className="text-foreground/90">{t}</span>
            <span className="text-[color:var(--gold)]/60">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  const isHidden = children === "⁣" || (typeof children === "string" && (children.trim() === "" || children === "⁣"));
  if (isHidden) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--gold)]/30 bg-[color:var(--gold)]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gold)] sm:gap-2 sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.2em]">
      <Flame className="h-3 w-3 animate-flicker sm:h-3.5 sm:w-3.5" />
      {children}
    </span>
  );
}

function CTAButton({
  children,
  size = "lg",
  className = "",
}: {
  children: React.ReactNode;
  size?: "lg" | "xl";
  className?: string;
}) {
  return (
    <a
      href="#oferta"
      onClick={() => trackInitiateCheckout("cta-anchor")}
      className={`btn-fire shine-on-hover w-full sm:w-auto ${size === "xl" ? "text-base sm:text-lg sm:!px-10 sm:!py-5" : ""} ${className}`}
    >
      {children}
    </a>
  );
}

// Configuração do checkout — redireciona para o login com contexto de redirecionamento
const MAIN_EBOOK_ID = "ee1a776c-6c7d-4a88-a980-7e671ad8d4fb";
const getCheckoutUrl = (ref?: string) => `/login?redirectTo=${encodeURIComponent(`/app?buy=${MAIN_EBOOK_ID}&type=ebook${ref ? `&ref=${ref}` : ''}`)}`;



function CheckoutButton({ className = "", label = "Quero garantir meu acesso" }: { className?: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    trackInitiateCheckout("checkout-button");
    try {
      // Simula pequena latência antes de redirecionar (evita clique duplo e mostra feedback).
      await new Promise((r) => setTimeout(r, 600));
      
      const ref = localStorage.getItem('affiliate_referrer_code') || undefined;
      const url = getCheckoutUrl(ref);
      
      window.location.assign(url);
    } catch (err) {

      console.error("[checkout] falha ao redirecionar:", err);
      toast.error("Não conseguimos abrir o checkout", {
        description:
          err instanceof Error ? err.message : "Verifique sua conexão e tente novamente.",
        action: { label: "Tentar de novo", onClick: () => handleClick() },
      });
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className={`btn-fire shine-on-hover !text-lg !px-10 !py-5 w-full max-w-md disabled:opacity-80 disabled:cursor-wait ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Processando...
        </>
      ) : (
        <>
          {label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </>
      )}
    </button>
  );
}




function Countdown({ hours = 72 }: { hours?: number }) {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const key = `env_offer_deadline_${hours}h`;
    let t = Number(localStorage.getItem(key));
    const max = Date.now() + hours * 3_600_000;
    if (!t || Number.isNaN(t) || t < Date.now() || t > max) {
      t = Date.now() + hours * 3_600_000;
      localStorage.setItem(key, String(t));
    }
    setTarget(t);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hours]);
  const diff = target ? Math.max(0, target - now) : hours * 3_600_000;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff / 60_000) % 60);
  const s = Math.floor((diff / 1_000) % 60);
  const cells: { l: string; v: number }[] = [
    { l: "horas", v: h },
    { l: "min", v: m },
    { l: "seg", v: s },
  ];
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2" role="timer" aria-label="Contagem regressiva da oferta">
      {cells.map((c, i) => (
        <div key={c.l} className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex min-w-[60px] flex-col items-center rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 backdrop-blur sm:min-w-[72px]">
            <span className="font-display text-2xl font-black leading-none text-gradient-fire [font-variant-numeric:tabular-nums] sm:text-3xl">
              {String(c.v).padStart(2, "0")}
            </span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{c.l}</span>
          </div>
          {i < cells.length - 1 && <span className="text-base font-black text-[color:var(--gold)]/40 sm:text-lg">:</span>}
        </div>
      ))}
    </div>
  );
}

function GuaranteeSeal({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/[0.06] px-3 py-1.5 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-[color:var(--gold)]/60 bg-[color:var(--gold)]/10">
        <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--gold)]" />
      </span>
      <span className="text-[11px] font-black uppercase leading-tight tracking-[0.2em] text-[color:var(--gold)]">
        7 dias<br />
        <span className="text-muted-foreground">risco zero</span>
      </span>
    </div>
  );
}


// ---- Sections ----

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let last = window.scrollY > 40;
    setScrolled(last);

    const onScroll = () => {
      const next = window.scrollY > 40;
      if (next !== last) {
        last = next;
        setScrolled(next);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "backdrop-blur-xl bg-background/70 border-b border-border" : ""
      }`}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6 3xl:max-w-[1800px]">
        <a href="#top" className="flex min-w-0 items-center" aria-label="Ronnei na Veia">
          <img
            src={brandLockup.url}
            alt="Ronnei na Veia"
            width={330}
            height={110}
            fetchPriority="high"
            decoding="async"
            className="h-9 w-auto shrink-0 object-contain object-left sm:h-11"
          />
        </a>

        <nav className="hidden gap-6 text-sm text-muted-foreground lg:flex xl:gap-8">
          <a href="#beneficios" className="hover:text-foreground transition">Benefícios</a>
          <a href="#modulos" className="hover:text-foreground transition">Módulos</a>
          <a href="#bonus" className="hover:text-foreground transition">Bônus</a>
          <a href="#faq" className="hover:text-foreground transition">FAQ</a>
        </nav>
        <a href="#oferta" onClick={() => trackInitiateCheckout("nav-cta")} className="btn-fire shrink-0 !min-h-0 !py-2 !px-4 text-xs sm:!px-5 sm:text-sm">
          Quero o eBook
        </a>

      </div>
    </header>
  );
}

function Hero() {
  const [videoOpen, setVideoOpen] = useState(false);

  useEffect(() => {
    if (!videoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setVideoOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [videoOpen]);

  return (
    <section id="top" className="relative overflow-hidden pt-16 pb-8 sm:pt-24 sm:pb-14 lg:pt-28 lg:pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 88% 68% at 50% 4%, oklch(0.63 0.24 27 / 0.30) 0%, oklch(0.63 0.24 27 / 0.16) 40%, transparent 74%), radial-gradient(ellipse 42% 34% at 88% 30%, oklch(0.82 0.15 85 / 0.08) 0%, transparent 72%)",
        }}
      />

      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 text-center sm:px-6 3xl:max-w-[1500px]">

        <Reveal variant="blur" delay={1} as="h1" immediate className="mt-4 text-3xl font-black leading-[1.05] sm:text-4xl md:text-5xl lg:text-6xl">
          Do zero ao <span className="animated-fire-text">próprio negócio de espetinhos</span>
        </Reveal>
        <Reveal variant="up" delay={2} as="p" immediate className="mt-3 max-w-2xl text-fluid-lead text-muted-foreground sm:mt-4">
          O método completo para montar, temperar, precificar e vender espetinhos com alta margem — mesmo sem experiência e com pouco investimento.
        </Reveal>

        <Reveal variant="up" delay={2} immediate className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-4 py-1.5 text-xs font-semibold text-[color:var(--gold)] sm:text-sm">
          <Flame className="h-4 w-4" />
          Lucre até <span className="text-foreground">R$ 300 por dia</span> aplicando o método
        </Reveal>


        {/* Video + CTA row */}
        <div className="mt-6 grid w-full items-center gap-6 sm:mt-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8 2xl:gap-16">
          {/* Compact video trigger */}
          <Reveal variant="scale" delay={3} immediate className="w-full lg:ml-auto lg:max-w-xl">
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              aria-label="Assistir à história do Ronnei"

              className="group relative mx-auto block w-full max-w-md overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ember)] lg:mx-0"
            >
              <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-fire opacity-25 blur-2xl transition group-hover:opacity-40" />
              <div className="glass gradient-border relative overflow-hidden rounded-2xl p-1.5 shadow-fire">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-background ring-1 ring-white/10 shadow-2xl">
                  <img
                    src={heroVideoCover.url}
                    alt="Método do Espeto Imparável — Ronnei na Veia"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width={1280}
                    height={720}
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--ember)] shadow-[0_0_40px_-4px_var(--ember)] transition group-hover:scale-110">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--ember)] opacity-40" />
                      <svg viewBox="0 0 24 24" className="relative ml-1 h-7 w-7 fill-background"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 font-medium text-foreground backdrop-blur">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--flame)] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--flame)]" />
                      </span>
                      Clique e veja como tudo começou
                    </span>
                    <span className="rounded-full bg-background/70 px-2.5 py-1 font-semibold text-[color:var(--gold)] backdrop-blur">2 min</span>
                  </div>
                </div>
              </div>
            </button>
          </Reveal>

          {/* CTAs on the right */}
          <Reveal variant="up" delay={4} immediate className="flex w-full flex-col items-stretch gap-3 sm:max-w-sm sm:mx-auto lg:mx-0 lg:max-w-xs lg:items-stretch lg:justify-self-start">
            <a href="#oferta" onClick={() => trackInitiateCheckout("hero-cta")} className="btn-fire shine-on-hover w-full justify-center !text-base !font-bold lg:min-h-[56px]">
              Quero começar agora
            </a>

            <a href="#beneficios" className="btn-ghost-fire w-full justify-center text-center !text-base !font-bold lg:min-h-[56px]">
              Ver o que aprendo
            </a>
          </Reveal>
        </div>


        <Reveal variant="up" delay={4} immediate className="mt-3 hidden flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:flex sm:text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ember)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--flame)]" />
            </span>
            Mais de <strong className="text-foreground">300 pessoas</strong> já compraram o eBook e começaram a vender espetinho
          </span>
        </Reveal>

        <Reveal variant="up" delay={5} immediate className="mt-6 grid w-full max-w-xl grid-cols-3 gap-3 sm:gap-4">
          {[
            { n: "300%", l: "margem" },
            { n: "14", l: "capítulos" },
            { n: "7 dias", l: "garantia" },
          ].map((s) => (
            <div key={s.l} className="glass gradient-border rounded-xl px-3 py-3 text-center transition hover:-translate-y-0.5">
              <div className="font-display text-xl leading-none text-gradient-fire sm:text-2xl">{s.n}</div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground sm:text-xs">{s.l}</div>
            </div>
          ))}
        </Reveal>
      </div>

      {/* Video Modal */}
      {videoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setVideoOpen(false)}
          aria-label="Vídeo: história do Ronnei"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 px-4 backdrop-blur-xl animate-fade-in"
        >
          <button
            type="button"
            onClick={() => setVideoOpen(false)}
            aria-label="Fechar vídeo"
            className="fixed right-3 z-[120] inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white shadow-lg backdrop-blur-md transition hover:bg-black/90 active:scale-95"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
          >
            <X className="h-6 w-6" />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[min(420px,85vh*9/16)] animate-scale-in"
          >

            <div className="glass gradient-border overflow-hidden rounded-2xl p-1 shadow-fire relative bg-black group/intro">
              <div className="relative aspect-[9/16] max-h-[85vh] w-full overflow-hidden rounded-xl bg-black shadow-2xl">
                <video
                    autoPlay
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-contain"
                    onEnded={() => setVideoOpen(false)}
                  >
                    <source
                      src="/media/ronnei-historia-mobile.mp4"
                      type="video/mp4"
                      media="(max-width: 767px)"
                    />
                    <source
                      src="/media/ronnei-historia-desktop.mp4"
                      type="video/mp4"
                    />
                    Seu navegador não suporta reprodução de vídeo.
                  </video>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LogosBar() {
  const items = [
    { icon: Users, label: "+2.000 leitores" },
    { icon: Star, label: "4.9 / 5 estrelas" },
    { icon: ShieldCheck, label: "7 dias de garantia" },
    { icon: Zap, label: "Acesso imediato" },
  ];
  return (
    <div className="border-y border-border/60 bg-background/40 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 sm:grid-cols-4 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 text-[color:var(--gold)]" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pain() {
  const pains = [
    { icon: Beef, title: "Escolhe a carne errada", desc: "Compra caro, o cliente reclama e o lucro some." },
    { icon: Utensils, title: "Não sabe temperar", desc: "O sabor fica sem graça e o cliente não volta." },
    { icon: Calculator, title: "Não sabe precificar", desc: "Vende no chute e trabalha muito ganhando pouco." },
    { icon: DollarSign, title: "Lucro apertado", desc: "Trabalha o mês inteiro e não sobra dinheiro." },
    { icon: Truck, title: "Compra ingrediente caro", desc: "Não conhece fornecedores certos e paga a mais." },
    { icon: Heart, title: "Medo de investir", desc: "Trava por não ter um método claro passo a passo." },
  ];
  return (
    <section className="relative py-14 sm:py-20 bg-card/10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <SectionTag>O problema</SectionTag>
          <h2 className="mt-6 max-w-3xl h-fluid-h2 font-black">
            Você já se viu <span className="text-gradient-fire">preso em algum destes erros?</span>
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            A maioria de quem tenta vender espetinho cai nas mesmas armadilhas — e desiste antes de ver o real potencial do negócio.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pains.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-6 transition hover:-translate-y-1 hover:border-[color:var(--ember)]/40">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[color:var(--ember)]/15 text-[color:var(--ember)]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuthorSolution() {
  const slides = [
    { src: chefWorking.url, alt: "Ronnei na grelha preparando espetinhos", width: 300, height: 300 },
    { src: platter1.url, alt: "Tábua premium de espetinhos variados", width: 300, height: 300 },
    { src: skewersHeld.url, alt: "Espetinhos suculentos no ponto", width: 300, height: 300 },
    { src: ribeye.url, alt: "Corte nobre bovino selecionado", width: 300, height: 300 },
    { src: platter2.url, alt: "Espetinhos servidos com apresentação profissional", width: 300, height: 300 },
  ];


  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
          {/* Slideshow */}
          <div className="relative mx-auto lg:mx-0">
            <div className="relative h-[260px] w-[260px] overflow-hidden rounded-3xl shadow-2xl sm:h-[300px] sm:w-[300px]">
              {slides.map((s, i) => (
                <img
                  key={s.src}
                  src={s.src}
                  alt={s.alt}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  width={s.width}
                  height={s.height}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
                    i === idx ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              {/* subtle dots */}
              <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
                {slides.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === idx ? "w-5 bg-white" : "w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Copy */}
          <div>
            <SectionTag>Oportunidade</SectionTag>
            <h2 className="mt-5 h-fluid-h2 font-black">
              De açougueiro sem R$ 1.000 no bolso a dono do <span className="text-gradient-fire">Espetos Grill</span>.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Meu nome é <strong className="text-foreground">Ronnei</strong>. Comecei aos 17 anos trabalhando de açougueiro no supermercado
              e, no horário de almoço, fabricava espetinhos pra vender à noite. Foram 12 anos de rotina pesada —
              domingo, feriado, tudo eu vendia. Sem dinheiro, sem atalho, só na raça.
            </p>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Comecei num cantinho minúsculo. Passei pela pandemia, quase quebrei, aprendi na dor que dinheiro
              da empresa não é seu e que a culpa de todo BO é do dono. Hoje o <strong className="text-foreground">Espetos Grill</strong> fatura
              mais de <span className="text-gradient-fire font-black">R$ 350 mil/mês</span> — e o que está nesse eBook é o passo a passo que eu queria ter recebido lá atrás.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: "10+", l: "anos na brasa" },
                { n: "R$350k", l: "faturamento/mês" },
                { n: "0", l: "começou do zero" },
              ].map((s) => (
                <div key={s.l} className="glass flex flex-col items-center justify-center rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-gradient-fire sm:text-2xl">{s.n}</div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                </div>
              ))}
              <div className="flex items-center justify-center sm:col-span-2 lg:col-span-1">
                <a href="#oferta" onClick={() => trackInitiateCheckout("about-cta")} className="btn-fire shine-on-hover relative w-full justify-center text-center">
                  <span>Quero o método</span>
                  <ArrowRight className="absolute right-5 h-4 w-4" />
                </a>

              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const items = [
    { icon: DollarSign, title: "Até 300% de margem", desc: "Aprenda a precificar cada espeto para lucrar de verdade, sem trabalhar de graça.", featured: false },
    { icon: Beef, title: "Carne que rende mais", desc: "Cortes certos, quantidade certa por espeto e menos desperdício no fim do dia.", featured: false },
    { icon: Flame, title: "Ponto e brasa perfeitos", desc: "O segredo do ponto suculento que faz o cliente voltar e indicar pra todo mundo.", featured: true },
    { icon: Sparkles, title: "Tempero que fideliza", desc: "A marinada da casa que transforma espeto comum em 'o melhor da região'.", featured: false },
    { icon: Users, title: "Fila no seu ponto", desc: "Onde montar, como atrair e como fazer o movimento não parar nem em dia de semana.", featured: false },
    { icon: TrendingUp, title: "Do carrinho ao trailer", desc: "Passo a passo real para escalar de renda extra a negócio de 10k por mês.", featured: false },
  ];
  return (
    <section id="beneficios" className="relative py-10 sm:py-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Metodologia</SectionTag>
          <h2 className="mt-4 max-w-2xl text-2xl sm:text-3xl font-black">
            O que vai <span className="text-gradient-fire">mudar no seu bolso</span>
          </h2>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, desc, featured }) => (
            <div
              key={title}
              className={`group relative overflow-hidden rounded-xl border p-4 backdrop-blur-sm transition-all ${
                featured
                  ? "border-white/15 bg-white/[0.05]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
              }`}
            >
              {featured && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-gradient-to-b from-[color:var(--flame)] to-[color:var(--ember)] shadow-[0_0_10px_color-mix(in_oklab,var(--flame)_50%,transparent)]"
                />
              )}
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${featured ? "text-[color:var(--flame)]" : "text-foreground/70"}`} strokeWidth={1.75} />
                <div>
                  <h3 className="mb-1 text-sm font-bold">{title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </div>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}

function ProfitCalculator() {
  const [qty, setQty] = useState(50);
  const [price, setPrice] = useState(8);
  const cost = 2.2; // custo médio por espeto (carne + carvão + palito + tempero)
  const daysMonth = 26;

  const revenueDay = qty * price;
  const costDay = qty * cost;
  const profitDay = revenueDay - costDay;
  const profitMonth = profitDay * daysMonth;
  const marginPct = revenueDay > 0 ? Math.round((profitDay / revenueDay) * 100) : 0;

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <section id="calculadora" className="relative py-10 sm:py-14">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 3xl:max-w-[1500px]">
        <div className="flex flex-col items-center text-center">
          <SectionTag>O que você aprende</SectionTag>
          <h2 className="mt-4 max-w-2xl h-fluid-h3 font-black">
            Faça a <span className="text-gradient-fire">conta na sua tela</span> agora
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Ajuste quantidade e preço. Cálculo em tempo real com custo médio de {fmt(cost)}/espeto.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="glass rounded-2xl border border-white/10 p-5">
            <div className="space-y-5">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="qty" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Espetos / dia
                  </label>
                  <span className="text-xl font-black text-gradient-fire">{qty}</span>
                </div>
                <input
                  id="qty"
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[color:var(--gold)]"
                  aria-label="Espetos vendidos por dia"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="price" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Preço / espeto
                  </label>
                  <span className="text-xl font-black text-gradient-fire">{fmt(price)}</span>
                </div>
                <input
                  id="price"
                  type="range"
                  min={5}
                  max={20}
                  step={0.5}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[color:var(--gold)]"
                  aria-label="Preço por espeto"
                />
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Faturamento/dia</span>
                  <span className="font-bold">{fmt(revenueDay)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Custo/dia</span>
                  <span className="font-bold text-red-400/90">− {fmt(costDay)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border/60 pt-1">
                  <span className="text-muted-foreground">Margem</span>
                  <span className="font-bold">{marginPct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--gold)]/30 bg-card/60 p-5 shadow-fire">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-fire opacity-20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-[color:var(--gold)]" />
                Lucro estimado
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Por dia</div>
                <div className="mt-1 text-4xl font-black text-gradient-fire sm:text-5xl">
                  {fmt(profitDay)}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Semana</div>
                  <div className="mt-0.5 text-lg font-black">{fmt(profitDay * 6)}</div>
                </div>
                <div className="rounded-xl border border-[color:var(--gold)]/40 bg-fire/10 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-[color:var(--gold)]">Mês (26d)</div>
                  <div className="mt-0.5 text-lg font-black text-gradient-fire">{fmt(profitMonth)}</div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                * Estimativa com base em custos médios de mercado.
              </p>
            </div>
          </div>
        </div>

        {/* CTA pós-simulador */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <a href="#oferta" onClick={() => trackInitiateCheckout("simulator-cta")} className="btn-fire shine-on-hover !text-base !px-8 !py-4 w-full max-w-sm justify-center">
            Quero faturar isso também <ArrowRight className="h-4 w-4" />
          </a>

          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Método completo por R$ 47,90
          </span>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const prints = [
    { src: printWhats1, alt: "Print de WhatsApp: aluno bateu recorde de faturamento vendendo espetinho", tag: "Recorde de faturamento" },
    { src: printWhats2, alt: "Print de Instagram: aluna de Goiânia vendeu 320 espetinhos em um sábado", tag: "320 espetos / sábado" },
    { src: printWhats3, alt: "Print de WhatsApp: aluno corrigiu precificação após o eBook", tag: "Precificação corrigida" },
    { src: printPix, alt: "Print de WhatsApp: aluno começou do zero e lucrou R$ 500 na primeira semana", tag: "R$ 500 na 1ª semana" },
  ];
  return (
    <section id="depoimentos" className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 3xl:max-w-[1800px]">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Resultados Reais</SectionTag>
          <h2 className="mt-6 max-w-3xl h-fluid-h2 font-black">
            Alunos que <span className="text-gradient-fire">colocaram a mão na brasa</span> e viram resultado
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Prints reais de quem aplicou o método. Nomes preservados por privacidade.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-5 lg:grid-cols-4 3xl:grid-cols-5">
          {prints.map((p) => (
            <figure
              key={p.alt}
              className="glass group relative overflow-hidden rounded-2xl border border-white/10 p-2 transition hover:-translate-y-1 hover:border-[color:var(--gold)]/40"
            >
              <div className="relative overflow-hidden rounded-xl">
                <img
                  src={p.src}
                  alt={p.alt}
                  loading="lazy"
                  decoding="async"
                  width={720}
                  height={1024}
                  className="aspect-[9/16] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--gold)] backdrop-blur-sm sm:text-xs">
                  🔥 {p.tag}
                </span>
              </div>
            </figure>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground sm:text-sm">
          * Resultados variam conforme dedicação, região e aplicação do método.
        </p>
      </div>
    </section>
  );
}

function Modules() {
  const modules = [
    { icon: BookOpen, title: "Introdução", desc: "A trajetória real que deu origem ao método." },
    { icon: TrendingUp, title: "Mentalidade e Oportunidade", desc: "Entenda o potencial desse mercado bilionário." },
    { icon: Target, title: "Começando do Zero", desc: "Estrutura, equipamentos e investimento inicial." },
    { icon: Utensils, title: "Produto e Produção", desc: "Os espetinhos que mais vendem e cortes ideais." },
    { icon: DollarSign, title: "Vendas e Faturamento", desc: "Estratégias para vender e lucrar todos os dias." },
    { icon: TrendingUp, title: "Crescimento e Escala", desc: "Como escalar seu negócio para os 10k por mês." },
    { icon: Award, title: "Passos Finais", desc: "Como transformar o negócio em uma marca sólida." },
  ];
  const [open, setOpen] = useState(false);
  return (
    <section id="modulos" className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 3xl:max-w-[1800px]">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Por dentro do eBook</SectionTag>
          <h2 className="mt-6 max-w-3xl h-fluid-h2 font-black">
            7 Módulos e 27 Capítulos <span className="text-gradient-fire">práticos e diretos</span>
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Cada módulo foi pensado para você aplicar hoje mesmo — sem enrolação, sem teoria desnecessária.
          </p>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="modulos-lista"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/40 bg-fire/10 px-5 py-3 text-sm font-bold uppercase tracking-widest text-[color:var(--gold)] transition hover:bg-fire/20"
          >
            {open ? "Ocultar capítulos" : "VER OS 7 MÓDULOS"}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <div
          id="modulos-lista"
          className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-500 ease-out ${
            open ? "mt-10 grid-rows-[1fr] opacity-100 sm:mt-12" : "mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0">
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              {modules.map(({ icon: Icon, title }, i) => (
                <div
                  key={title}
                  style={{ animationDelay: open ? `${i * 40}ms` : "0ms" }}
                  className={`glass group flex items-center gap-2 rounded-full px-3 py-2 transition hover:-translate-y-0.5 hover:border-[color:var(--gold)]/40 sm:px-4 sm:py-2.5 ${
                    open ? "animate-fade-in" : ""
                  }`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fire text-white shadow-fire sm:h-7 sm:w-7">
                    <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--gold)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold sm:text-sm">{title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bonuses() {
  const bonuses = [
    { icon: Sparkles, title: "Artes para Divulgação", tag: "Bônus 01", value: "R$ 27,90", desc: "Artes profissionais prontas para você postar no Instagram e atrair clientes." },
    { icon: BookOpen, title: "Cardápio Editável", tag: "Bônus 02", value: "R$ 25,00", desc: "Modelo profissional de cardápio para você apenas colocar seus preços e imprimir." },
    { icon: Award, title: "Certificado de conclusão", tag: "Bônus 03", value: "R$ 15,00", desc: "Certificado digital para validar sua formação no método Espetinho na Veia." },
    { icon: Calculator, title: "Calculadora de Venda", tag: "Bônus 04", value: "R$ 30,00", desc: "Ferramenta prática para calcular custos e garantir sua margem de lucro em cada venda." },
  ];
  return (
    <section id="bonus" className="relative py-14 sm:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30">
        <div className="absolute right-0 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-[color:var(--flame)]/40 blur-3xl" />
      </div>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 3xl:max-w-[1600px]">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Bônus Exclusivos</SectionTag>
          <h2 className="mt-4 max-w-3xl h-fluid-h3 font-black">
            4 bônus <span className="text-gradient-fire">exclusivos e gratuitos</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Vantagens extras para acelerar seus resultados desde o primeiro dia.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
          {bonuses.map(({ icon: Icon, title, tag, value, desc }) => (
            <div key={title} className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition hover:border-[color:var(--gold)]/60">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color:var(--gold)]/15 text-[color:var(--gold)]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold sm:text-base">{title}</h3>
                    <span className="shrink-0 rounded-full border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-2 py-0.5 text-[11px] font-bold text-[color:var(--gold)]">
                      {tag}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground line-through">De {value}</span>
                    <span className="rounded-full bg-fire px-2 py-0.5 text-[11px] font-bold text-white">GRÁTIS hoje</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total dos bônus */}
        <div className="mx-auto mt-5 max-w-xl">
          <div className="relative overflow-hidden rounded-xl border border-[color:var(--gold)]/40 bg-gradient-to-br from-[color:var(--gold)]/10 via-transparent to-[color:var(--ember)]/10 p-4 text-center backdrop-blur">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)]/70 to-transparent" />
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Valor total
              </span>
              <span className="font-display text-2xl font-black text-muted-foreground/80 line-through decoration-[color:var(--ember)]/60 decoration-2 sm:text-3xl">
                R$ 97,90
              </span>
              <span className="rounded-full bg-fire px-2.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-white shadow-fire">
                GRÁTIS hoje
              </span>
            </div>
          </div>
        </div>

        {/* CTA pós-bônus */}
        <div className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-2">
          <a href="#oferta" onClick={() => trackInitiateCheckout("bonus-cta")} className="btn-fire shine-on-hover !text-base !px-8 !py-4 w-full justify-center">
            Quero o eBook + os 4 bônus <ArrowRight className="h-4 w-4" />
          </a>

          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Tudo isso por R$ 47,90 · acesso imediato
          </span>
        </div>
      </div>
    </section>
  );
}

function Results() {
  const before = ["Sem saber qual carne comprar", "Preços no chute", "Cliente esporádico", "Estresse na produção", "Lucro apertado"];
  const after = ["Carnes escolhidas com estratégia", "Preços com margem garantida", "Cliente fiel toda semana", "Rotina fluida e organizada", "Lucro previsível e crescente"];
  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-6xl 3xl:max-w-[1800px] px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Transformação</SectionTag>
          <h2 className="mt-6 max-w-3xl h-fluid-h2 font-black">
            Do improviso para o <span className="text-gradient-fire">negócio de verdade</span>
          </h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/60" /> Antes
            </div>
            <h3 className="mt-3 text-2xl font-bold">Você hoje</h3>
            <ul className="mt-5 space-y-3 text-muted-foreground">
              {before.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-1 h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-3xl border border-[color:var(--ember)]/40 bg-gradient-to-br from-[color:var(--ember)]/10 to-[color:var(--gold)]/5 p-8 shadow-fire">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[color:var(--gold)]">
              <Flame className="h-4 w-4" /> Depois
            </div>
            <h3 className="mt-3 text-2xl font-bold">Você com o método</h3>
            <ul className="mt-5 space-y-3">
              {after.map((a) => (
                <li key={a} className="flex items-start gap-3">
                  <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-fire">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}


function Testimonials() {
  const { data: realFeedbacks } = useQuery({
    queryKey: ["public-feedbacks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_feedback")
        .select("id, rating, comment, created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const staticItems = [
    {
      name: "Carlos M.",
      role: "Empreendedor iniciante",
      text: "Comecei com pouco e no primeiro mês já paguei o investimento do eBook várias vezes. A parte de precificação abriu meus olhos.",
      img: chefPortrait.url,
      rating: 5
    },
    {
      name: "Marina R.",
      role: "Renda extra",
      text: "Vendia espetinho aos sábados no chute. Hoje vendo todo dia, com tempero exclusivo e clientes fiéis.",
      img: author.url,
      rating: 5
    },
    {
      name: "João P.",
      role: "Trailer de espetinhos",
      text: "Reduzi desperdício, aumentei a margem e o movimento não para. O checklist de produção mudou minha rotina.",
      img: chefWorking.url,
      rating: 5
    },
  ];

  const displayItems = realFeedbacks && realFeedbacks.length > 0 
    ? realFeedbacks.map((f: any) => ({
        name: "Aluno",
        role: "Aluno do Curso",
        text: f.comment || "",
        img: author.url,
        rating: f.rating
      }))
    : staticItems;


  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Prova Social</SectionTag>
          <h2 className="mt-6 max-w-3xl h-fluid-h2 font-black">
            O QUE OS ALUNOS <span className="text-gradient-fire">ESTÃO FALANDO?</span>
          </h2>
          <p className="mt-3 max-w-2xl text-xs uppercase tracking-widest text-muted-foreground">
            Feedbacks reais de quem concluiu nossos treinamentos e está colhendo resultados.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {displayItems.map((t: any, i: number) => (

            <div key={i} className="glass flex flex-col rounded-2xl p-6 hover:border-[color:var(--gold)]/40 transition-colors">
              <div className="flex gap-0.5 text-[color:var(--gold)]">
                {Array.from({ length: 5 }).map((_, starIdx) => (
                  <Star key={starIdx} className={`h-4 w-4 ${t.rating >= starIdx + 1 ? 'fill-current' : 'opacity-20'}`} />
                ))}
              </div>
              <p className="mt-4 text-muted-foreground italic">"{t.text}"</p>
              <div className="mt-6 flex items-center gap-3">
                <img src={t.img} alt={t.name} className="h-11 w-11 rounded-full object-cover border border-white/10" loading="lazy" decoding="async" />
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}

function Offer() {
  const features = [
    "eBook completo com 7 Módulos e 27 Capítulos",
    "4 bônus exclusivos (artes, cardápio, certificado e calculadora)",
    "Acesso imediato após o pagamento",
    "Garantia incondicional de 7 dias",
  ];
  return (
    <section id="oferta" className="relative py-16 sm:py-24">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-10 h-72 w-72 rounded-full bg-[color:var(--ember)]/10 blur-[120px]" />
        <div className="absolute right-1/4 bottom-10 h-72 w-72 rounded-full bg-[color:var(--gold)]/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Offer card */}
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[color:var(--card)]/60 p-7 shadow-2xl backdrop-blur-xl sm:p-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--ember)]/70 to-transparent" />

            {/* Tag */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ember)]/25 bg-[color:var(--ember)]/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--ember)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ember)] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--ember)]" />
                </span>
                Oferta por tempo limitado
              </span>
            </div>

            {/* eBook Price Container */}
            <div className="mt-8">
              <div className="text-center [font-variant-numeric:tabular-nums]">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/10 px-3 py-1 invisible h-0 overflow-hidden">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--ember)]" />
                  <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--ember)]"></span>
                </div>
                
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                  De <span className="text-base font-black text-muted-foreground/90 line-through decoration-[color:var(--ember)]/60 decoration-2">R$ 97,90</span> por apenas
                </div>
                
                <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                  Estamos formando a maior comunidade de espeteiros do Brasil — por isso o valor está simbólico no lançamento.
                </p>

                <div className="mt-3 flex items-start justify-center gap-1.5">
                  <span className="mt-3 text-xl font-semibold text-[color:var(--gold)]">R$</span>
                  <span className="font-display text-7xl leading-none tracking-tight text-gradient-fire sm:text-8xl">
                    47
                  </span>
                  <span className="mt-3 text-xl font-semibold text-[color:var(--gold)]">,90</span>
                </div>

                <div className="mt-3 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-3 py-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--gold)]">Economize 76%</span>
                    <span className="h-3 w-px bg-[color:var(--gold)]/40" />
                    <span className="text-xs font-bold text-[color:var(--gold)]">R$ 50,00 OFF</span>
                  </div>
                </div>

                <div className="mt-4 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">ou</span>
                    <span className="text-sm font-bold text-[color:var(--gold)]">3x de R$ 17,00</span>
                    <span className="text-[11px] text-muted-foreground">no cartão</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="my-7 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <ul className="grid gap-3">
              {features.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/15">
                    <Check className="h-3 w-3 text-[color:var(--ember)]" strokeWidth={3} />
                  </span>
                  <span className="text-sm leading-relaxed text-foreground/85">{t}</span>
                </li>
              ))}
            </ul>

            {/* Countdown */}
            <div className="mt-7 rounded-2xl border border-[color:var(--ember)]/25 bg-[color:var(--ember)]/[0.05] p-4">
              <div className="mb-2.5 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--ember)]">
                <Clock className="h-3 w-3" />
                Promoção termina em
              </div>
              <Countdown hours={72} />
            </div>

            <div className="mt-6 space-y-4">
              <CheckoutButton label="Começar Agora" />

            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <GuaranteeSeal />
              <div className="flex flex-col text-[11px] uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Compra segura</span>
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Acesso imediato</span>
              </div>
            </div>
          </div>

          {/* Guarantee card */}
          <div className="relative overflow-hidden rounded-[2rem] border border-[color:var(--gold)]/30 bg-gradient-to-br from-[color:var(--gold)]/[0.08] via-transparent to-[color:var(--ember)]/[0.08] p-7 backdrop-blur-xl sm:p-9 flex flex-col">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)]/70 to-transparent" />

            <div className="flex justify-center lg:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/30 bg-[color:var(--gold)]/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--gold)]">
                <ShieldCheck className="h-3 w-3" />
                Satisfação Garantida
              </span>
            </div>

            <div className="mt-6 flex flex-col items-center text-center lg:items-start lg:text-left">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[color:var(--gold)]/20 blur-2xl" />
                <div className="relative grid h-20 w-20 place-items-center rounded-full border border-[color:var(--gold)]/40 bg-gradient-to-br from-[color:var(--gold)]/25 to-[color:var(--ember)]/20">
                  <Award className="h-10 w-10 text-[color:var(--gold)]" />
                </div>
              </div>

              <h3 className="mt-5 font-display text-2xl leading-tight sm:text-3xl">
                Garantia <span className="text-gradient-fire">incondicional</span>
                <br className="hidden sm:block" /> de 7 dias
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Teste o método sem pressa. Se por qualquer motivo não gostar,
                devolvemos <strong className="text-foreground">100% do seu dinheiro</strong>. O risco é todo nosso.
              </p>
            </div>

            <ul className="mt-6 grid gap-2.5 border-t border-white/5 pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={3} /> Reembolso em até 7 dias</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={3} /> Sem burocracia ou perguntas</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={3} /> Devolução 100% do valor pago</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}




function FAQ() {
  const { ref, inView } = useInView<HTMLDivElement>("500px");

  return (
    <section id="faq" className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <SectionTag>FAQ</SectionTag>
          <h2 className="mt-6 h-fluid-h2 font-black">
            Tire suas dúvidas com a <span className="text-gradient-fire">assistente</span>
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Clique em uma pergunta e receba a resposta na hora, como em um chat.
          </p>
        </div>

        {/* O chat é interativo e fica abaixo da dobra: só carrega quando o
            visitante chega perto da seção. Até lá, as perguntas e respostas são
            renderizadas no servidor (conteúdo indexável e sem JS). */}
        <div ref={ref} className="mt-10">
          {inView ? (
            <Suspense fallback={<BrasaChatFallback />}>
              <BrasaChat />
            </Suspense>
          ) : (
            <BrasaChatFallback />
          )}
        </div>
      </div>
    </section>
  );
}

function BrasaChatFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-6">
      <div className="rounded-2xl border border-border bg-card/60 p-3 backdrop-blur sm:p-4">
        <div className="mb-3 flex items-center gap-2 px-2 pt-1 text-xs uppercase tracking-widest text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5 text-[color:var(--gold)]" />
          Perguntas
        </div>
        <ul className="space-y-2">
          {landingFaqs.map((f) => (
            <li
              key={f.q}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-left text-sm"
            >
              <span className="font-medium">{f.q}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[520px] flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
        <div className="flex items-center gap-3 border-b border-border/60 pb-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-fire shadow-fire">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Brasa • Assistente</div>
            <div className="text-xs text-muted-foreground">Online • responde na hora</div>
          </div>
        </div>
        <div className="space-y-3">
          {landingFaqs.slice(0, 3).map((f) => (
            <div key={f.q} className="rounded-xl border border-border bg-background/50 p-3 text-sm">
              <p className="font-semibold">{f.q}</p>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinalCTA() {
  return (
    <section className="relative py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[1.5rem] p-6 text-center sm:rounded-[2rem] sm:p-16">
          <img
            src={skewersFlat.url}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            width={1280}
            height={800}
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-20"
          />

          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background/90 via-background/80 to-[color:var(--ember)]/50" />
          <SectionTag>Última chamada</SectionTag>
          <h2 className="mx-auto mt-6 max-w-3xl h-fluid-h2 font-black">
            A brasa está pronta. <br />
            <span className="text-gradient-fire">Falta só você acender o fogo.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Cada dia sem o método é dinheiro deixado na tábua. Comece hoje, com garantia de 7 dias.
          </p>
          <div className="mt-10 flex justify-center">
            <a href="#oferta" onClick={() => trackInitiateCheckout("final-cta")} className="btn-fire shine-on-hover w-full sm:w-auto text-base sm:text-lg sm:!px-10 sm:!py-5 justify-center">
              Quero o eBook agora <ArrowRight className="h-5 w-5" />
            </a>

          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60 py-12">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center">
            <img
              src={brandLockup.url}
              alt="Ronnei na Veia"
              width={330}
              height={110}
              decoding="async"
              loading="lazy"
              className="h-11 w-auto shrink-0 object-contain object-left"
            />
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            O método completo do <strong className="text-foreground">Ronnei</strong> para sair do zero, montar sua barraca e faturar com espetinho — mesmo sem experiência, sem capital alto e sem depender de sorte.
          </p>
          <p className="mt-3 text-xs uppercase tracking-widest text-[color:var(--gold)]">
            Do zero aos 10k · Passo a passo real
          </p>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-widest text-[color:var(--gold)]">Institucional</h4>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/politica-de-privacidade" className="hover:text-foreground">Política de Privacidade</Link></li>
            <li><Link to="/termos-de-uso" className="hover:text-foreground">Termos de Uso</Link></li>
            <li><Link to="/perguntas-frequentes" className="hover:text-foreground">Perguntas frequentes</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-widest text-[color:var(--gold)]">Redes Sociais</h4>
          <div className="mt-4 flex flex-wrap gap-3">
            <a 
              href="https://www.tiktok.com/@espetinhonaveiacomronne3" 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label="TikTok" 
              className="grid h-10 w-10 place-items-center rounded-full border border-border transition-colors hover:border-[color:var(--gold)]/60 hover:text-[color:var(--gold)]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M19.6 6.8a5.4 5.4 0 0 1-3.2-1.1 5.4 5.4 0 0 1-2-3.7h-3.1v13.1a2.8 2.8 0 1 1-2-2.7V9.1a5.9 5.9 0 1 0 5.1 5.9V9.3a8.5 8.5 0 0 0 5.2 1.8V8a5.4 5.4 0 0 1 0-1.2z"/>
              </svg>
            </a>
            <a 
              href="https://www.instagram.com/espetinhonaveiacomronnei/" 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label="Instagram" 
              className="grid h-10 w-10 place-items-center rounded-full border border-border transition-colors hover:border-[color:var(--gold)]/60 hover:text-[color:var(--gold)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </a>
            <a 
              href="https://www.youtube.com/@Espetinhonaveiacomronnei" 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label="YouTube" 
              className="grid h-10 w-10 place-items-center rounded-full border border-border transition-colors hover:border-[color:var(--gold)]/60 hover:text-[color:var(--gold)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path>
                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
              </svg>
            </a>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-border/60 px-4 pt-6 text-center text-xs leading-relaxed text-muted-foreground sm:px-6">
        <p className="mb-2 uppercase tracking-widest font-semibold text-[11px]">
          CNPJ 45.680.415/0001-91
        </p>
        <p className="mb-2 opacity-80">
          Suporte de segunda a sexta, das 9h às 18h.
        </p>
        <p>© {new Date().getFullYear()} Ronnei na Veia. Todos os direitos reservados. Este produto não garante retornos financeiros — os resultados dependem da aplicação do método.</p>
        <p className="mt-2 opacity-80">
          Desenvolvido por{" "}
          <a
            href="https://ardevs.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            AR Devs
          </a>
        </p>
      </div>
    </footer>
  );
}

function Objection() {
  const items = [
    {
      icon: DollarSign,
      title: "Não tenho dinheiro pra investir",
      desc: "Ronnei começou sem R$ 1.000. Mostramos a lista exata do que comprar primeiro — dá pra iniciar com menos de R$ 500.",
    },
    {
      icon: BookOpen,
      title: "Nunca vendi nada na vida",
      desc: "O eBook é passo a passo, sem termo técnico. Se você sabe ler uma receita, você aplica o método.",
    },
    {
      icon: Users,
      title: "Não tenho CNPJ nem estrutura",
      desc: "Você começa como vendedor autônomo. CNPJ e loja física vêm depois — só quando o lucro justifica.",
    },
  ];
  return (
    <section className="relative py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <h2 className="mt-4 max-w-2xl h-fluid-h2 font-black">
            "Mas eu vou <span className="text-gradient-fire">conseguir mesmo</span>?"
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            As três travas mais comuns — e por que nenhuma delas te impede de começar hoje.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors hover:border-[color:var(--gold)]/40"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--gold)]/40 to-transparent" />
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--gold)]/30 bg-[color:var(--gold)]/10">
                  <Icon className="h-5 w-5 text-[color:var(--gold)]" />
                </span>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-foreground sm:text-base">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NotForYou() {
  const items = [
    "Quem quer ficar rico em 7 dias",
    "Quem não topa acordar cedo",
    "Quem já tem espetaria consolidada",
    "Quem procura fórmula mágica",
  ];
  return (
    <section className="relative py-10 sm:py-14">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 3xl:max-w-[1500px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur sm:p-8">
          <div className="flex flex-col items-center text-center">
            <SectionTag>Para quem NÃO é</SectionTag>
            <h2 className="mt-4 max-w-xl text-xl font-black sm:text-2xl">
              Seja <span className="text-gradient-fire">honesto</span> com você mesmo
            </h2>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {items.map((t) => (
              <div
                key={t}
                className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-background/40 px-3.5 py-2.5"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/10">
                  <X className="h-3 w-3 text-[color:var(--ember)]" strokeWidth={3} />
                </span>
                <span className="text-xs text-muted-foreground sm:text-sm">{t}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Se você se enquadra em algum item acima, esse eBook <strong className="text-foreground">não vai funcionar pra você</strong> — e tudo bem.
          </p>
        </div>
      </div>
    </section>
  );
}

function ForYou() {
  const items = [
    "Quer uma renda extra",
    "Já tentou e não lucrou",
    "Curte churrasco",
    "Está desempregado",
    "Quer aumentar a margem",
    "Sonha com o próprio negócio",
  ];
  return (
    <section className="relative py-10 sm:py-14">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 3xl:max-w-[1500px]">
        <div className="flex flex-col items-center text-center">
          <SectionTag>Para quem é</SectionTag>
          <h2 className="mt-4 max-w-2xl text-2xl sm:text-3xl font-black">
            Você se <span className="text-gradient-fire">identifica</span>?
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((t) => (
            <div
              key={t}
              className="group flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center backdrop-blur-sm transition-all hover:border-[color:var(--gold)]/40 hover:bg-white/[0.06]"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--flame)] shadow-[0_0_8px_color-mix(in_oklab,var(--flame)_60%,transparent)]" />
              <span className="text-xs sm:text-sm font-medium text-foreground/90">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function StickyMobileCTA() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-3 pt-3 backdrop-blur-xl md:hidden safe-bottom"
      style={{ paddingBottom: "0.75rem" }}
    >
      <a href="#oferta" onClick={() => trackInitiateCheckout("sticky-cta")} className="btn-fire w-full !py-3 text-sm">
        Quero o eBook por R$ 47,90 <ArrowRight className="h-4 w-4" />
      </a>

    </div>
  );
}

function AuroraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="animate-aurora absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle at 30% 30%, oklch(0.63 0.24 27 / 0.45), transparent 60%)" }}
      />
      <div
        className="animate-aurora-2 absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle at 60% 40%, oklch(0.72 0.20 50 / 0.35), transparent 65%)" }}
      />
      <div
        className="animate-aurora absolute bottom-0 left-1/3 h-[480px] w-[480px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle at 50% 50%, oklch(0.82 0.15 85 / 0.22), transparent 70%)" }}
      />
    </div>
  );
}

function LandingPage() {
  // PERFORMANCE:
  // A landing é sempre visível. Nenhum observer, medição de layout
  // ou liberação de conteúdo depende do scroll.

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />

        <ForYou />
        <Objection />
        <Benefits />
        <ProfitCalculator />
        <AuthorSolution />
        <SocialProof />
        <Modules />
        <Bonuses />
        <NotForYou />
        <Offer />
        <FAQ />

        
      </main>
      <Footer />
      {/* <StickyMobileCTA /> */}
      
    </div>
  );
}
