import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Globe,
  Key,
  Terminal,
  RefreshCw,
  Clock,
  HeartPulse,
  UserPlus,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  getFidelizeIntegration,
  saveFidelizeIntegration,
  testFidelizeConnection,
  getFidelizeLogs,
  getFidelizeDashboard,
  provisionFidelizeTestUser,
  listFidelizeTestAccounts,
  deleteFidelizeTestUser,
  runFidelizeHealthNow,
} from "@/lib/fidelize.functions";

const ORANGE = "#ff6a00";
const URL_EXAMPLE = "https://afidelize.seudominio.com/api/public/integrations";

type ResultFilter = "all" | "success" | "error";
type PeriodFilter = "all" | "24h" | "7d";

function fmt(date: string | null | undefined) {
  return date ? new Date(date).toLocaleString("pt-BR") : "—";
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/40 p-3">
      <p className="text-[9px] uppercase tracking-widest text-white/30">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone || "text-white"}`}>{value}</p>
    </div>
  );
}

function stateIcon(state: string) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (state === "auth_error") return <XCircle className="h-4 w-4 text-red-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-400" />;
}

export function FidelizePanel() {
  const queryClient = useQueryClient();
  const getIntegration = useServerFn(getFidelizeIntegration);
  const saveFn = useServerFn(saveFidelizeIntegration);
  const testFn = useServerFn(testFidelizeConnection);
  const logsFn = useServerFn(getFidelizeLogs);
  const dashboardFn = useServerFn(getFidelizeDashboard);
  const provisionTestFn = useServerFn(provisionFidelizeTestUser);
  const listTestFn = useServerFn(listFidelizeTestAccounts);
  const deleteTestFn = useServerFn(deleteFidelizeTestUser);
  const healthFn = useServerFn(runFidelizeHealthNow);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testPath, setTestPath] = useState("");
  const [status, setStatus] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("24h");

  const { data: integration, isLoading } = useQuery({
    queryKey: ["fidelize_integration"],
    queryFn: () => getIntegration({} as any),
  });

  const { data: dashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ["fidelize_dashboard"],
    queryFn: () => dashboardFn({} as any),
  });

  const { data: logs, refetch: refetchLogs, isFetching: loadingLogs } = useQuery({
    queryKey: ["fidelize_logs", resultFilter, periodFilter],
    queryFn: () => logsFn({ data: { limit: 50, result: resultFilter, period: periodFilter } }),
  });

  const { data: testAccounts, refetch: refetchTestAccounts } = useQuery({
    queryKey: ["fidelize_test_accounts"],
    queryFn: () => listTestFn({} as any),
  });

  useEffect(() => {
    if (integration) {
      setBaseUrl(integration.baseUrl || "");
      setTestPath(integration.testPath || "");
      setStatus(Boolean(integration.status));
    }
  }, [integration]);

  const urlValid = /^https?:\/\/[^\s]+\.[^\s]+/i.test(baseUrl.trim());

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { baseUrl: baseUrl.trim(), apiKey, testPath, status } }),
    onSuccess: () => {
      toast.success("Configurações do Fidelize salvas.");
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["fidelize_integration"] });
      refetchLogs();
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar."),
  });

  const handleTest = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      const result = await testFn({ data: { baseUrl: baseUrl.trim(), apiKey, testPath } });
      setTestResult(result);
      if (result.overall === "connected") toast.success(result.message);
      else toast.error(result.message);
      refetchLogs();
      refetchDashboard();
      queryClient.invalidateQueries({ queryKey: ["fidelize_integration"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao testar a conexão.");
    } finally {
      setIsTesting(false);
    }
  };

  const healthMutation = useMutation({
    mutationFn: () => healthFn({} as any),
    onSuccess: (r: any) => {
      if (r?.skipped) toast.info(r.reason);
      else if (r?.success) toast.success(`Health check OK (${r.durationMs}ms).`);
      else toast.error(`Health check falhou (HTTP ${r?.httpCode}).`);
      refetchDashboard();
      refetchLogs();
    },
    onError: (err: any) => toast.error(err?.message || "Falha no health check."),
  });

  const provisionMutation = useMutation({
    mutationFn: () => provisionTestFn({ data: {} }),
    onSuccess: (r: any) => {
      if (r?.success) toast.success(`Conta de teste criada: ${r.email}`);
      else toast.error(r?.error || "Falha ao provisionar conta de teste.");
      refetchTestAccounts();
      refetchDashboard();
      refetchLogs();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao provisionar."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTestFn({ data: { id } }),
    onSuccess: (r: any) => {
      if (r?.success) toast.success(r.message || "Conta de teste removida.");
      else toast.error(r?.error || "Não foi possível remover.");
      refetchTestAccounts();
      refetchDashboard();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });

  const lastCheck = (testResult ? { overall: testResult.overall } : integration?.lastCheck) as any;
  const provisionOk = (testAccounts || []).some((a) => a.status === "success");
  const operational =
    Boolean(integration?.status) && lastCheck?.overall === "connected" && provisionOk;

  return (
    <div className="space-y-6">
      {/* ---------- Selo de status final ---------- */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
          operational ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-black/40"
        }`}
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className={`h-5 w-5 ${operational ? "text-emerald-400" : "text-white/30"}`} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white">
              {operational ? "🟢 Fidelize conectada e operacional" : "Fidelize ainda não validada"}
            </p>
            <p className="text-[10px] text-white/40">
              {operational
                ? "API respondendo, autenticação válida e provisionamento testado com sucesso."
                : "O selo é liberado após API responder, autenticação válida e um provisionamento de teste bem-sucedido."}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-none bg-white/5 text-[9px] uppercase tracking-widest text-white/50">
          Última verificação: {fmt(integration?.lastCheck?.at)}
        </Badge>
      </div>

      {/* ---------- Dashboard ---------- */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
              <Activity className="h-4 w-4" style={{ color: ORANGE }} /> Dashboard da integração
            </CardTitle>
            <CardDescription className="text-[10px] text-white/40">
              Health check automático a cada 30 minutos.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
            className="h-8 text-[10px] uppercase tracking-widest text-white/60"
          >
            <HeartPulse className={`h-3 w-3 mr-2 ${healthMutation.isPending ? "animate-pulse" : ""}`} /> Health check
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric
            label="Integração"
            value={dashboard?.active ? "Ativa" : "Inativa"}
            tone={dashboard?.active ? "text-emerald-400" : "text-white/40"}
          />
          <Metric label="Última sincronização" value={fmt(dashboard?.lastSyncAt)} tone="text-xs text-white/70" />
          <Metric label="Contas criadas" value={String(dashboard?.totalAccounts ?? 0)} />
          <Metric
            label="Falhas"
            value={String(dashboard?.failures ?? 0)}
            tone={(dashboard?.failures ?? 0) > 0 ? "text-red-400" : "text-white"}
          />
          <Metric label="Tempo médio" value={dashboard?.avgResponseMs ? `${dashboard.avgResponseMs}ms` : "—"} />
          {dashboard?.health?.status === "error" && (
            <div className="col-span-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-300 md:col-span-5">
              Health check falhou em {fmt(dashboard.health.lastRunAt)}: {dashboard.health.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Configuração ---------- */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
            <Globe className="h-4 w-4" style={{ color: ORANGE }} /> Configuração
          </CardTitle>
          <CardDescription className="text-[10px] text-white/40">
            Informe a URL base dos endpoints públicos de integração da Fidelize.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="h-40 rounded-lg bg-white/5 animate-pulse" />
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Globe className="h-3 w-3" /> URL da API
                </Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={URL_EXAMPLE}
                  className={`bg-black/40 text-white ${baseUrl && !urlValid ? "border-red-500/50" : "border-white/10"}`}
                />
                <p className="text-[10px] text-white/35">
                  Exemplo: <code className="text-white/60">{URL_EXAMPLE}</code> — usada para{" "}
                  <code className="text-white/50">/provision-account</code>,{" "}
                  <code className="text-white/50">/customer</code> e <code className="text-white/50">/health</code>.
                </p>
                {baseUrl && !urlValid && (
                  <p className="text-[10px] text-red-400">URL inválida. Use o formato https://dominio.com/api/public/integrations</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Key className="h-3 w-3" /> API Key
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={integration?.hasApiKey ? "Deixe em branco para manter a chave atual" : "Cole a API Key do Fidelize"}
                  className="bg-black/40 border-white/10 text-white"
                />
                <p className="text-[10px] text-white/35">
                  {integration?.hasApiKey
                    ? `Chave salva (criptografada): ${integration.maskedApiKey}`
                    : "A chave é criptografada no banco e nunca retorna ao navegador."}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> Endpoint de health (opcional)
                </Label>
                <Input
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  placeholder="/health (padrão)"
                  className="bg-black/40 border-white/10 text-white"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/40 p-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white">Integração ativa</p>
                  <p className="text-[10px] text-white/40">Quando desativada, nenhuma chamada é enviada ao Fidelize.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatus((v) => !v)}
                  className={`h-8 text-[10px] uppercase tracking-widest border-white/10 ${status ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-white/50"}`}
                >
                  {status ? "Ativa" : "Inativa"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !urlValid}
                  className="h-10 bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 text-[10px] font-bold uppercase tracking-widest"
                >
                  {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="h-10 border-white/10 bg-white/5 text-white hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest"
                >
                  {isTesting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-2" />}
                  Testar conexão
                </Button>
              </div>

              {testResult && (
                <div
                  className={`rounded-lg border p-4 space-y-3 ${
                    testResult.overall === "connected"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : testResult.overall === "auth_error"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {testResult.overall === "connected" ? "🟢" : testResult.overall === "auth_error" ? "🔴" : "🟠"}{" "}
                    {testResult.message}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-white/50 sm:grid-cols-4">
                    <span>Tempo total: {testResult.durationMs}ms</span>
                    <span>Versão da API: {testResult.apiVersion || "não informada"}</span>
                    <span className="col-span-2">Última resposta: {fmt(testResult.lastResponseAt)}</span>
                  </div>
                  <div className="space-y-2">
                    {(testResult.checks || []).map((c: any) => (
                      <div
                        key={c.key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/5 bg-black/40 p-2 text-[10px] text-white/60"
                      >
                        <span className="flex items-center gap-2 text-white/80">
                          {stateIcon(c.state)} {c.label}
                        </span>
                        <span className="flex items-center gap-3">
                          <span>HTTP {c.httpCode || "—"}</span>
                          <span>{c.durationMs}ms</span>
                          <span className="max-w-[220px] truncate">{c.message}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- Provisionamento de teste ---------- */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
              <UserPlus className="h-4 w-4" style={{ color: ORANGE }} /> Provisionamento
            </CardTitle>
            <CardDescription className="text-[10px] text-white/40">
              Cria uma conta real de teste na Fidelize (sem envio de e-mail) e permite excluí-la depois.
            </CardDescription>
          </div>
          <Button
            onClick={() => provisionMutation.mutate()}
            disabled={provisionMutation.isPending}
            className="h-9 bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 text-[10px] font-bold uppercase tracking-widest"
          >
            {provisionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-2" />}
            Provisionar usuário de teste
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!testAccounts?.length ? (
            <p className="text-xs text-white/40">Nenhuma conta de teste criada.</p>
          ) : (
            testAccounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-white/5 bg-black/40 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-white/80">{account.email}</span>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`border-none text-[9px] uppercase tracking-widest ${
                        account.status === "success" ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"
                      }`}
                    >
                      {account.status === "success" ? "Criada" : "Falhou"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(account.id)}
                      disabled={deleteMutation.isPending}
                      className="h-7 text-[10px] uppercase tracking-widest text-red-300 hover:text-red-200"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1 text-[10px] text-white/50 sm:grid-cols-2">
                  <span>Login: {account.login || "—"}</span>
                  <span>Senha temporária: {account.temporaryPassword || "—"}</span>
                  <span>Plano: {account.plan}</span>
                  <span>Criada em: {fmt(account.createdAt)}</span>
                  {account.loginUrl && <span className="sm:col-span-2 truncate">Acesso: {account.loginUrl}</span>}
                  {account.error && <span className="sm:col-span-2 text-red-300">Erro: {account.error}</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ---------- Logs ---------- */}
      <Card className="bg-[#111] border-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
              <Terminal className="h-4 w-4" style={{ color: ORANGE }} /> Logs da integração
            </CardTitle>
            <CardDescription className="text-[10px] text-white/40">
              Data, endpoint, tempo, status, payloads e erro completo.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchLogs()}
            className="h-8 text-[10px] uppercase tracking-widest text-white/60"
          >
            <RefreshCw className={`h-3 w-3 mr-2 ${loadingLogs ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "Todos"],
              ["success", "Sucesso"],
              ["error", "Erro"],
            ] as [ResultFilter, string][]).map(([value, label]) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => setResultFilter(value)}
                className={`h-7 border-white/10 text-[9px] uppercase tracking-widest ${resultFilter === value ? "bg-[#ff6a00] text-black" : "bg-white/5 text-white/50"}`}
              >
                {label}
              </Button>
            ))}
            <span className="mx-1 w-px bg-white/10" />
            {([
              ["24h", "Últimas 24h"],
              ["7d", "Últimos 7 dias"],
              ["all", "Tudo"],
            ] as [PeriodFilter, string][]).map(([value, label]) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => setPeriodFilter(value)}
                className={`h-7 border-white/10 text-[9px] uppercase tracking-widest ${periodFilter === value ? "bg-[#ff6a00] text-black" : "bg-white/5 text-white/50"}`}
              >
                {label}
              </Button>
            ))}
          </div>

          {!logs?.length ? (
            <p className="text-xs text-white/40">Nenhuma chamada registrada no período.</p>
          ) : (
            logs.map((log) => (
              <details key={log.id} className="rounded-lg border border-white/5 bg-black/40 p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-white/80">{log.message}</span>
                    <span className="flex items-center gap-3 text-[10px] text-white/40">
                      <span className={String(log.level).toUpperCase() === "ERROR" ? "text-red-400" : "text-emerald-400"}>
                        {String(log.level).toUpperCase()}
                      </span>
                      {log.httpCode != null && <span>HTTP {log.httpCode}</span>}
                      {log.durationMs != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {log.durationMs}ms
                        </span>
                      )}
                      <span>{fmt(log.createdAt)}</span>
                    </span>
                  </div>
                  {log.endpoint && <p className="mt-1 truncate text-[10px] text-white/30">{log.endpoint}</p>}
                </summary>
                <div className="mt-3 space-y-2 text-[10px]">
                  <div>
                    <p className="uppercase tracking-widest text-white/30">Payload enviado</p>
                    <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-white/60">
                      {JSON.stringify(log.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="uppercase tracking-widest text-white/30">Payload recebido</p>
                    <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-white/60">
                      {JSON.stringify(log.response, null, 2)}
                    </pre>
                  </div>
                  {log.error && (
                    <div>
                      <p className="uppercase tracking-widest text-white/30">Erro completo</p>
                      <pre className="overflow-auto rounded bg-black/60 p-2 text-red-300">{String(log.error)}</pre>
                    </div>
                  )}
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
