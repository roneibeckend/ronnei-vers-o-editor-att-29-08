import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Unlink,
  Video,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getGoogleIntegration,
  startGoogleConnection,
  disconnectGoogleAccount,
  saveGoogleSettings,
  testGoogleIntegration,
  listGoogleCalendars,
} from "@/lib/google-integration.functions";

const ORANGE = "#ff6a00";

const CHECKLIST = [
  {
    title: "Projeto no Google Cloud Console",
    detail: "Crie (ou selecione) um projeto dedicado, ex.: “Ronnei na Veia — Consultorias”.",
  },
  {
    title: "APIs habilitadas",
    detail: "Google Calendar API e Google Drive API em “APIs e serviços → Biblioteca”.",
  },
  {
    title: "Tela de consentimento OAuth",
    detail:
      "Tipo Externo, com a conta principal do Ronnei adicionada como usuário de teste (ou app publicado) e e-mail de suporte preenchido.",
  },
  {
    title: "Escopos autorizados",
    detail:
      "openid, email, profile, .../auth/calendar.events e .../auth/drive.file — exatamente os que a plataforma solicita.",
  },
  {
    title: "Credencial OAuth do tipo Aplicativo da Web",
    detail: "Copie o Client ID e o Client Secret e salve nos secrets GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.",
  },
  {
    title: "URIs de redirecionamento autorizados",
    detail: "Adicione as três URLs de callback listadas abaixo (produção, preview e domínio estável).",
  },
];

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      className={
        ok
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          : "bg-white/5 text-white/40 border border-white/10"
      }
    >
      {label}
    </Badge>
  );
}

