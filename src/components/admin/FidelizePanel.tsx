import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Globe,
  Key,
  Terminal,
  RefreshCw,
  Clock,
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
} from "@/lib/fidelize.functions";

const ORANGE = "#ff6a00";

export function FidelizePanel() {
  const queryClient = useQueryClient();
  const getIntegration = useServerFn(getFidelizeIntegration);
  const saveFn = useServerFn(saveFidelizeIntegration);
  const testFn = useServerFn(testFidelizeConnection);
  const logsFn = useServerFn(getFidelizeLogs);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testPath, setTestPath] = useState("");
  const [status, setStatus] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["fidelize_integration"],
    queryFn: () => getIntegration({} as any),
  });

  const { data: logs, refetch: refetchLogs, isFetching: loadingLogs } = useQuery({
    queryKey: ["fidelize_logs"],
    queryFn: () => logsFn({ data: { limit: 25 } }),
  });

  useEffect(() => {
    if (integration) {
      setBaseUrl(integration.baseUrl || "");
      setTestPath(integration.testPath || "");
      setStatus(Boolean(integration.status));
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { baseUrl, apiKey, testPath, status } }),
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
      const result = await testFn({ data: { baseUrl, apiKey, testPath } });
      setTestResult(result);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      refetchLogs();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao testar a conexão.");
    } finally {
      setIsTesting(false);
    }
  };

  const connectionState = !integration?.baseUrl || !integration?.hasApiKey
    ? "incomplete"
    : integration.status
      ? "connected"
      : "disabled";

  return (
    <div className="space-y-6">
      <Card className="bg-[#111] border-white/5">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
              <Activity className="h-4 w-4" style={{ color: ORANGE }} /> Fidelize
            </CardTitle>
            <CardDescription className="text-[10px] text-white/40">
              Configuração da API de fidelidade e monitoramento das chamadas.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={`text-[8px] uppercase tracking-widest border-none ${
              connectionState === "connected"
                ? "text-emerald-400 bg-emerald-400/10"
                : connectionState === "incomplete"
                  ? "text-amber-400 bg-amber-400/10"
                  : "text-white/40 bg-white/5"
            }`}
          >
            {connectionState === "connected" ? "Conectado" : connectionState === "incomplete" ? "Incompleto" : "Desativado"}
          </Badge>
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
                  placeholder="https://api.fidelize.com.br/v1"
                  className="bg-black/40 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Key className="h-3 w-3" /> API Key
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={integration?.hasApiKey ? "•••••••• (salva — deixe em branco para manter)" : "Cole a API Key do Fidelize"}
                  className="bg-black/40 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> Endpoint de teste (opcional)
                </Label>
                <Input
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  placeholder="/health (padrão: tenta /health, /ping, /me)"
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
                  disabled={saveMutation.isPending || !baseUrl}
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
                  className={`rounded-lg border p-4 space-y-2 ${
                    testResult.success ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    {testResult.message}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-white/50 sm:grid-cols-4">
                    <span>HTTP: {testResult.httpCode || "—"}</span>
                    <span>Tempo: {testResult.durationMs}ms</span>
                    <span className="col-span-2 truncate">Endpoint: {testResult.endpoint}</span>
                  </div>
                  {testResult.responseBody && (
                    <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-[10px] text-white/60">
                      {testResult.responseBody}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#111] border-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-white">
              <Terminal className="h-4 w-4" style={{ color: ORANGE }} /> Logs da integração
            </CardTitle>
            <CardDescription className="text-[10px] text-white/40">
              Requisição, resposta, erro e tempo de processamento de cada chamada.
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
          {!logs?.length ? (
            <p className="text-xs text-white/40">Nenhuma chamada registrada ainda.</p>
          ) : (
            logs.map((log) => (
              <details key={log.id} className="rounded-lg border border-white/5 bg-black/40 p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-white/80">{log.message}</span>
                    <span className="flex items-center gap-3 text-[10px] text-white/40">
                      <span className={log.level === "ERROR" || log.level === "error" ? "text-red-400" : "text-emerald-400"}>
                        {String(log.level).toUpperCase()}
                      </span>
                      {log.durationMs != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {log.durationMs}ms
                        </span>
                      )}
                      <span>{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
                    </span>
                  </div>
                </summary>
                <div className="mt-3 space-y-2 text-[10px]">
                  <div>
                    <p className="uppercase tracking-widest text-white/30">Requisição</p>
                    <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-white/60">
                      {JSON.stringify(log.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="uppercase tracking-widest text-white/30">Resposta</p>
                    <pre className="max-h-40 overflow-auto rounded bg-black/60 p-2 text-white/60">
                      {JSON.stringify(log.response, null, 2)}
                    </pre>
                  </div>
                  {log.error && (
                    <div>
                      <p className="uppercase tracking-widest text-white/30">Erro</p>
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
