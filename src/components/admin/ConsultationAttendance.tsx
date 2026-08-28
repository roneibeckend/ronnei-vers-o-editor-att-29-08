import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Mail, ShieldCheck, AlertTriangle } from "lucide-react";
import { getAttendancePanel, resendAttendanceRequest } from "@/lib/consultations-admin.functions";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

const hoursAhead = (iso: string) => (+new Date(iso) - Date.now()) / 3600_000;

function whatsappUrl(phone: string | null | undefined, name: string, when: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = encodeURIComponent(
    `Olá ${name.split(" ")[0]}! Aqui é da equipe do Ronnei. Confirma sua consultoria de ${when}?`,
  );
  return `https://wa.me/${digits.length > 11 ? digits : `55${digits}`}?text=${text}`;
}

/** Admin → Consultorias → Presença: quem ainda não confirmou. */
export function ConsultationAttendance() {
  const qc = useQueryClient();
  const panelFn = useServerFn(getAttendancePanel);
  const resendFn = useServerFn(resendAttendanceRequest);

  const { data, isLoading } = useQuery({
    queryKey: ["consultation-attendance"],
    queryFn: () => panelFn(),
    refetchInterval: 60_000,
  });

  const resend = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Pedido de confirmação reenviado.");
      qc.invalidateQueries({ queryKey: ["consultation-attendance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao reenviar."),
  });

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const pending = data?.pending ?? [];
  const confirmed = data?.confirmed ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Encontros nas próximas 48h</p>
          <p className="text-2xl font-bold">{data?.total ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Confirmados</p>
          <p className="text-2xl font-bold text-emerald-500">{confirmed.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pendentes de contato</p>
          <p className="text-2xl font-bold text-amber-500">{pending.length}</p>
        </Card>
      </div>

      {pending.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
          Todo mundo confirmou presença. Nada pendente.
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((row: any) => {
            const urgent = hoursAhead(row.scheduled_at) <= 4;
            const wa = whatsappUrl(row.client_phone, row.client_name ?? "Aluno", fmt(row.scheduled_at));
            return (
              <Card key={row.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{row.client_name ?? "Aluno"}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.product_title}
                      {row.sessions_total > 1 ? ` · Encontro ${row.session_index} de ${row.sessions_total}` : ""}
                    </p>
                    <p className="text-sm">{fmt(row.scheduled_at)} · {row.duration_minutes} min</p>
                  </div>
                  <Badge variant={urgent ? "destructive" : "secondary"} className="gap-1">
                    {urgent && <AlertTriangle className="h-3.5 w-3.5" />}
                    {urgent ? "Chamar agora" : "Sem confirmação"}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {wa && (
                    <Button asChild size="sm">
                      <a href={wa} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Chamar no WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(row.id)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Reenviar confirmação
                  </Button>
                  {row.client_email && (
                    <span className="self-center text-xs text-muted-foreground">{row.client_email}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