export function GoogleIntegrationPanel() {
  const queryClient = useQueryClient();
  const fetchIntegration = useServerFn(getGoogleIntegration);
  const startConnection = useServerFn(startGoogleConnection);
  const disconnect = useServerFn(disconnectGoogleAccount);
  const saveSettings = useServerFn(saveGoogleSettings);
  const runTest = useServerFn(testGoogleIntegration);
  const fetchCalendars = useServerFn(listGoogleCalendars);

  const { data, isLoading } = useQuery({
    queryKey: ["google-integration"],
    queryFn: () => fetchIntegration(),
  });

  const [form, setForm] = useState({
    calendar_id: "primary",
    timezone: "America/Sao_Paulo",
    default_duration_minutes: 60,
    drive_recordings_folder_id: "",
    create_meet_links: true,
    send_calendar_invites: true,
    enabled: false,
  });
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[] | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setForm({
      calendar_id: s.calendar_id ?? "primary",
      timezone: s.timezone ?? "America/Sao_Paulo",
      default_duration_minutes: s.default_duration_minutes ?? 60,
      drive_recordings_folder_id: s.drive_recordings_folder_id ?? "",
      create_meet_links: s.create_meet_links ?? true,
      send_calendar_invites: s.send_calendar_invites ?? true,
      enabled: s.enabled ?? false,
    });
  }, [data?.settings]);

  // Feedback do retorno do OAuth (?google=connected|error)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    if (result === "connected") {
      toast.success(`Conta Google conectada${params.get("email") ? `: ${params.get("email")}` : ""}`);
    } else {
      toast.error(params.get("message") || "Falha ao conectar a conta Google.");
    }
    params.delete("google");
    params.delete("email");
    params.delete("message");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    queryClient.invalidateQueries({ queryKey: ["google-integration"] });
  }, [queryClient]);

  const callbackUrls = useMemo(() => {
    const path = "/api/public/google/oauth/callback";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return Array.from(
      new Set(
        [
          "https://ronneinv.lovable.app",
          "https://project--19870d22-c8ea-4f04-9619-f074c2594e7b.lovable.app",
          "https://project--19870d22-c8ea-4f04-9619-f074c2594e7b-dev.lovable.app",
          origin,
        ].filter(Boolean),
      ),
    ).map((base) => `${base}${path}`);
  }, []);

  const connectMutation = useMutation({
    mutationFn: () => startConnection({ data: { origin: window.location.origin } }),
    onSuccess: (result: any) => {
      window.location.href = result.url;
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao iniciar a conexão."),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Conta Google desconectada.");
      setCalendars(null);
      setTestResult(null);
      queryClient.invalidateQueries({ queryKey: ["google-integration"] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao desconectar."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          ...form,
          drive_recordings_folder_id: form.drive_recordings_folder_id.trim() || null,
          default_duration_minutes: Number(form.default_duration_minutes),
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas.");
      queryClient.invalidateQueries({ queryKey: ["google-integration"] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar."),
  });

  const testMutation = useMutation({
    mutationFn: () => runTest(),
    onSuccess: (result: any) => {
      setTestResult(result);
      toast.success("Teste concluído: evento e link do Meet criados com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["google-integration"] });
    },
    onError: (err: any) => {
      setTestResult(null);
      toast.error(err?.message || "Falha no teste.");
    },
  });

  const calendarsMutation = useMutation({
    mutationFn: () => fetchCalendars(),
    onSuccess: (result: any) => {
      setCalendars(result);
      toast.success(`${result.length} agenda(s) encontrada(s).`);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao listar agendas."),
  });

  const status = data?.status;
  const connected = Boolean(status?.connected && status?.status === "connected");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: ORANGE }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estado da conexão */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
                <CalendarDays className="h-4 w-4" style={{ color: ORANGE }} /> Google Workspace
              </CardTitle>
              <CardDescription className="text-[11px] text-white/50">
                Conta oficial usada para criar eventos na agenda, gerar links do Meet e guardar gravações no Drive.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge ok={Boolean(status?.clientConfigured)} label={status?.clientConfigured ? "Credenciais OK" : "Secrets pendentes"} />
              <StatusBadge ok={connected} label={connected ? "Conectado" : status?.status === "revoked" ? "Acesso revogado" : "Não conectado"} />
              <StatusBadge ok={Boolean(status?.hasCalendarScope)} label="Calendar" />
              <StatusBadge ok={Boolean(status?.hasDriveScope)} label="Drive" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!status?.clientConfigured && (
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertTitle className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                Faltam as credenciais OAuth
              </AlertTitle>
              <AlertDescription className="text-[11px] text-white/70">
                Salve os secrets <code>GOOGLE_OAUTH_CLIENT_ID</code> e <code>GOOGLE_OAUTH_CLIENT_SECRET</code> gerados no
                Google Cloud Console para liberar o botão de conexão.
              </AlertDescription>
            </Alert>
          )}

          {status?.lastError && (
            <Alert className="border-red-500/30 bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-300 text-xs font-bold uppercase tracking-widest">Último erro</AlertTitle>
              <AlertDescription className="text-[11px] text-white/70">{status.lastError}</AlertDescription>
            </Alert>
          )}

          {connected && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-sm border border-white/5 bg-black/40 p-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Conta</p>
                <p className="mt-1 truncate text-sm text-white">{status?.accountEmail || "—"}</p>
              </div>
              <div className="rounded-sm border border-white/5 bg-black/40 p-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Última renovação</p>
                <p className="mt-1 text-sm text-white">
                  {status?.lastRefreshAt ? new Date(status.lastRefreshAt).toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              <div className="rounded-sm border border-white/5 bg-black/40 p-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Escopos</p>
                <p className="mt-1 text-sm text-white">{status?.scopes?.length ?? 0} autorizados</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!status?.clientConfigured || connectMutation.isPending}
              className="h-10 bg-[#ff6a00] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#ff8533]"
            >
              {connectMutation.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-3.5 w-3.5" />
              )}
              {connected ? "Reconectar conta" : "Conectar conta Google"}
            </Button>

            {connected && (
              <>
                <Button
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="h-10 border-white/10 bg-transparent text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  )}
                  Testar Calendar + Meet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => calendarsMutation.mutate()}
                  disabled={calendarsMutation.isPending}
                  className="h-10 border-white/10 bg-transparent text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white"
                >
                  {calendarsMutation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Listar agendas
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Desconectar a conta Google? Consultorias deixarão de criar eventos automaticamente.")) {
                      disconnectMutation.mutate();
                    }
                  }}
                  disabled={disconnectMutation.isPending}
                  className="h-10 border-red-500/20 bg-transparent text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Unlink className="mr-2 h-3.5 w-3.5" /> Desconectar
                </Button>
              </>
            )}
          </div>

          {testResult && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-300 text-xs font-bold uppercase tracking-widest">
                Integração validada
              </AlertTitle>
              <AlertDescription className="space-y-1 text-[11px] text-white/70">
                <p>
                  Evento de teste criado e removido na agenda <strong>{testResult.calendar?.calendarId}</strong>.
                </p>
                {testResult.calendar?.meetLink && (
                  <p className="flex items-center gap-1">
                    <Video className="h-3 w-3" /> Meet gerado:{" "}
                    <a
                      href={testResult.calendar.meetLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#ff6a00] underline"
                    >
                      {testResult.calendar.meetLink}
                    </a>
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />{" "}
                  {testResult.drive?.ok ? `Drive acessível (${testResult.drive.email})` : `Drive: ${testResult.drive?.error}`}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {calendars && calendars.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Agendas com permissão de escrita</p>
              <div className="flex flex-wrap gap-2">
                {calendars.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, calendar_id: c.id }))}
                    className={`rounded-sm border px-3 py-1.5 text-[11px] transition ${
                      form.calendar_id === c.id
                        ? "border-[#ff6a00] bg-[#ff6a00]/10 text-white"
                        : "border-white/10 bg-black/40 text-white/60 hover:text-white"
                    }`}
                  >
                    {c.summary} {c.primary ? "· principal" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Configurações da agenda</CardTitle>
          <CardDescription className="text-[11px] text-white/50">
            Definem como as consultorias serão criadas no Google Calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">ID da agenda</Label>
              <Input
                value={form.calendar_id}
                onChange={(e) => setForm((f) => ({ ...f, calendar_id: e.target.value }))}
                placeholder="primary"
                className="bg-black/60 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Fuso horário</Label>
              <Input
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="America/Sao_Paulo"
                className="bg-black/60 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Duração padrão (minutos)
              </Label>
              <Input
                type="number"
                min={15}
                max={480}
                value={form.default_duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, default_duration_minutes: Number(e.target.value) }))}
                className="bg-black/60 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Pasta do Drive para gravações (ID)
              </Label>
              <Input
                value={form.drive_recordings_folder_id}
                onChange={(e) => setForm((f) => ({ ...f, drive_recordings_folder_id: e.target.value }))}
                placeholder="opcional"
                className="bg-black/60 border-white/10 text-white"
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                key: "create_meet_links" as const,
                label: "Gerar link do Google Meet automaticamente",
                hint: "Cada consultoria recebe uma sala exclusiva.",
              },
              {
                key: "send_calendar_invites" as const,
                label: "Enviar convite do Google para o aluno",
                hint: "O aluno recebe o evento por e-mail e vê na própria agenda.",
              },
              {
                key: "enabled" as const,
                label: "Integração ativa",
                hint: "Quando desligada, nenhuma chamada é feita ao Google.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-sm border border-white/5 bg-black/40 p-3"
              >
                <div>
                  <p className="text-xs font-bold text-white">{item.label}</p>
                  <p className="text-[10px] text-white/40">{item.hint}</p>
                </div>
                <Switch
                  checked={form[item.key]}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, [item.key]: checked }))}
                />
              </div>
            ))}
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="h-10 bg-[#ff6a00] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#ff8533]"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Salvar configurações
          </Button>
        </CardContent>
      </Card>

      {/* Checklist do Google Cloud */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">
            Checklist do Google Cloud Console
          </CardTitle>
          <CardDescription className="text-[11px] text-white/50">
            Configure nesta ordem antes de clicar em “Conectar conta Google”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            {CHECKLIST.map((item, index) => (
              <li key={item.title} className="flex gap-3 rounded-sm border border-white/5 bg-black/40 p-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold text-black"
                  style={{ backgroundColor: ORANGE }}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-bold text-white">{item.title}</p>
                  <p className="text-[11px] text-white/50">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              URIs de redirecionamento autorizados
            </p>
            {callbackUrls.map((url) => (
              <div key={url} className="flex items-center gap-2 rounded-sm border border-white/5 bg-black/60 p-2">
                <code className="flex-1 truncate text-[11px] text-white/70">{url}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    toast.success("URL copiada.");
                  }}
                  className="h-7 text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
                >
                  Copiar
                </Button>
              </div>
            ))}
          </div>

          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: ORANGE }}
          >
            Abrir Google Cloud Console <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Últimas chamadas ao Google</CardTitle>
          <CardDescription className="text-[11px] text-white/50">
            Auditoria das operações de OAuth, Calendar e Drive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.logs?.length ? (
            <p className="py-6 text-center text-[11px] text-white/40">Nenhuma chamada registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-white/5 bg-black/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{log.action}</p>
                    <p className="text-[10px] text-white/40">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                      {log.duration_ms ? ` · ${log.duration_ms}ms` : ""}
                      {log.http_status ? ` · HTTP ${log.http_status}` : ""}
                    </p>
                    {log.error && <p className="mt-1 text-[10px] text-red-400">{log.error}</p>}
                  </div>
                  <Badge
                    className={
                      log.status === "success"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border border-red-500/30"
                    }
                  >
                    {log.status === "success" ? "sucesso" : "erro"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
