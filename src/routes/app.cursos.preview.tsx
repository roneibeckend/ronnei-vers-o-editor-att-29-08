import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  Lock,
  Play,
  ChevronLeft,
  ChevronRight,
  Flame,
  ListChecks,
  FileText,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/platform/Shell";
import { supabase } from "@/integrations/supabase/client";
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";

export const Route = createFileRoute("/app/cursos/preview")({
  beforeLoad: async () => {
    const data = await getIntegrationConfig('interactive_previews');
    if (data?.status === false) {
      throw redirect({ to: '/app/cursos' });
    }
  },
  head: () => ({ meta: [{ title: "Previews — Curso interativo" }] }),
  component: PreviewPage,
});

type Stage = {
  id: number;
  title: string;
  duration: string;
  tasks: string[];
  status: "done" | "current" | "locked";
};

const stages: Stage[] = [
  {
    id: 1,
    title: "Escolhendo a carne certa",
    duration: "6:20",
    status: "done",
    tasks: ["Identificar 3 cortes ideais", "Calcular rendimento por kg", "Anotar fornecedor"],
  },
  {
    id: 2,
    title: "Corte e tempero",
    duration: "8:45",
    status: "done",
    tasks: ["Cortar em cubos de 3cm", "Aplicar cura seca", "Descansar 30 min"],
  },
  {
    id: 3,
    title: "Montagem do espeto",
    duration: "5:10",
    status: "current",
    tasks: ["Padronizar 6 cubos por espeto", "Alternar com gordura", "Espaçamento uniforme"],
  },
  {
    id: 4,
    title: "Ponto da brasa perfeita",
    duration: "9:00",
    status: "locked",
    tasks: ["Preparar carvão", "Medir temperatura", "Rotação de 4 lados"],
  },
  {
    id: 5,
    title: "Vendendo o primeiro lote",
    duration: "7:30",
    status: "locked",
    tasks: ["Definir preço", "Postar no WhatsApp", "Registrar venda"],
  },
];

function PreviewPage() {
  const [variant, setVariant] = useState<"A" | "B">("A");
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <PageHeader
          title="Curso interativo — Previews"
          subtitle="Duas propostas de aula guiada por etapas. Escolha qual seguir."
        />
        <Link to="/app/cursos" className="btn-ghost-fire text-sm w-full sm:w-auto">
          ← Cursos
        </Link>
      </div>

      <div className="mb-6 flex overflow-x-auto pb-2 gap-2 scrollbar-hidden">
        <div className="inline-flex shrink-0 gap-2 rounded-full border border-white/10 bg-black/40 p-1">
          <button
            onClick={() => setVariant("A")}
            className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-all ${
              variant === "A" ? "bg-fire text-white shadow-lg shadow-fire/20" : "text-muted-foreground hover:text-white"
            }`}
          >
            Direção A — Stepper horizontal
          </button>
          <button
            onClick={() => setVariant("B")}
            className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-all ${
              variant === "B" ? "bg-fire text-white shadow-lg shadow-fire/20" : "text-muted-foreground hover:text-white"
            }`}
          >
            Direção B — Trilha vertical (skewer path)
          </button>
        </div>
      </div>

      {variant === "A" ? <VariantA /> : <VariantB />}
    </div>
  );
}

/* ============================================================
   VARIANT A — Horizontal stepper with fire nodes on top,
   lesson card + checklist below, prev/next arrows.
   ============================================================ */
