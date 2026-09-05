import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Eye, Loader2, Mail, RefreshCw, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EMAIL_CATALOG, sampleDataFor, validateEmailData } from "@/emails/catalog";
import { previewEmailTemplate, sendTemplateTestEmail } from "@/lib/email-preview.functions";
import { getEmailTemplates, setEmailTemplateProductionOverride } from "@/lib/email-templates.functions";

export function EmailSystemTemplatesPanel() {
  const previewFn = useServerFn(previewEmailTemplate);
  const sendTestFn = useServerFn(sendTemplateTestEmail);
  const getTemplatesFn = useServerFn(getEmailTemplates);
  const setOverrideFn = useServerFn(setEmailTemplateProductionOverride);

  const [event, setEvent] = useState(EMAIL_CATALOG[0]!.event);
  const [values, setValues] = useState<Record<string, string>>(() => sampleDataFor(EMAIL_CATALOG[0]!.event));
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    text?: string;
    source: "database_override" | "code" | "database_fallback" | "generic_fallback";
    templateId: string | null;
    overrideEnabled: boolean;
    hasCodeTemplate: boolean;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "html" | "texto">("visual");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [dbTemplates, setDbTemplates] = useState<any[]>([]);
  const [isTogglingOverride, setIsTogglingOverride] = useState(false);

  const entry = useMemo(() => EMAIL_CATALOG.find((e) => e.event === event)!, [event]);
  const validation = useMemo(() => validateEmailData(event, values), [event, values]);

  const loadPreview = useCallback(
    async (ev: string, data: Record<string, string>) => {
      setIsLoading(true);
      try {
        const result = await previewFn({ data: { event: ev, data } });
        setPreview({
          subject: result.subject,
          html: result.html,
          text: result.text,
          source: result.source,
          templateId: result.templateId,
          overrideEnabled: result.overrideEnabled,
          hasCodeTemplate: result.hasCodeTemplate,
        });
      } catch (err: any) {
        setPreview(null);
        toast.error("Erro ao gerar prévia: " + (err?.message ?? "desconhecido"));
      } finally {
        setIsLoading(false);
      }
    },
    [previewFn],
  );

  useEffect(() => {
    const data = sampleDataFor(event);
    setValues(data);
    void loadPreview(event, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  const refreshDbTemplates = useCallback(async () => {
    try {
      const rows = await getTemplatesFn();
      setDbTemplates(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      toast.error("Erro ao carregar modelos editáveis: " + (err?.message ?? "desconhecido"));
    }
  }, [getTemplatesFn]);

  useEffect(() => {
    void refreshDbTemplates();
  }, [refreshDbTemplates]);

  const matchingDbTemplate = useMemo(
    () => dbTemplates.find((item) => item?.name === event) ?? null,
    [dbTemplates, event],
  );

  const sourceLabel = useMemo(() => {
    if (!preview) return "Carregando fonte...";
    if (preview.source === "database_override") return "Banco · override ativo em produção";
    if (preview.source === "code") return "Código · fonte atual da produção";
    if (preview.source === "database_fallback") return "Banco · fallback (não existe versão em código)";
    return "Layout genérico · nenhum template específico";
  }, [preview]);

  const handleToggleOverride = async () => {
    if (!matchingDbTemplate?.id) {
      toast.error(`Não existe modelo de banco com o nome exato "${event}".`);
      return;
    }

    const next = !Boolean(matchingDbTemplate.is_production_override);

    if (
      next &&
      typeof window !== "undefined" &&
      !window.confirm(
        `Ativar o modelo de banco "${event}" na PRODUÇÃO? A partir deste momento ele terá prioridade sobre o template em código.`,
      )
    ) {
      return;
    }

    setIsTogglingOverride(true);
    try {
      await setOverrideFn({
        data: {
          id: matchingDbTemplate.id,
          enabled: next,
        },
      });

      toast.success(
        next
          ? "Override de banco ativado na produção."
          : "Override desativado. A produção voltou à prioridade padrão.",
      );

      await refreshDbTemplates();
      await loadPreview(event, values);
    } catch (err: any) {
      toast.error("Falha ao alterar fonte de produção: " + (err?.message ?? "desconhecido"));
    } finally {
      setIsTogglingOverride(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error("Informe o e-mail que receberá o teste.");
      return;
    }
    if (!validation.valid) {
      toast.error(validation.message ?? "Preencha todos os campos obrigatórios.");
      return;
    }
    setIsSending(true);
    try {
      await sendTestFn({ data: { event, to: testEmail, data: values } });
      toast.success(`E-mail de teste "${entry.label}" enviado para ${testEmail}.`);
    } catch (err: any) {
      toast.error("Falha no envio: " + (err?.message ?? "desconhecido"));
    } finally {
      setIsSending(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof EMAIL_CATALOG>();
    EMAIL_CATALOG.forEach((item) => {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list as typeof EMAIL_CATALOG);
    });
    return Array.from(map.entries());
  }, []);

  return (
    <Card className="bg-[#111] border-white/5">
      <CardHeader className="border-b border-white/5">
        <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#ff6a00]" /> Templates do Sistema — Prévia e Teste
        </CardTitle>
        <p className="text-[10px] text-white/40 leading-relaxed">
          Visualize cada e-mail automático com variáveis reais e envie um teste. O envio é bloqueado se algum campo
          obrigatório estiver vazio.
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 grid gap-6 lg:grid-cols-12">
        {/* Lista de eventos */}
        <div className="lg:col-span-3 space-y-4 max-h-[520px] overflow-y-auto pr-1">
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-[9px] uppercase font-bold tracking-widest text-white/30">{category}</p>
              {items.map((item) => (
                <button
                  key={item.event}
                  onClick={() => setEvent(item.event)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all min-h-[44px] ${
                    event === item.event
                      ? "bg-[#ff6a00]/10 border-[#ff6a00] text-white"
                      : "bg-black/40 border-white/5 text-white/60 hover:border-white/20"
                  }`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-tight">{item.label}</p>
                  <code className="text-[9px] text-white/30">{item.event}</code>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Variáveis */}
        <div className="lg:col-span-4 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">Variáveis do evento</p>
            <p className="text-[10px] text-white/30 leading-relaxed">{entry.description}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[9px] uppercase font-bold tracking-widest text-white/30">Fonte que a produção usa agora</p>
                <p className="text-[11px] font-bold text-white mt-1">{sourceLabel}</p>
              </div>

              {matchingDbTemplate && (
                <Badge
                  variant="outline"
                  className={`text-[8px] uppercase ${
                    matchingDbTemplate.is_production_override
                      ? "border-emerald-500/30 text-emerald-300"
                      : "border-white/10 text-white/40"
                  }`}
                >
                  {matchingDbTemplate.is_production_override ? "Banco ativo" : "Banco em rascunho"}
                </Badge>
              )}
            </div>

            {matchingDbTemplate ? (
              <>
                {!matchingDbTemplate.is_production_override && preview?.source === "code" && (
                  <p className="text-[10px] leading-relaxed text-amber-300/80">
                    Existe uma versão editável no banco, mas ela NÃO altera a produção enquanto o override estiver desligado.
                  </p>
                )}

                <Button
                  type="button"
                  onClick={handleToggleOverride}
                  disabled={isTogglingOverride}
                  variant="outline"
                  className="w-full border-white/10 text-white/70 uppercase text-[9px] font-bold h-9"
                >
                  {isTogglingOverride ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : matchingDbTemplate.is_production_override ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                  )}
                  {matchingDbTemplate.is_production_override
                    ? "Desativar override e voltar à prioridade padrão"
                    : "Ativar este modelo de banco na produção"}
                </Button>
              </>
            ) : (
              <p className="text-[10px] leading-relaxed text-white/35">
                Não existe modelo editável no banco com o nome exato <code>{event}</code>. A produção continua usando a fonte indicada acima.
              </p>
            )}
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {entry.fields.map((field) => {
              const empty = !String(values[field.key] ?? "").trim();
              return (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                    {field.label}
                    {field.required ? (
                      <span className="text-[#ff6a00]">*</span>
                    ) : (
                      <span className="text-white/20 normal-case font-normal">(opcional)</span>
                    )}
                  </Label>
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.sample}
                    className={`bg-black/40 h-10 text-[11px] ${
                      field.required && empty ? "border-red-500/60" : "border-white/10"
                    }`}
                  />
                  <code className="text-[9px] text-white/20">{`{{${field.key}}}`}</code>
                </div>
              );
            })}
          </div>

          {validation.valid ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                Todos os campos obrigatórios estão preenchidos. Envio liberado.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Envio bloqueado</p>
                <p className="text-[10px] text-red-300/70 leading-relaxed">
                  Campos obrigatórios ausentes: {validation.missing.map((m) => m.label).join(", ")}.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-white/5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">E-mail para teste</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="seu@email.com"
              className="bg-black/40 border-white/10 h-10 text-[11px]"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void loadPreview(event, values)}
                disabled={isLoading}
                variant="outline"
                className="border-white/10 text-white/70 uppercase text-[10px] font-bold h-10"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                )}
                Atualizar prévia
              </Button>
              <Button
                onClick={handleSendTest}
                disabled={isSending || !validation.valid}
                className="bg-[#ff6a00] text-black font-bold uppercase tracking-widest text-[10px] h-10 disabled:opacity-40"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                ) : (
                  <SendHorizontal className="h-3.5 w-3.5 mr-2" />
                )}
                Enviar teste
              </Button>
            </div>
          </div>
        </div>

        {/* Prévia */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-[#ff6a00]" /> Prévia do e-mail
            </p>
            <Badge variant="outline" className="text-[8px] uppercase border-white/10 text-white/40">
              {entry.event}
            </Badge>
          </div>
          {preview?.subject && (
            <p className="text-[11px] text-white/70 truncate">
              <span className="text-white/30 uppercase text-[9px] font-bold tracking-widest mr-2">Assunto:</span>
              {preview.subject}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(["visual", "html", "texto"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 h-8 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all ${
                  viewMode === mode
                    ? "bg-[#ff6a00]/10 border-[#ff6a00] text-white"
                    : "bg-black/40 border-white/5 text-white/50 hover:border-white/20"
                }`}
              >
                {mode === "visual" ? "Visual" : mode === "html" ? "HTML final" : "Texto"}
              </button>
            ))}
            {preview?.html && (
              <>
                <Button
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      viewMode === "texto" ? preview.text ?? "" : preview.html,
                    );
                    toast.success("Conteúdo copiado.");
                  }}
                  variant="outline"
                  className="border-white/10 text-white/60 uppercase text-[9px] font-bold h-8 px-3"
                >
                  <Copy className="h-3 w-3 mr-1.5" /> Copiar
                </Button>
                <Button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (!w) return toast.error("Permita pop-ups para abrir a prévia.");
                    w.document.write(preview.html);
                    w.document.close();
                  }}
                  variant="outline"
                  className="border-white/10 text-white/60 uppercase text-[9px] font-bold h-8 px-3"
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" /> Abrir
                </Button>
                <span className="text-[9px] text-white/30 tabular-nums">
                  {(new Blob([preview.html]).size / 1024).toFixed(1)} KB
                </span>
              </>
            )}
          </div>

          <div
            className={`rounded-xl overflow-hidden border border-white/10 h-[480px] ${
              viewMode === "visual" ? "bg-white" : "bg-black/60"
            }`}
          >
            {isLoading && !preview ? (
              <div className="h-full flex items-center justify-center bg-black/60">
                <Loader2 className="h-5 w-5 animate-spin text-[#ff6a00]" />
              </div>
            ) : preview ? (
              viewMode === "visual" ? (
                <iframe
                  title="Prévia do e-mail"
                  srcDoc={preview.html}
                  sandbox=""
                  className="w-full h-full border-0"
                />
              ) : (
                <pre className="w-full h-full overflow-auto p-4 text-[10px] leading-relaxed text-emerald-200/80 whitespace-pre-wrap break-words font-mono">
                  {viewMode === "html" ? preview.html : preview.text || "Sem versão em texto."}
                </pre>
              )
            ) : (
              <div className="h-full flex items-center justify-center bg-black/60 text-[10px] uppercase font-bold tracking-widest text-white/20">
                Sem prévia
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
