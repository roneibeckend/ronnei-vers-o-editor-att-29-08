import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  rescheduleConsultation,
  saveConsultationNotes,
  setConsultationMeetLink,
  getConsultationHistory,
} from "@/lib/consultations-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, CalendarClock, Link2, StickyNote, History } from "lucide-react";

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

  useEffect(() => {
    if (!consultation) return;
    setAdminNotes(consultation.admin_notes ?? "");
    setStudentNotes(consultation.student_notes ?? "");
    setActionPlan(consultation.action_plan ?? "");
    setMaterials(Array.isArray(consultation.materials) ? consultation.materials : []);
    setWhen(dateTimeLocal(consultation.scheduled_at));
    setMeetLink(consultation.meet_link ?? "");
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

  return (
    <Dialog open={Boolean(consultation)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {consultation?.client_name || "Aluno"} — {consultation?.product_title}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="notas">
          <TabsList className="flex-wrap">
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