function VariantA() {
  const [active, setActive] = useState(3);
  const current = stages.find((s) => s.id === active)!;
  const done = stages.filter((s) => s.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
          <span>Progresso da trilha</span>
          <span>
            {done} de {stages.length} etapas concluídas
          </span>
        </div>
        <div className="relative overflow-x-auto pb-4 scrollbar-hidden">
          <div className="flex items-center justify-between min-w-[600px] px-2">
            <div className="absolute left-0 right-0 top-6 h-1 rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-6 h-1 rounded-full bg-gradient-to-r from-fire to-gold"
              style={{ width: `${((done - 0.5) / (stages.length - 1)) * 100}%` }}
            />
            {stages.map((s) => {
              const isActive = s.id === active;
              const isDone = s.status === "done";
              const isLocked = s.status === "locked";
              return (
                <button
                  key={s.id}
                  disabled={isLocked}
                  onClick={() => setActive(s.id)}
                  className="relative z-10 flex flex-col items-center gap-2 touch-target"
                >
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-full border-2 transition ${
                      isDone
                        ? "border-fire bg-fire text-white"
                        : isActive
                          ? "border-gold bg-black text-gold shadow-[0_0_20px_hsl(var(--gold)/0.5)]"
                          : "border-white/15 bg-black/60 text-muted-foreground"
                    } ${isLocked ? "opacity-50" : ""}`}
                  >
                    {isDone ? (
                      <Check className="h-5 w-5" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <span className="font-display font-bold">{s.id}</span>
                    )}
                  </span>
                  <span className="w-24 text-center text-[11px] leading-tight text-muted-foreground">
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lesson panel */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="glass overflow-hidden rounded-2xl">
          <div className="relative aspect-video bg-black">
            <div className="absolute inset-0 grid place-items-center">
              <button className="grid h-20 w-20 place-items-center rounded-full bg-fire shadow-fire transition hover:scale-105">
                <Play className="h-8 w-8 text-white" />
              </button>
            </div>
            <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs">
              {current.duration}
            </div>
            <div className="absolute right-3 top-3 rounded-full bg-gold/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
              Etapa {current.id}
            </div>
          </div>
          <div className="p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Aula atual
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold">{current.title}</h2>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => active > 1 && setActive(active - 1)}
                disabled={active === 1}
                className="btn-ghost-fire text-sm disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Etapa anterior
              </button>
              <button
                onClick={() => active < stages.length && setActive(active + 1)}
                className="btn-fire text-sm"
              >
                <Check className="h-4 w-4" /> Concluir e avançar
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <aside className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <ListChecks className="h-4 w-4" /> Missões desta etapa
          </div>
          <ul className="space-y-2">
            {current.tasks.map((t, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/30 p-3 text-sm"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20">
                  <Check className="h-3 w-3 text-muted-foreground" />
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs text-gold/90">
            <Flame className="mr-1 inline h-3.5 w-3.5" /> Complete todas as missões para acender
            a próxima etapa.
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
   VARIANT B — Vertical "skewer path" left rail with numbered
   glowing nodes, right panel with tabs (Aula / Checklist /
   Materiais) and bottom action bar.
   ============================================================ */
function VariantB() {
  const [active, setActive] = useState(3);
  const [tab, setTab] = useState<"aula" | "checklist" | "materiais">("aula");
  const current = stages.find((s) => s.id === active)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left skewer path */}
      <aside className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Trilha do espeto
          </div>
          <Flame className="h-4 w-4 text-fire" />
        </div>
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-fire via-gold/40 to-white/5" />
          <ul className="space-y-4">
            {stages.map((s) => {
              const isActive = s.id === active;
              const isDone = s.status === "done";
              const isLocked = s.status === "locked";
              return (
                <li key={s.id}>
                  <button
                    onClick={() => !isLocked && setActive(s.id)}
                    disabled={isLocked}
                    className={`group flex w-full items-center gap-4 rounded-xl p-2 text-left transition ${
                      isActive ? "bg-fire/10" : "hover:bg-white/5"
                    } ${isLocked ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 ${
                        isDone
                          ? "border-fire bg-fire text-white"
                          : isActive
                            ? "border-gold bg-black text-gold shadow-[0_0_16px_hsl(var(--gold)/0.5)]"
                            : "border-white/15 bg-black text-muted-foreground"
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4" />
                      ) : isLocked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-sm font-bold">{s.id}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.title}</span>
                      <span className="text-[11px] text-muted-foreground">{s.duration}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Right content */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="relative aspect-video bg-black">
          <div className="absolute inset-0 grid place-items-center">
            <button className="grid h-20 w-20 place-items-center rounded-full bg-fire shadow-fire transition hover:scale-105">
              <Play className="h-8 w-8 text-white" />
            </button>
          </div>
          <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs">
            Etapa {current.id} de {stages.length}
          </div>
        </div>

        <div className="p-6">
          <h2 className="font-display text-2xl font-bold">{current.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Siga cada missão abaixo. Ao marcar todas, a próxima etapa é liberada automaticamente.
          </p>

          <div className="mt-5 flex gap-2 border-b border-white/10">
            {(
              [
                ["aula", "Aula"],
                ["checklist", "Checklist"],
                ["materiais", "Materiais"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                  tab === id
                    ? "border-fire text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-[180px]">
            {tab === "aula" && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nesta etapa você vai aprender {current.title.toLowerCase()}. Assista o vídeo, pratique
                junto com o Ronnei e volte para marcar as missões conforme forem executadas na sua
                bancada.
              </p>
            )}
            {tab === "checklist" && (
              <ul className="space-y-2">
                {current.tasks.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--fire))]"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {tab === "materiais" && (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-lg border border-white/5 p-3">
                  <span>
                    <FileText className="mr-1.5 inline h-4 w-4" /> PDF · Guia da etapa {current.id}
                  </span>
                  <button className="text-gold hover:underline">Baixar</button>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-white/5 p-3">
                  <span>
                    <FileText className="mr-1.5 inline h-4 w-4" /> XLSX · Planilha de apoio
                  </span>
                  <button className="text-gold hover:underline">Baixar</button>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/40 p-4">
          <button
            onClick={() => active > 1 && setActive(active - 1)}
            disabled={active === 1}
            className="btn-ghost-fire text-sm disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="text-xs text-muted-foreground">
            {current.tasks.length} missões nesta etapa
          </div>
          <button
            onClick={() => active < stages.length && setActive(active + 1)}
            className="btn-fire text-sm"
          >
            Concluir e avançar <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
