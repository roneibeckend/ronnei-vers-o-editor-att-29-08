import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Save,
  Trash2,
  Power,
  PlugZap,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  getOAuthProviders,
  saveOAuthProvider,
  setOAuthProviderEnabled,
  removeOAuthProvider,
  testOAuthProvider,
} from "@/lib/oauth-admin.functions";

type ProviderKey =
  | "google"
  | "facebook"
  | "apple"
  | "github"
  | "azure"
  | "linkedin_oidc"
  | "discord"
  | "twitter";

const LABELS: Record<ProviderKey, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  github: "GitHub",
  azure: "Microsoft (Azure)",
  linkedin_oidc: "LinkedIn",
  discord: "Discord",
  twitter: "X / Twitter",
};

const MANUAL_STEPS: Record<ProviderKey, string[]> = {
  facebook: [
    "Crie um App em developers.facebook.com e ative o produto 'Login do Facebook'.",
    "Em Configurações > Básico copie o App ID e o App Secret.",
    "Em Login do Facebook > Configurações, cole a Redirect URI abaixo em 'URIs de redirecionamento OAuth válidos'.",
    "Coloque o app em modo 'Ativo' (Live) para permitir logins de usuários externos.",
  ],
  apple: [
    "No Apple Developer crie um App ID e um Services ID (este é o Service ID / client_id).",
    "Configure o domínio do site e a Return URL com a Redirect URI abaixo.",
    "Crie uma Key com 'Sign in with Apple' habilitado e baixe o arquivo .p8 (Key ID).",
    "O Team ID fica no canto superior direito do portal Apple Developer.",
  ],
  google: [
    "O Google já está ativo através do broker de autenticação da plataforma.",
    "Para credenciais próprias, crie um OAuth Client no Google Cloud Console e cole aqui.",
  ],
  github: ["Crie uma OAuth App em github.com/settings/developers e use a Redirect URI abaixo."],
  azure: ["Registre um app no Azure Portal (Entra ID) e use a Redirect URI abaixo."],
  linkedin_oidc: ["Crie um app em linkedin.com/developers com o produto 'Sign In with LinkedIn using OpenID Connect'."],
  discord: ["Crie um app em discord.com/developers e adicione a Redirect URI abaixo."],
  twitter: ["Crie um app no developer.x.com com OAuth 2.0 habilitado."],
};

interface ProviderState {
  provider: ProviderKey;
  enabled: boolean | null;
  clientId: string;
  hasSecret: boolean | null;
  lastValidatedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  secretExpiresAt: string | null;
  publicFields: { teamId: string; keyId: string; serviceId: string };
}

