import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getConsultationsAdminData,
  saveConsultationProduct,
  deleteConsultationProduct,
  saveAvailabilityRule,
  deleteAvailabilityRule,
  saveConsultationBlock,
  deleteConsultationBlock,
  setConsultationStatus,
  regenerateConsultationMeeting,
  listConsultationRecordings,
  attachConsultationRecording,
  runConsultationRemindersNow,
  saveConsultationNotes,
  sendConsultationReportEmail,
  applyAvailabilityPreset,
  previewAvailableSlots,
} from "@/lib/consultations-admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { ConsultationBriefingSummary } from "@/components/platform/ConsultationBriefingSummary";
import { ConsultationManageDialog } from "@/components/admin/ConsultationManageDialog";
import { ConsultationReports } from "@/components/admin/ConsultationReports";
import { ConsultationAutomations } from "@/components/admin/ConsultationAutomations";
import { ConsultationRecordings } from "@/components/admin/ConsultationRecordings";
import { ConsultationAttendance } from "@/components/admin/ConsultationAttendance";
import { ConsultationGoogleSync } from "@/components/admin/ConsultationGoogleSync";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateConsultationReportPdf, buildConsultationReportPdf } from "@/lib/consultation-pdf";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Plus, Trash2, RefreshCw, Video, Bell, ShieldCheck, FileText, Mail } from "lucide-react";

