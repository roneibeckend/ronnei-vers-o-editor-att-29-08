import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  rescheduleConsultation,
  saveConsultationNotes,
  setConsultationMeetLink,
  getConsultationHistory,
  generateConsultationPrepFn,
  sendConsultationPrepEmailFn,
  generateConsultationOutcome,
  sendConsultationOutcomeToClient,
  getConsultationGroup,
  sendConsultationComboReport,
} from "@/lib/consultations-admin.functions";
import {
  buildConsultationReportPdf,
  buildConsultationComboReportPdf,
  buildConsultationSessionPdfs,
} from "@/lib/consultation-pdf";
import { saveBlob } from "@/lib/download";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  CalendarClock,
  Link2,
  StickyNote,
  History,
  Sparkles,
  Send,
  ClipboardCheck,
} from "lucide-react";


type Material = { title: string; url: string };

const dateTimeLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Painel completo de gestão de uma reunião: notas, materiais, reagendamento, link e histórico. */
export function ConsultationManageDialog({
  consultation,
  onClose,
  onSaved,
}: {
  consultation: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [adminNotes, setAdminNotes] = useState("");
  const [studentNotes, setStudentNotes] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [when, setWhen] = useState("");
  const [notifyReschedule, setNotifyReschedule] = useState(true);
  const [meetLink, setMeetLink] = useState("");
  const [notifyLink, setNotifyLink] = useState(false);
  const [prep, setPrep] = useState<any | null>(null);
  const [prepRecipients, setPrepRecipients] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingSummary, setMeetingSummary] = useState("");
  const [clientRecipients, setClientRecipients] = useState("");

  useEffect(() => {
    if (!consultation) return;
    setAdminNotes(consultation.admin_notes ?? "");
    setStudentNotes(consultation.student_notes ?? "");
    setActionPlan(consultation.action_plan ?? "");
    setMaterials(Array.isArray(consultation.materials) ? consultation.materials : []);
    setWhen(dateTimeLocal(consultation.scheduled_at));
    setMeetLink(consultation.meet_link ?? "");
    setPrep(consultation.prep_data ?? null);
    setMeetingNotes(consultation.admin_notes ?? "");
    setMeetingSummary(consultation.meeting_summary ?? "");
    setClientRecipients(consultation.client_email ?? "");
    setPrepRecipients("");
  }, [consultation]);


  const saveNotesFn = useServerFn(saveConsultationNotes);
  const rescheduleFn = useServerFn(rescheduleConsultation);
  const meetLinkFn = useServerFn(setConsultationMeetLink);
  const historyFn = useServerFn(getConsultationHistory);

  const history = useQuery({
    queryKey: ["consultation-history", consultation?.id],
    queryFn: () => historyFn({ data: { id: consultation.id } }),
    enabled: Boolean(consultation?.id),
  });

  const notes = useMutation({
    mutationFn: () =>
      saveNotesFn({
        data: {
          id: consultation.id,
          adminNotes,
          studentNotes,
          actionPlan,
          meetingSummary,
          materials: materials.filter((m) => m.title.trim() && m.url.trim()),
        },
      }),
    onSuccess: () => {
      toast.success("Observações e materiais salvos.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const reschedule = useMutation({
    mutationFn: () =>
      rescheduleFn({
        data: {
          id: consultation.id,
          scheduledAt: new Date(when).toISOString(),
          notify: notifyReschedule,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.googleError) toast.warning(`Reagendado, mas o Google falhou: ${r.googleError}`);
      else toast.success("Reunião reagendada.");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reagendar."),
  });

  const link = useMutation({
    mutationFn: () => meetLinkFn({ data: { id: consultation.id, meetLink, notify: notifyLink } }),
    onSuccess: () => {
      toast.success("Link da reunião atualizado.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar o link."),
  });

  /* ------------------- Preparação automática ------------------- */

  const prepFn = useServerFn(generateConsultationPrepFn);
  const prepEmailFn = useServerFn(sendConsultationPrepEmailFn);
  const outcomeFn = useServerFn(generateConsultationOutcome);
  const clientReportFn = useServerFn(sendConsultationOutcomeToClient);

  const emailList = (value: string) =>
    value
      .split(/[,\s;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

  /** PDF atual da reunião, já com preparação/resumo, para anexar nos e-mails. */
  const currentPdf = (extra?: Record<string, unknown>) =>
    buildConsultationReportPdf({ ...consultation, prep_data: prep, ...extra });

  const generatePrep = useMutation({
    mutationFn: () => prepFn({ data: { id: consultation.id } }),
    onSuccess: (r: any) => {
      setPrep(r?.prep ?? null);
      toast.success("Preparação da reunião gerada.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar a preparação."),
  });

  const sendPrep = useMutation({
    mutationFn: () => {
      const pdf = currentPdf();
      const recipients = emailList(prepRecipients);
      return prepEmailFn({
        data: {
          id: consultation.id,
          ...(recipients.length ? { recipients } : {}),
          filename: pdf.filename,
          pdfBase64: pdf.base64,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Preparação enviada para ${(r?.recipients ?? []).join(", ")}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar a preparação."),
  });

  const generateOutcome = useMutation({
    mutationFn: () => outcomeFn({ data: { id: consultation.id, notes: meetingNotes, save: true } }),
    onSuccess: (r: any) => {
      setMeetingSummary(r?.summary ?? "");
      setActionPlan(r?.actionPlan ?? "");
      toast.success("Resumo e plano de ação gerados.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar o resumo."),
  });

  const sendClientReport = useMutation({
    mutationFn: () => {
      const pdf = currentPdf({ meeting_summary: meetingSummary, action_plan: actionPlan });
      return clientReportFn({
        data: {
          id: consultation.id,
          recipients: emailList(clientRecipients),
          filename: pdf.filename,
          pdfBase64: pdf.base64,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Enviado para ${(r?.recipients ?? []).join(", ")}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar ao cliente."),
  });

  /* ------------------- Combo: relatório final consolidado ------------------- */

  const groupFn = useServerFn(getConsultationGroup);
  const comboEmailFn = useServerFn(sendConsultationComboReport);
  const isCombo = Number(consultation?.sessions_total ?? 1) > 1 || Boolean(consultation?.booking_group);

  const group = useQuery({
    queryKey: ["consultation-group", consultation?.id],
    queryFn: () => groupFn({ data: { id: consultation.id } }),
    enabled: Boolean(consultation?.id) && isCombo,
  });

  /** Aplica as edições em tela na sessão atual, para o PDF sair atualizado. */
  const groupSessions = () =>
    ((group.data as any)?.sessions ?? []).map((s: any) =>
      s.id === consultation?.id
        ? { ...s, prep_data: prep, meeting_summary: meetingSummary, action_plan: actionPlan }
        : s,
    );

  const downloadCombo = () => {
    const sessions = groupSessions();
    if (!sessions.length) return toast.error("Encontros do combo ainda não carregados.");
    const pdf = buildConsultationComboReportPdf(sessions);
    saveBlob(pdf.blob, pdf.filename);
  };

  const downloadSessions = () => {
    const sessions = groupSessions();
    if (!sessions.length) return toast.error("Encontros do combo ainda não carregados.");
    buildConsultationSessionPdfs(sessions).forEach((pdf, i) => {
      window.setTimeout(() => saveBlob(pdf.blob, pdf.filename), i * 400);
    });
  };

  const sendCombo = useMutation({
    mutationFn: () => {
      const sessions = groupSessions();
      if (!sessions.length) throw new Error("Encontros do combo ainda não carregados.");
      const consolidated = buildConsultationComboReportPdf(sessions);
      const perSession = buildConsultationSessionPdfs(sessions);
      const attachments = [
        { filename: consolidated.filename, base64: consolidated.base64 },
        ...perSession.slice(0, 7).map((p) => ({ filename: p.filename, base64: p.base64 })),
      ];
      return comboEmailFn({
        data: { id: consultation.id, recipients: emailList(clientRecipients), attachments },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Relatório final enviado para ${(r?.recipients ?? []).join(", ")}`);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar o relatório final."),
  });



  return (
    <Dialog open={Boolean(consultation)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {consultation?.client_name || "Aluno"} — {consultation?.product_title}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="preparacao">
          <TabsList className="flex-wrap">
            <TabsTrigger value="preparacao">
              <Sparkles className="mr-1.5 h-4 w-4" /> Preparação
            </TabsTrigger>
            <TabsTrigger value="pos">
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Pós-reunião
            </TabsTrigger>
            <TabsTrigger value="notas">
              <StickyNote className="mr-1.5 h-4 w-4" /> Notas e materiais
            </TabsTrigger>
            <TabsTrigger value="agenda">
              <CalendarClock className="mr-1.5 h-4 w-4" /> Reagendar
            </TabsTrigger>
            <TabsTrigger value="link">
              <Link2 className="mr-1.5 h-4 w-4" /> Link
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="mr-1.5 h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preparacao" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={generatePrep.isPending} onClick={() => generatePrep.mutate()}>
                {generatePrep.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                {prep ? "Regenerar preparação" : "Gerar preparação"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!prep || sendPrep.isPending}
                onClick={() => sendPrep.mutate()}
              >
                {sendPrep.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                Enviar dossiê por e-mail
              </Button>
            </div>

            <div>
              <Label className="text-xs">Destinatários (vazio = admins da plataforma)</Label>
              <Input
                value={prepRecipients}
                onChange={(e) => setPrepRecipients(e.target.value)}
                placeholder="ronnei@exemplo.com, outro@exemplo.com"
              />
            </div>

            {consultation?.prep_sent_at && (
              <p className="text-xs text-muted-foreground">
                Dossiê enviado em {dateBR(consultation.prep_sent_at)}.
              </p>
            )}

            {!prep ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma preparação gerada. O sistema também gera e envia automaticamente até 12h antes da
                reunião.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumo executivo
                  </p>
                  {(prep.executiveSummary ?? []).map((p: string, i: number) => (
                    <p key={i} className="text-sm leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Dados identificados
                  </p>
                  <div className="rounded-md border">
                    {(prep.identified ?? []).map((item: any, i: number) => (
                      <div key={i} className="flex gap-3 border-b px-3 py-1.5 text-sm last:border-b-0">
                        <span className="w-40 shrink-0 text-muted-foreground">{item.label}</span>
                        <span className="break-words">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Roteiro sugerido
                  </p>
                  {(prep.script ?? []).map((block: any, i: number) => (
                    <div key={i} className="mb-2">
                      <p className="text-sm font-semibold">
                        {block.title}{" "}
                        <span className="font-normal text-muted-foreground">({block.minutes} min)</span>
                      </p>
                      <ul className="ml-4 list-disc text-sm text-muted-foreground">
                        {(block.bullets ?? []).map((b: string, j: number) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {(prep.alerts ?? []).length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                      Pontos de atenção
                    </p>
                    <ul className="ml-4 list-disc text-sm">
                      {prep.alerts.map((a: string, i: number) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pos" className="mt-4 space-y-4">
            <div>
              <Label>Observações da reunião</Label>
              <Textarea
                rows={6}
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                placeholder="Anote o que foi conversado, decisões e tarefas (uma por linha)..."
              />
            </div>
            <Button
              className="w-full"
              disabled={meetingNotes.trim().length < 5 || generateOutcome.isPending}
              onClick={() => generateOutcome.mutate()}
            >
              {generateOutcome.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar resumo e plano de ação
            </Button>

            <div>
              <Label>Resumo da consultoria (enviado ao cliente)</Label>
              <Textarea rows={6} value={meetingSummary} onChange={(e) => setMeetingSummary(e.target.value)} />
            </div>
            <div>
              <Label>Plano de ação</Label>
              <Textarea rows={5} value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={notes.isPending}
              onClick={() => notes.mutate()}
            >
              {notes.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>

            <div>
              <Label className="text-xs">Enviar para</Label>
              <Input
                value={clientRecipients}
                onChange={(e) => setClientRecipients(e.target.value)}
                placeholder="cliente@exemplo.com"
              />
            </div>
            <Button
              className="w-full"
              disabled={!meetingSummary.trim() || !clientRecipients.includes("@") || sendClientReport.isPending}
              onClick={() => sendClientReport.mutate()}
            >
              {sendClientReport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar resumo + PDF final ao cliente
            </Button>
            {consultation?.client_report_sent_at && (
              <p className="text-xs text-muted-foreground">
                Enviado ao cliente em {dateBR(consultation.client_report_sent_at)}.
              </p>
            )}

            {isCombo && (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div>
                  <p className="text-sm font-semibold">Relatório final do combo</p>
                  <p className="text-xs text-muted-foreground">
                    {group.isLoading
                      ? "Carregando encontros..."
                      : `${((group.data as any)?.sessions ?? []).length} encontro(s) nesta compra. O PDF consolidado reúne resumo e plano de ação de todos, e cada encontro também tem o seu PDF.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={group.isLoading} onClick={downloadCombo}>
                    Baixar PDF consolidado
                  </Button>
                  <Button size="sm" variant="outline" disabled={group.isLoading} onClick={downloadSessions}>
                    Baixar PDF de cada encontro
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={group.isLoading || !clientRecipients.includes("@") || sendCombo.isPending}
                  onClick={() => sendCombo.mutate()}
                >
                  {sendCombo.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar relatório final (consolidado + encontros)
                </Button>
              </div>
            )}
          </TabsContent>




          <TabsContent value="notas" className="mt-4 space-y-4">
            <div>
              <Label>Observações internas (só a equipe vê)</Label>
              <Textarea rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
            </div>
            <div>
              <Label>Observações para o aluno</Label>
              <Textarea
                rows={4}
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value)}
                placeholder="Recomendações e recado para o aluno..."
              />
            </div>
            <div>
              <Label>Plano de ação (enviado com a gravação)</Label>
              <Textarea
                rows={4}
                value={actionPlan}
                onChange={(e) => setActionPlan(e.target.value)}
                placeholder="1. Ajustar CMV... 2. Revisar cardápio... 3. Testar combo..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Materiais complementares</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMaterials((m) => [...m, { title: "", url: "" }])}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Adicionar
                </Button>
              </div>
              {materials.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum material. Ao concluir a reunião, os materiais padrão do produto são liberados
                  automaticamente.
                </p>
              ) : (
                materials.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-[140px] flex-1"
                      placeholder="Título"
                      value={m.title}
                      onChange={(e) =>
                        setMaterials((list) =>
                          list.map((it, idx) => (idx === i ? { ...it, title: e.target.value } : it)),
                        )
                      }
                    />
                    <Input
                      className="min-w-[180px] flex-[2]"
                      placeholder="https://..."
                      value={m.url}
                      onChange={(e) =>
                        setMaterials((list) =>
                          list.map((it, idx) => (idx === i ? { ...it, url: e.target.value } : it)),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setMaterials((list) => list.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Button className="w-full" disabled={notes.isPending} onClick={() => notes.mutate()}>
              {notes.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar observações e materiais
            </Button>
          </TabsContent>

          <TabsContent value="agenda" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Atual: {consultation?.scheduled_at ? dateBR(consultation.scheduled_at) : "—"}
              {consultation?.reschedule_count ? ` · ${consultation.reschedule_count} remarcação(ões)` : ""}
            </p>
            <div>
              <Label>Novo horário</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Reenviar confirmação ao aluno</Label>
              <Switch checked={notifyReschedule} onCheckedChange={setNotifyReschedule} />
            </div>
            <Button
              className="w-full"
              disabled={!when || reschedule.isPending}
              onClick={() => reschedule.mutate()}
            >
              {reschedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reagendar reunião
            </Button>
          </TabsContent>

          <TabsContent value="link" className="mt-4 space-y-4">
            <div>
              <Label>Link da reunião (Meet, Zoom, etc.)</Label>
              <Input value={meetLink} onChange={(e) => setMeetLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Avisar o aluno com o novo link</Label>
              <Switch checked={notifyLink} onCheckedChange={setNotifyLink} />
            </div>
            <Button className="w-full" disabled={!meetLink || link.isPending} onClick={() => link.mutate()}>
              {link.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar link personalizado
            </Button>
          </TabsContent>

          <TabsContent value="historico" className="mt-4 space-y-4">
            {history.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <div className="space-y-1.5">
                  {(history.data?.log ?? []).map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                      <span className="truncate">
                        {l.action} {l.actor_role ? `· ${l.actor_role}` : ""}
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">
                        <Badge variant={l.status === "error" ? "destructive" : "secondary"}>{l.status ?? "ok"}</Badge>
                        {dateBR(l.created_at)}
                      </span>
                    </div>
                  ))}
                  {!(history.data?.log ?? []).length && (
                    <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    E-mails enviados
                  </p>
                  {(history.data?.emails ?? []).length ? (
                    (history.data?.emails ?? []).map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 border-b py-1.5 text-xs">
                        <span className="truncate">
                          {e.template_name} → {e.recipient_email}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">
                          {e.status} · {dateBR(e.created_at)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum e-mail registrado.</p>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