function StatusBadge({ p }: { p: ProviderState }) {
  const configured = Boolean(p.clientId) && (p.hasSecret ?? false);
  if (p.enabled && configured) {
    return (
      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/10">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Configurado
      </Badge>
    );
  }
  if (configured) {
    return (
      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10">
        <AlertTriangle className="h-3 w-3 mr-1" /> Configurado (desativado)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-red-400 bg-red-400/10">
      <XCircle className="h-3 w-3 mr-1" /> Não configurado
    </Badge>
  );
}

function ProviderCard({
  data,
  callbackUrl,
  disabled,
  onRefresh,
}: {
  data: ProviderState;
  callbackUrl: string;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const isApple = data.provider === "apple";
  const [clientId, setClientId] = useState(data.clientId);
  const [secret, setSecret] = useState("");
  const [teamId, setTeamId] = useState(data.publicFields.teamId);
  const [keyId, setKeyId] = useState(data.publicFields.keyId);
  const [serviceId, setServiceId] = useState(data.publicFields.serviceId || data.clientId);
  const [privateKey, setPrivateKey] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const saveFn = useServerFn(saveOAuthProvider);
  const toggleFn = useServerFn(setOAuthProviderEnabled);
  const removeFn = useServerFn(removeOAuthProvider);
  const testFn = useServerFn(testOAuthProvider);

  const payload = () =>
    isApple
      ? { provider: data.provider, teamId, keyId, serviceId, privateKey }
      : { provider: data.provider, clientId, secret };

  const save = useMutation({
    mutationFn: () => saveFn({ data: payload() }),
    onSuccess: () => {
      toast.success("Configuração salva no Supabase Auth.");
      setSecret("");
      setPrivateKey("");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => toggleFn({ data: { provider: data.provider, enabled } }),
    onSuccess: (r: any) => {
      toast.success(r.enabled ? "Provedor ativado." : "Provedor desativado.");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao alterar status"),
  });

  const remove = useMutation({
    mutationFn: () => removeFn({ data: { provider: data.provider } }),
    onSuccess: () => {
      toast.success("Credenciais removidas.");
      setClientId("");
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: payload() }),
    onSuccess: (r: any) => {
      setTestResult(r);
      r.success ? toast.success(r.message) : toast.error(r.message);
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro no teste"),
  });

  const busy = save.isPending || toggle.isPending || remove.isPending || test.isPending;

  return (
    <Card className="bg-[#111] border-white/5">
      <CardHeader className="border-b border-white/5 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold uppercase tracking-wide">{LABELS[data.provider]}</CardTitle>
            <CardDescription className="text-[11px] text-white/40">
              Última validação:{" "}
              {data.lastValidatedAt ? new Date(data.lastValidatedAt).toLocaleString("pt-BR") : "nunca"}
              {data.secretExpiresAt
                ? ` · Secret expira em ${new Date(data.secretExpiresAt).toLocaleDateString("pt-BR")}`
                : ""}
            </CardDescription>
          </div>
          <StatusBadge p={data} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {data.lastStatus === "error" && data.lastError && (
          <Alert className="bg-red-500/5 border-red-500/30">
            <XCircle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-xs uppercase tracking-widest text-red-300">Erro de configuração</AlertTitle>
            <AlertDescription className="text-xs text-white/60">{data.lastError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {isApple ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">Team ID</Label>
                <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">Service ID (client_id)</Label>
                <Input value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">Key ID</Label>
                <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">
                  Private Key (.p8) {data.hasSecret ? "— já configurada, preencha só para substituir" : ""}
                </Label>
                <Textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  rows={4}
                  placeholder={"-----BEGIN PRIVATE KEY-----\n..."}
                  className="bg-black/40 border-white/10 font-mono text-[11px]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">
                  {data.provider === "facebook" ? "App ID" : "Client ID"}
                </Label>
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-black/40 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-widest text-white/40">
                  {data.provider === "facebook" ? "App Secret" : "Client Secret"}
                  {data.hasSecret ? " — configurado" : ""}
                </Label>
                <Input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={data.hasSecret ? "•••••••• (preencha para substituir)" : ""}
                  className="bg-black/40 border-white/10"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-[10px] uppercase tracking-widest text-white/40">Redirect URI / Callback</Label>
            <div className="flex gap-2">
              <Input readOnly value={callbackUrl} className="bg-black/60 border-white/10 font-mono text-[11px]" />
              <Button
                variant="outline"
                size="icon"
                className="border-white/10"
                onClick={() => {
                  navigator.clipboard.writeText(callbackUrl);
                  toast.success("Callback copiado.");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={disabled || busy}
            className="bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 text-[10px] font-bold uppercase tracking-widest"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
            Salvar
          </Button>
          <Button
            variant="outline"
            className="border-white/10 text-[10px] font-bold uppercase tracking-widest"
            onClick={() => test.mutate()}
            disabled={busy}
          >
            {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <PlugZap className="h-3.5 w-3.5 mr-2" />}
            Testar conexão
          </Button>
          <Button
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest"
            onClick={() => toggle.mutate(true)}
            disabled={disabled || busy || data.enabled === true}
          >
            <Power className="h-3.5 w-3.5 mr-2" /> Ativar
          </Button>
          <Button
            variant="outline"
            className="border-white/10 text-white/60 text-[10px] font-bold uppercase tracking-widest"
            onClick={() => toggle.mutate(false)}
            disabled={disabled || busy || data.enabled === false}
          >
            <Power className="h-3.5 w-3.5 mr-2" /> Desativar
          </Button>
          <Button
            variant="ghost"
            className="text-red-400 hover:text-red-300 text-[10px] font-bold uppercase tracking-widest"
            onClick={() => remove.mutate()}
            disabled={disabled || busy}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
          </Button>
        </div>

        {testResult && (
          <div className="rounded-sm border border-white/10 bg-black/40 p-3 text-[11px] font-mono text-white/60 space-y-1">
            <div>status: {testResult.success ? "ok" : "falha"}</div>
            <div>http: {testResult.httpCode}</div>
            <div>latência: {testResult.latency}</div>
            <div>callback: {testResult.callbackUrl}</div>
            <div className="text-white/40">{testResult.message}</div>
          </div>
        )}

        <div className="rounded-sm border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
            Etapas manuais no provedor
          </p>
          <ol className="list-decimal pl-4 space-y-1 text-xs text-white/50">
            {MANUAL_STEPS[data.provider].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

export function OAuthProvidersPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(getOAuthProviders);
  const { data, isLoading } = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: () => listFn(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["oauth-providers"] });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  const providers = (data?.providers ?? []) as ProviderState[];
  const primary = providers.filter((p) => ["facebook", "apple", "google"].includes(p.provider));
  const others = providers.filter((p) => !["facebook", "apple", "google"].includes(p.provider));

  return (
    <div className="space-y-6">
      {!data?.tokenConfigured && (
        <Alert className="bg-amber-500/5 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-xs uppercase tracking-widest text-amber-300">
            Controle automático desativado
          </AlertTitle>
          <AlertDescription className="text-xs text-white/60">
            Salve o secret <span className="font-mono">SB_MANAGEMENT_TOKEN</span> (Personal Access Token do
            Supabase) para que este painel possa ler e alterar os provedores diretamente. Sem ele, as alterações
            continuam exigindo o Dashboard do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {data?.configError && (
        <Alert className="bg-red-500/5 border-red-500/30">
          <XCircle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-xs uppercase tracking-widest text-red-300">Erro na Management API</AlertTitle>
          <AlertDescription className="text-xs text-white/60">{data.configError}</AlertDescription>
        </Alert>
      )}

      <Alert className="bg-white/[0.02] border-white/10">
        <Info className="h-4 w-4 text-[#ff6a00]" />
        <AlertTitle className="text-xs uppercase tracking-widest text-white/70">O que é automático</AlertTitle>
        <AlertDescription className="text-xs text-white/50 space-y-1">
          <p>
            Este painel grava Client ID / Secret e liga/desliga cada provedor direto na configuração de Auth do
            Supabase. Os segredos nunca voltam para o navegador — apenas o status.
          </p>
          <p>
            Continua manual (fora do Supabase): criar o app no Facebook Developers / Apple Developer, verificar
            domínios e cadastrar a Redirect URI no portal do provedor.
          </p>
          <p className="font-mono text-[11px] text-white/40">
            ambiente: {data?.environment} · site_url: {data?.siteUrl ?? "—"}
          </p>
        </AlertDescription>
      </Alert>

      <Alert className="bg-amber-500/5 border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-xs uppercase tracking-widest text-amber-300">Erro de permissão ao salvar?</AlertTitle>
        <AlertDescription className="text-xs text-white/60 space-y-1">
          <p>
            Alguns tokens de gerenciamento do Supabase permitem ler a configuração, mas não alterar provedores. Se o
            botão <strong>Salvar</strong> retornar erro de privilégios, configure manualmente em:
          </p>
          <a
            href="https://supabase.com/dashboard/project/llfgqeotxneprvomllru/auth/providers"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-[#ff6a00] hover:underline break-all"
          >
            Supabase Auth → Providers <ExternalLink className="h-3 w-3" />
          </a>
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
        <ShieldCheck className="h-3.5 w-3.5 text-[#ff6a00]" /> Provedores principais
      </div>
      <div className="space-y-5">
        {primary.map((p) => (
          <ProviderCard
            key={p.provider}
            data={p}
            callbackUrl={data?.callbackUrl ?? ""}
            disabled={!data?.tokenConfigured}
            onRefresh={refresh}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 pt-2">
        <ShieldCheck className="h-3.5 w-3.5 text-white/30" /> Outros provedores
      </div>
      <div className="space-y-5">
        {others.map((p) => (
          <ProviderCard
            key={p.provider}
            data={p}
            callbackUrl={data?.callbackUrl ?? ""}
            disabled={!data?.tokenConfigured}
            onRefresh={refresh}
          />
        ))}
      </div>
    </div>
  );
}
