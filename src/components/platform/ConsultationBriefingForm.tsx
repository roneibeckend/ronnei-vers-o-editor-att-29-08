import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  BRIEFING_STEPS,
  CHALLENGE_OPTIONS,
  EMPTY_BRIEFING,
  REVENUE_OPTIONS,
  isStepValid,
  type ConsultationBriefing,
} from "@/lib/consultation-briefing";

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`rounded-full border px-3 py-2 text-sm transition-colors active:scale-[0.98] ${
            value === opt
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Briefing estruturado em etapas — mobile first, ~2 minutos de preenchimento. */
export function ConsultationBriefingForm({
  initial,
  submitting,
  submitLabel = "Salvar briefing",
  onSubmit,
}: {
  initial?: Partial<ConsultationBriefing> | null;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (value: ConsultationBriefing) => void;
}) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<ConsultationBriefing>({ ...EMPTY_BRIEFING, ...(initial ?? {}) });

  const set = <K extends keyof ConsultationBriefing>(key: K, v: ConsultationBriefing[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  const total = BRIEFING_STEPS.length;
  const stepOk = useMemo(() => isStepValid(step, value), [step, value]);
  const isLast = step === total - 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{BRIEFING_STEPS[step].title}</span>
          <span>
            Etapa {step + 1} de {total}
          </span>
        </div>
        <Progress value={((step + 1) / total) * 100} className="h-1.5" />
      </div>

      <div className="space-y-4">
        {step === 0 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="br-business">Nome do negócio</Label>
              <Input
                id="br-business"
                value={value.business_name}
                maxLength={120}
                placeholder="Ex.: Espetinhos do Zé"
                onChange={(e) => set("business_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-city">Cidade/Estado</Label>
              <Input
                id="br-city"
                value={value.city_state}
                maxLength={120}
                placeholder="Ex.: Campinas/SP"
                onChange={(e) => set("city_state", e.target.value)}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="br-whats">WhatsApp</Label>
              <Input
                id="br-whats"
                type="tel"
                inputMode="tel"
                value={value.whatsapp}
                maxLength={30}
                placeholder="(11) 99999-9999"
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-insta">Instagram</Label>
              <Input
                id="br-insta"
                value={value.instagram}
                maxLength={80}
                placeholder="@seunegocio"
                onChange={(e) => set("instagram", e.target.value)}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2">
              <Label>Você já trabalha com espetinhos?</Label>
              <ChipGroup
                options={["Sim", "Não"]}
                value={value.works_with_skewers}
                onChange={(v) => set("works_with_skewers", v as ConsultationBriefing["works_with_skewers"])}
              />
            </div>
            <div className="space-y-2">
              <Label>Qual seu faturamento mensal atual?</Label>
              <ChipGroup
                options={REVENUE_OPTIONS}
                value={value.monthly_revenue}
                onChange={(v) => set("monthly_revenue", v as ConsultationBriefing["monthly_revenue"])}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-2">
              <Label>Qual seu principal desafio hoje?</Label>
              <ChipGroup
                options={CHALLENGE_OPTIONS}
                value={value.main_challenge}
                onChange={(v) => set("main_challenge", v as ConsultationBriefing["main_challenge"])}
              />
            </div>
            {value.main_challenge === "Outro" && (
              <div className="space-y-1.5">
                <Label htmlFor="br-other">Qual?</Label>
                <Input
                  id="br-other"
                  value={value.main_challenge_other ?? ""}
                  maxLength={120}
                  placeholder="Descreva em poucas palavras"
                  onChange={(e) => set("main_challenge_other", e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="br-goal">O que você espera alcançar com a consultoria?</Label>
              <Textarea
                id="br-goal"
                rows={3}
                maxLength={500}
                value={value.goal}
                placeholder="Ex.: montar meu delivery e parar de vender no prejuízo"
                onChange={(e) => set("goal", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-q">Existe alguma dúvida específica que você quer tratar? (opcional)</Label>
              <Textarea
                id="br-q"
                rows={3}
                maxLength={500}
                value={value.specific_question ?? ""}
                placeholder="Ex.: como calcular o preço do combo?"
                onChange={(e) => set("specific_question", e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {step > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Button>
        )}
        {isLast ? (
          <Button
            type="button"
            className="flex-1"
            disabled={!stepOk || submitting}
            onClick={() => onSubmit(value)}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {submitLabel}
          </Button>
        ) : (
          <Button type="button" className="flex-1" disabled={!stepOk} onClick={() => setStep((s) => s + 1)}>
            Continuar
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