export const Route = createFileRoute("/admin/consultorias")({
  head: () => ({
    meta: [
      { title: "Consultorias — Painel Ronnei na Veia" },
      { name: "description", content: "Gestão de consultorias: produtos, agenda, reuniões, gravações e auditoria." },
      { property: "og:title", content: "Consultorias — Painel" },
      { property: "og:description", content: "Gestão completa das consultorias individuais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminConsultationsPage,
});

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const money = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Reserva aguardando pagamento",
  pending_payment: "Aguardando pagamento",
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

const emptyProduct = {
  id: "",
  title: "",
  subtitle: "",
  description: "",
  cover_url: "",
  duration_minutes: 60,
  price: 0,
  status: "draft",
  briefing_required: true,
  affiliate_enabled: false,
  sort_order: 0,
};

function AdminConsultationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-consultations"],
    queryFn: () => getConsultationsAdminData(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-consultations"] });

  const runReminders = useServerFn(runConsultationRemindersNow);
  const reminders = useMutation({
    mutationFn: () => runReminders(),
    onSuccess: (r: any) =>
      toast.success(`Lembretes: ${r.sent8h} de 8h e ${r.sent1h} de 1h enviados (${r.checked} reuniões verificadas).`),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao rodar lembretes."),
  });

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Consultorias</h1>
          <p className="text-sm text-muted-foreground">
            Produtos, agenda do Ronnei, reuniões, gravações e auditoria completa.
          </p>
        </div>
        <Button variant="outline" disabled={reminders.isPending} onClick={() => reminders.mutate()}>
          {reminders.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
          Rodar lembretes agora
        </Button>
      </div>

      <Tabs defaultValue="reunioes">
        <TabsList className="flex-wrap">
          <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="gravacoes">Gravações</TabsTrigger>
          <TabsTrigger value="presenca">Presença</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="reunioes" className="mt-4">
          <MeetingsTab consultations={data?.consultations ?? []} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="relatorios" className="mt-4">
          <ConsultationReports />
        </TabsContent>
        <TabsContent value="produtos" className="mt-4">
          <ProductsTab products={data?.products ?? []} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <ScheduleTab
            availability={data?.availability ?? []}
            blocks={data?.blocks ?? []}
            onChanged={refresh}
          />
        </TabsContent>
        <TabsContent value="gravacoes" className="mt-4">
          <ConsultationRecordings />
        </TabsContent>
        <TabsContent value="presenca" className="mt-4">
          <ConsultationAttendance />
        </TabsContent>
        <TabsContent value="automacoes" className="mt-4 space-y-5">
          <ConsultationAutomations />
          <ConsultationGoogleSync />
        </TabsContent>
        <TabsContent value="auditoria" className="mt-4">
          <AuditTab audit={data?.audit ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ Reuniões ------------------------------ */

function MeetingsTab({ consultations, onChanged }: { consultations: any[]; onChanged: () => void }) {
  const [recordingFor, setRecordingFor] = useState<any | null>(null);
  const [managing, setManaging] = useState<any | null>(null);
  const [scriptFor, setScriptFor] = useState<any | null>(null);
  const setStatus = useServerFn(setConsultationStatus);
  const regen = useServerFn(regenerateConsultationMeeting);

  const status = useMutation({
    mutationFn: (v: { id: string; status: string }) => setStatus({ data: v as any }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar."),
  });

  const remake = useMutation({
    mutationFn: (id: string) => regen({ data: { id } }),
    onSuccess: () => {
      toast.success("Evento e link do Meet recriados.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao recriar o evento."),
  });

  if (!consultations.length) {
    return <Card className="p-6 text-sm text-muted-foreground">Nenhuma consultoria agendada ainda.</Card>;
  }

  return (
    <div className="space-y-3">
      {consultations.map((c) => (
        <Card key={c.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {c.client_name || "Aluno"} · {c.product_title}
              </p>
              <p className="text-sm text-muted-foreground">
                {dateBR(c.scheduled_at)} · {c.duration_minutes} min · {c.client_email || "sem e-mail"}
              </p>
              <p className="text-xs text-muted-foreground">
                Confirmação {c.confirmation_sent_at ? "✓" : "—"} · Lembrete 8h {c.reminder_8h_sent_at ? "✓" : "—"} ·
                Lembrete 1h {c.reminder_1h_sent_at ? "✓" : "—"} · {money(c.amount)}
              </p>
            </div>
            <Badge variant={c.status === "scheduled" ? "default" : "secondary"}>
              {STATUS_LABEL[c.status] ?? c.status}
            </Badge>
          </div>

          {c.briefing_data || c.briefing ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Briefing do cliente
              </p>
              <ConsultationBriefingSummary data={c.briefing_data} fallback={c.briefing} />
            </div>
          ) : (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">Briefing pendente.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {c.meet_link && (
              <Button asChild size="sm" variant="secondary">
                <a href={c.meet_link} target="_blank" rel="noreferrer">
                  <Video className="mr-2 h-4 w-4" /> Meet
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={remake.isPending} onClick={() => remake.mutate(c.id)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Recriar evento
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRecordingFor(c)}>
              Gravação
            </Button>
            <Button size="sm" variant="outline" onClick={() => setScriptFor(c)}>
              <FileText className="mr-2 h-4 w-4" /> Relatório PDF
            </Button>

            <Button size="sm" onClick={() => setManaging(c)}>
              Gerenciar
            </Button>
            <Select value={c.status} onValueChange={(v) => status.mutate({ id: c.id, status: v })}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {c.recording_url && (
              <a
                href={c.recording_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline"
              >
                Ver gravação
              </a>
            )}
          </div>
        </Card>
      ))}

      <RecordingDialog
        consultation={recordingFor}
        onClose={() => setRecordingFor(null)}
        onSaved={onChanged}
      />

      <ConsultationManageDialog
        consultation={managing}
        onClose={() => setManaging(null)}
        onSaved={onChanged}
      />

      <ScriptDialog
        consultation={scriptFor}
        onClose={() => setScriptFor(null)}
        onSaved={onChanged}
      />
    </div>
  );
}

/** Roteiro do Ronnei: edita, salva no banco e gera o PDF já com o texto. */
function ScriptDialog({
  consultation,
  onClose,
  onSaved,
}: {
  consultation: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [script, setScript] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const saveNotes = useServerFn(saveConsultationNotes);
  const sendReport = useServerFn(sendConsultationReportEmail);
  const { session } = useAuth();
  const consultantEmail = session?.user?.email ?? "";

  const [toStudent, setToStudent] = useState(true);
  const [toConsultant, setToConsultant] = useState(false);
  const [extraEmails, setExtraEmails] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (consultation && loadedId !== consultation.id) {
    setLoadedId(consultation.id);
    setScript(consultation.meeting_script ?? "");
    setToStudent(Boolean(consultation.client_email));
    setToConsultant(false);
    setExtraEmails("");
    setMessage("");
    setConfirming(false);
  }

  const recipients = [
    ...(toStudent && consultation?.client_email ? [String(consultation.client_email)] : []),
    ...(toConsultant && consultantEmail ? [consultantEmail] : []),
    ...extraEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@")),
  ];
  const uniqueRecipients = Array.from(new Set(recipients.map((e) => e.toLowerCase())));

  const save = useMutation({
    mutationFn: () => saveNotes({ data: { id: consultation.id, meetingScript: script } as any }),
    onSuccess: () => onSaved(),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar o roteiro."),
  });

  const email = useMutation({
    mutationFn: async () => {
      const { base64, filename } = buildConsultationReportPdf({
        ...consultation,
        meeting_script: script,
      });
      return sendReport({
        data: {
          id: consultation.id,
          recipients: uniqueRecipients,
          message: message.trim() || undefined,
          filename,
          pdfBase64: base64,
        } as any,
      });
    },
    onSuccess: () => {
      toast.success(`Relatório enviado para ${uniqueRecipients.join(", ")}.`);
      setConfirming(false);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar o relatório."),
  });

  const handle = async (withPdf: boolean) => {
    await save.mutateAsync();
    if (withPdf) {
      try {
        generateConsultationReportPdf({ ...consultation, meeting_script: script });
        toast.success("Relatório em PDF gerado com o roteiro.");
      } catch {
        toast.error("Não foi possível gerar o PDF.");
      }
    } else {
      toast.success("Roteiro salvo.");
    }
    onClose();
  };

  const handleSend = async () => {
    if (!uniqueRecipients.length) {
      toast.error("Escolha pelo menos um destinatário.");
      return;
    }
    await save.mutateAsync();
    await email.mutateAsync();
  };


  return (
    <Dialog open={Boolean(consultation)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Roteiro da reunião</DialogTitle>
        </DialogHeader>
        {consultation && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {consultation.client_name || "Aluno"} · {dateBR(consultation.scheduled_at)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-script">Roteiro / análise para o Ronnei</Label>
              <Textarea
                id="meeting-script"
                rows={12}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Pontos de análise, perguntas-chave, plano da conversa..."
              />
              <p className="text-xs text-muted-foreground">
                O texto fica salvo e é reaproveitado automaticamente no próximo PDF.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Enviar relatório por e-mail</p>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={toStudent}
                  disabled={!consultation.client_email}
                  onCheckedChange={(v) => {
                    setToStudent(v);
                    setConfirming(false);
                  }}
                />
                Aluno {consultation.client_email ? `(${consultation.client_email})` : "(sem e-mail)"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={toConsultant}
                  disabled={!consultantEmail}
                  onCheckedChange={(v) => {
                    setToConsultant(v);
                    setConfirming(false);
                  }}
                />
                Consultor {consultantEmail ? `(${consultantEmail})` : "(sem e-mail)"}
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="report-extra">Outros e-mails (separados por vírgula)</Label>
                <Input
                  id="report-extra"
                  value={extraEmails}
                  onChange={(e) => {
                    setExtraEmails(e.target.value);
                    setConfirming(false);
                  }}
                  placeholder="equipe@exemplo.com, ronnei@exemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-message">Mensagem (opcional)</Label>
                <Textarea
                  id="report-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Segue o relatório da nossa reunião..."
                />
              </div>
              {confirming && (
                <p className="rounded-md bg-muted p-2 text-xs">
                  Confirmar envio do PDF para:{" "}
                  <strong>{uniqueRecipients.join(", ") || "nenhum destinatário"}</strong>
                </p>
              )}
              <div className="flex justify-end">
                {confirming ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={email.isPending || save.isPending || !uniqueRecipients.length}
                      onClick={handleSend}
                    >
                      {email.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      Confirmar envio
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!uniqueRecipients.length}
                    onClick={() => setConfirming(true)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar por e-mail
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={save.isPending} onClick={() => handle(false)}>
                Salvar roteiro
              </Button>
              <Button disabled={save.isPending} onClick={() => handle(true)}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Salvar e gerar PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function RecordingDialog({
  consultation,
  onClose,
  onSaved,
}: {
  consultation: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState("");
  const [notify, setNotify] = useState(true);
  const attach = useServerFn(attachConsultationRecording);

  const { data: drive } = useQuery({
    queryKey: ["consultation-recordings"],
    queryFn: () => listConsultationRecordings(),
    enabled: Boolean(consultation),
  });

  const save = useMutation({
    mutationFn: () => attach({ data: { id: consultation.id, recordingUrl: url, notify } }),
    onSuccess: () => {
      toast.success(notify ? "Gravação vinculada e aluno avisado por e-mail." : "Gravação vinculada.");
      setUrl("");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao vincular a gravação."),
  });

  return (
    <Dialog open={Boolean(consultation)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gravação da consultoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Link da gravação (Google Drive)</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/..." />
          </div>

          {drive?.error && <p className="text-xs text-destructive">Drive: {drive.error}</p>}

          {Boolean(drive?.files?.length) && (
            <div className="space-y-1">
              <Label>Ou escolha um arquivo da pasta de gravações</Label>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                {drive!.files.map((f: any) => (
                  <button
                    key={f.id}
                    type="button"
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => setUrl(f.webViewLink || "")}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Avisar o aluno por e-mail</Label>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>

          <Button className="w-full" disabled={!url || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar gravação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Produtos ------------------------------ */

function ProductsTab({ products, onChanged }: { products: any[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  const remove = useServerFn(deleteConsultationProduct);

  const drop = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Produto removido.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover."),
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({ ...emptyProduct })}>
        <Plus className="mr-2 h-4 w-4" /> Nova consultoria
      </Button>

      {products.map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              {p.title}{" "}
              <Badge variant={p.status === "active" ? "default" : "secondary"} className="ml-2">
                {p.status === "active" ? "PUBLICADO" : p.status === "coming_soon" ? "EM BREVE" : "RASCUNHO"}
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              {p.duration_minutes} min · {money(p.price)} · briefing{" "}
              {p.briefing_required ? "obrigatório" : "opcional"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...p })}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => drop.mutate(p.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}

      <ProductDialog product={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
    </div>
  );
}

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<any>(product ?? emptyProduct);
  const save = useServerFn(saveConsultationProduct);

  // Sincroniza o formulário quando outro produto é aberto.
  const key = product?.id ?? "novo";
  const [loadedKey, setLoadedKey] = useState(key);
  if (product && loadedKey !== key) {
    setLoadedKey(key);
    setForm({ ...product });
  }

  const submit = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          title: form.title,
          subtitle: form.subtitle || null,
          description: form.description || null,
          cover_url: form.cover_url || null,
          duration_minutes: Number(form.duration_minutes),
          price: Number(form.price),
          status: form.status,
          briefing_required: Boolean(form.briefing_required),
          affiliate_enabled: Boolean(form.affiliate_enabled),
          sort_order: Number(form.sort_order || 0),
        } as any,
      }),
    onSuccess: () => {
      toast.success("Consultoria salva.");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Identificador (slug)</Label>
            <Input value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="consultoria-60" />
          </div>
          <div>
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <Label>Subtítulo</Label>
            <Input value={form.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <ImageUpload
            value={form.cover_url ?? ""}
            onChange={(url) => set("cover_url", url)}
            label="Imagem de capa"
            description="Mesmo padrão dos e-books. JPG ou PNG, até 5MB."
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duração</Label>
              <Select
                value={String(form.duration_minutes)}
                onValueChange={(v) => set("duration_minutes", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="coming_soon">Em breve</SelectItem>
                  <SelectItem value="active">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Briefing obrigatório antes da reunião</Label>
            <Switch
              checked={Boolean(form.briefing_required)}
              onCheckedChange={(v) => set("briefing_required", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Disponível para afiliados</Label>
            <Switch
              checked={Boolean(form.affiliate_enabled)}
              onCheckedChange={(v) => set("affiliate_enabled", v)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.id || !form.title || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Agenda ------------------------------- */

function ScheduleTab({
  availability,
  blocks,
  onChanged,
}: {
  availability: any[];
  blocks: any[];
  onChanged: () => void;
}) {
  const [rule, setRule] = useState({
    weekday: 1,
    start_time: "09:00",
    end_time: "12:00",
    slot_interval_minutes: 30,
    active: true,
  });
  const [block, setBlock] = useState({ starts_at: "", ends_at: "", reason: "" });

  const saveRuleFn = useServerFn(saveAvailabilityRule);
  const delRuleFn = useServerFn(deleteAvailabilityRule);
  const saveBlockFn = useServerFn(saveConsultationBlock);
  const delBlockFn = useServerFn(deleteConsultationBlock);

  const addRule = useMutation({
    mutationFn: () => saveRuleFn({ data: rule as any }),
    onSuccess: () => {
      toast.success("Disponibilidade salva.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });
  const dropRule = useMutation({
    mutationFn: (id: string) => delRuleFn({ data: { id } }),
    onSuccess: onChanged,
  });
  const addBlock = useMutation({
    mutationFn: () => saveBlockFn({ data: block as any }),
    onSuccess: () => {
      toast.success("Bloqueio criado.");
      setBlock({ starts_at: "", ends_at: "", reason: "" });
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao bloquear."),
  });
  const dropBlock = useMutation({
    mutationFn: (id: string) => delBlockFn({ data: { id } }),
    onSuccess: onChanged,
  });

  const hasActive = availability.some((a) => a.active);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Disponibilidade semanal (horário de Brasília)</h3>

        {!hasActive && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Grade vazia:</strong> nenhum horário será oferecido aos alunos e as remarcações serão
            recusadas. Aplique uma grade padrão abaixo ou cadastre janelas manualmente.
          </div>
        )}

        <AvailabilityPresets onChanged={onChanged} hasRules={availability.length > 0} />

        <div className="space-y-2">
          {availability.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                {WEEKDAYS[a.weekday]} · {String(a.start_time).slice(0, 5)}–{String(a.end_time).slice(0, 5)} · a cada{" "}
                {a.slot_interval_minutes} min {a.active ? "" : "(inativo)"}
              </span>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => dropRule.mutate(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!availability.length && (
            <p className="text-sm text-muted-foreground">Nenhuma janela cadastrada — nenhum horário será oferecido.</p>
          )}
        </div>


        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Dia</Label>
            <Select value={String(rule.weekday)} onValueChange={(v) => setRule({ ...rule, weekday: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Intervalo (min)</Label>
            <Input
              type="number"
              value={rule.slot_interval_minutes}
              onChange={(e) => setRule({ ...rule, slot_interval_minutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Início</Label>
            <Input type="time" value={rule.start_time} onChange={(e) => setRule({ ...rule, start_time: e.target.value })} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="time" value={rule.end_time} onChange={(e) => setRule({ ...rule, end_time: e.target.value })} />
          </div>
        </div>
        <Button className="w-full" disabled={addRule.isPending} onClick={() => addRule.mutate()}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar janela
        </Button>
      </Card>

      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Bloqueios (férias, compromissos)</h3>

        <div className="space-y-2">
          {blocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                {dateBR(b.starts_at)} → {dateBR(b.ends_at)} {b.reason ? `· ${b.reason}` : ""}
              </span>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => dropBlock.mutate(b.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!blocks.length && <p className="text-sm text-muted-foreground">Nenhum bloqueio ativo.</p>}
        </div>

        <div className="grid gap-2">
          <div>
            <Label>Início</Label>
            <Input
              type="datetime-local"
              value={block.starts_at}
              onChange={(e) => setBlock({ ...block, starts_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Fim</Label>
            <Input
              type="datetime-local"
              value={block.ends_at}
              onChange={(e) => setBlock({ ...block, ends_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!block.starts_at || !block.ends_at || addBlock.isPending}
          onClick={() => addBlock.mutate()}
        >
          <Plus className="mr-2 h-4 w-4" /> Bloquear período
        </Button>
      </Card>
    </div>
  );
}

/* --------------------- Presets + simulação da grade --------------------- */

const PRESETS = [
  {
    id: "manha",
    label: "Seg–Sex · 09:00–12:00",
    weekdays: [1, 2, 3, 4, 5],
    windows: [{ start_time: "09:00", end_time: "12:00" }],
  },
  {
    id: "tarde",
    label: "Seg–Sex · 14:00–18:00",
    weekdays: [1, 2, 3, 4, 5],
    windows: [{ start_time: "14:00", end_time: "18:00" }],
  },
  {
    id: "integral",
    label: "Seg–Sex · 09:00–12:00 e 14:00–18:00",
    weekdays: [1, 2, 3, 4, 5],
    windows: [
      { start_time: "09:00", end_time: "12:00" },
      { start_time: "14:00", end_time: "18:00" },
    ],
  },
];

function AvailabilityPresets({ onChanged, hasRules }: { onChanged: () => void; hasRules: boolean }) {
  const applyFn = useServerFn(applyAvailabilityPreset);
  const previewFn = useServerFn(previewAvailableSlots);
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<{ total: number; next: any[] } | null>(null);

  const apply = useMutation({
    mutationFn: (p: (typeof PRESETS)[number]) =>
      applyFn({
        data: {
          weekdays: p.weekdays,
          windows: p.windows,
          slot_interval_minutes: 60,
          replace,
        } as any,
      }),
    onSuccess: (r: any) => {
      toast.success(`${r.created} janela(s) criada(s).`);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar grade."),
  });

  const simulate = useMutation({
    mutationFn: () => previewFn({ data: { durationMinutes: 60, days: 14 } as any }),
    onSuccess: (r: any) => setPreview(r),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao simular."),
  });

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-sm font-medium">Grade padrão (blocos de 1 hora)</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="outline"
            disabled={apply.isPending}
            onClick={() => apply.mutate(p)}
          >
            {apply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {p.label}
          </Button>
        ))}
      </div>
      {hasRules && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={replace} onCheckedChange={setReplace} />
          Substituir a grade atual ao aplicar
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={simulate.isPending} onClick={() => simulate.mutate()}>
          {simulate.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Simular próximos 14 dias
        </Button>
        {preview && (
          <span className={`text-xs ${preview.total ? "text-emerald-600" : "text-destructive"}`}>
            {preview.total
              ? `${preview.total} horário(s) de 1h disponíveis. Próximo: ${dateBR(preview.next[0].start)}`
              : "Nenhum horário disponível — revise janelas, bloqueios e antecedência mínima."}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Auditoria ------------------------------ */



function AuditTab({ audit }: { audit: any[] }) {
  if (!audit.length) {
    return <Card className="p-6 text-sm text-muted-foreground">Nenhum registro de auditoria ainda.</Card>;
  }
  return (
    <Card className="divide-y">
      {audit.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span className="flex items-center gap-2">
            <ShieldCheck
              className={`h-4 w-4 ${a.status === "error" ? "text-destructive" : "text-primary"}`}
            />
            <span className="font-medium">{a.action}</span>
            <span className="text-muted-foreground">
              {a.actor_role} {a.consultation_id ? `· ${String(a.consultation_id).slice(0, 8)}` : ""}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{dateBR(a.created_at)}</span>
          {a.details?.error && <span className="w-full text-xs text-destructive">{a.details.error}</span>}
        </div>
      ))}
    </Card>
  );
}
