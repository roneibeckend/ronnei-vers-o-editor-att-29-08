import { createFileRoute } from '@tanstack/react-router';
import { 
  Sparkles, 
  CreditCard, 
  Settings2, 
  Activity, 
  CheckCircle2, 
  XCircle,
  Loader2,
  ChevronRight,
  ShieldCheck,
  BrainCircuit,
  Wallet,
  Plus,
  Save,
  Globe,
  Key,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  Terminal,
  Clock,
  RotateCcw,
  Zap,
  Info,
  Mail,
  History,
  SendHorizontal,
  BellRing,
  Percent,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Search,
  RefreshCw,
  Eye
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { testIntegrationConnection, saveIntegration, getIntegrationHistory, getResendIntegration } from "@/lib/integrations.functions";
import { getEmailLogs, getEmailSettings, updateEmailSettings, sendEmail, validateSender } from "@/lib/resend.functions";
import { getEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from "@/lib/email-templates.functions";
import { EmailSystemTemplatesPanel } from "@/components/admin/EmailSystemTemplatesPanel";
import { EMAIL_CATALOG, sampleDataFor } from "@/emails/catalog";
import { previewRawTemplate, sendRawTestEmail, sendTemplateTestEmail } from "@/lib/email-preview.functions";

import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OAuthProvidersPanel } from "@/components/admin/OAuthProvidersPanel";
import { CouponsPanel } from "@/components/admin/CouponsPanel";
import { invalidateIntegrationConfig } from "@/lib/integration-settings";

export const Route = createFileRoute('/admin/integracoes')({
  head: () => ({ meta: [{ title: "Centro de Integrações · Admin" }] }),
  component: IntegrationsPage,
});

const ORANGE = "#ff6a00";

interface Integration {
  id: string;
  name: string;
  type: 'ia' | 'payment' | 'feature';
  category: string;
  status: boolean;
  credentials: Record<string, string>;
  settings: Record<string, string>;
  updated_at?: string;
}

const WEBHOOKS = [
  { name: 'Mercado Pago (Aprovado)', url: '/api/public/webhooks/mercadopago/success', category: 'mercadopago' },
  { name: 'Mercado Pago (Recusado)', url: '/api/public/webhooks/mercadopago/refused', category: 'mercadopago' },
  { name: 'Asaas Webhook', url: '/api/public/webhooks/asaas', category: 'asaas' },
  { name: 'Stripe Webhook', url: '/api/public/webhooks/stripe', category: 'stripe' },
  { name: 'OpenAI Callback', url: '/api/public/webhooks/openai', category: 'openai' },
];

/**
 * Campos de credencial esperados por integração. O navegador nunca recebe os
 * valores salvos (segurança), então precisamos saber quais campos renderizar.
 */
const CREDENTIAL_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  asaas: [
    { key: 'apiKey', label: 'API Key', placeholder: '$aact_...' },
    { key: 'webhookToken', label: 'Webhook Token', placeholder: 'token forte (32+ caracteres)' },
  ],
  mercadopago: [
    { key: 'accessToken', label: 'Access Token', placeholder: 'APP_USR-...' },
    { key: 'publicKey', label: 'Public Key', placeholder: 'APP_USR-...' },
    { key: 'webhookToken', label: 'Webhook Token', placeholder: 'token forte (opcional)' },
  ],
  stripe: [
    { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_...' },
    { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_...' },
    { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'whsec_...' },
  ],
  openai: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-...' }],
  resend: [{ key: 'apiKey', label: 'API Key', placeholder: 're_...' }],
};

const GUIDES: Record<string, string[]> = {
  openai: [
    "Acesse a sua conta no dashboard da OpenAI (platform.openai.com).",
    "Navegue até a seção 'API Keys' no menu lateral.",
    "Clique em 'Create new secret key' e dê um nome à chave.",
    "Copie a chave gerada imediatamente (ela não será exibida novamente).",
    "Cole a chave no campo 'API Key' abaixo e clique em 'Salvar'."
  ],
  mercadopago: [
    "Acesse o painel do Mercado Pago Developers.",
    "Vá em 'Suas aplicações' e selecione ou crie uma nova aplicação.",
    "Clique em 'Credenciais de produção' no menu lateral.",
    "Copie o 'Access Token' e a 'Public Key'.",
    "Configure os Webhooks apontando para as URLs da aba 'Webhooks' deste painel.",
    "Ative a aplicação e realize um teste de conexão."
  ],
  asaas: [
    "Acesse sua conta Asaas e vá em 'Minha Conta' -> 'Integrações'.",
    "Gere uma nova 'API Key' para o ambiente desejado (Produção ou Sandbox).",
    "Copie a chave e cole no campo 'apiKey' abaixo.",
    "Crie um token qualquer forte (ex: 32 caracteres aleatórios) e cole no campo 'webhookToken' abaixo — sem ele o Asaas recebe erro 403.",
    "No Asaas, em 'Webhooks', use a URL COMPLETA da aba 'Webhooks' deste painel (termina em /api/public/webhooks/asaas) e cole o MESMO token no campo 'Token de autenticação'.",
    "Marque os eventos de pagamento desejados no Asaas e salve.",
  ],
  stripe: [
    "Acesse o Dashboard da Stripe e vá em 'Developers' -> 'API Keys'.",
    "Copie a 'Secret Key' (sk_...) e a 'Publishable Key' (pk_...).",
    "Para Webhooks: vá em 'Webhooks', adicione um endpoint com a URL da aba 'Webhooks'.",
    "Selecione os eventos 'checkout.session.completed' e 'invoice.paid'.",
    "Copie o 'Signing Secret' do Webhook se necessário para validação."
  ],
  resend: [
    "Acesse resend.com e faça login no seu dashboard.",
    "Vá em 'API Keys' e clique em 'Create API Key'.",
    "Selecione a permissão 'Full Access' ou 'Sending Access'.",
    "Copie a chave gerada e cole na aba 'API Key (Resend)' deste painel.",
    "Importante: Verifique seu domínio em 'Domains' para garantir a entrega dos e-mails."
  ],
  interactive_previews: [
    "Ative o recurso de Prévias Interativas no interruptor acima.",
    "Configure o Tema para combinar com a identidade visual da sua marca.",
    "Ative 'Auto Sanitize' para remover códigos maliciosos automaticamente.",
    "Defina 'Allow Scripts' apenas se precisar executar JS personalizado nas prévias.",
    "Ajuste 'Max Depth' para controlar a complexidade das árvores de elementos renderizadas."
  ]
};

function IntegrationsPage() {
  const navigate = useNavigate();
  const { role, isLoading: isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<'ia' | 'payment' | 'email' | 'webhooks' | 'offers' | 'feature' | 'oauth'>('ia');
  const [selectedItem, setSelectedItem] = useState<Integration | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [originalItem, setOriginalItem] = useState<Integration | null>(null);

  useEffect(() => {
    if (!isLoadingAuth && role === "student") {
      toast.error("Acesso restrito.");
      navigate({ to: "/admin" });
    }
  }, [role, isLoadingAuth, navigate]);


  const testConnectionFn = useServerFn(testIntegrationConnection);
  const saveIntegrationFn = useServerFn(saveIntegration);
  const getHistoryFn = useServerFn(getIntegrationHistory);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      // Select safe fields only - credentials are removed by RLS policy anyway if requested, 
      // but we explicitly exclude them here too for safety.
      const { data, error } = await supabase.from('integrations').select('id, name, type, category, status, settings, updated_at');
      if (error) throw error;
      
      // Map safe data back to Integration interface for compatibility
      return data.map(item => ({
        ...item,
        credentials: {} // Never send back to browser
      })) as Integration[];
    }

  });

  const { data: historyLogs, refetch: refetchHistory } = useQuery({
    queryKey: ['integration_history', selectedItem?.category],
    queryFn: async () => {
      if (!selectedItem) return [];
      return await getHistoryFn({ data: { category: selectedItem.category, limit: 10 } });
    },
    enabled: !!selectedItem
  });

  const handleCopy = (text: string) => {
    const fullUrl = `${window.location.origin}${text}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success("Webhook copiado.");
  };

  const handleCopyAll = () => {
    const allUrls = WEBHOOKS.map(w => `${w.name}: ${window.location.origin}${w.url}`).join('\n');
    navigator.clipboard.writeText(allUrls);
    setCopiedAll(true);
    toast.success("Todos os webhooks copiados.");
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const validateStatus = (item: Integration) => {
    const hasCreds = Object.values(item.credentials).every(v => v && v.length > 5);
    if (!hasCreds) return 'incomplete';
    if (!item.status) return 'disabled';
    return 'connected';
  };

  const handleTest = async () => {
    if (!selectedItem) return;
    try {
      setIsTesting(true);
      setTestResult(null);
      const result = await testConnectionFn({
        data: {
          id: selectedItem.id,
          category: selectedItem.category,
          credentials: selectedItem.credentials,
          settings: selectedItem.settings,
          environment: (String(selectedItem.settings?.testMode) === 'true' || selectedItem.settings?.environment === 'sandbox') ? 'sandbox' : 'production'
        }
      });
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      refetchHistory();
    } catch (err: any) {
      toast.error(err.message || "Erro no teste");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    try {
      await saveIntegrationFn({ data: selectedItem });
      toast.success("Configurações salvas com sucesso.");
      setOriginalItem(JSON.parse(JSON.stringify(selectedItem)));
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
  };

  const handleRestore = () => {
    if (originalItem) {
      setSelectedItem(JSON.parse(JSON.stringify(originalItem)));
      toast.info("Valores restaurados.");
    }
  };

  const filtered = integrations?.filter(i => {
    if (activeCategory === 'email') return false; // email category is handled by panel
    return i.type === activeCategory;
  }) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header section remains similar but updated */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="h-4 w-4" style={{ color: ORANGE }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Gerenciamento Central</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-white">
            Centro de <span style={{ color: ORANGE }}>Integrações</span>
          </h1>
          <p className="mt-2 text-sm text-white/50 max-w-2xl text-left">
            Gerencie credenciais, webhooks e monitore a saúde das conexões do sistema em tempo real.
          </p>
        </div>
        
        <div className="-mx-3 hidden items-center gap-1 rounded-sm border border-white/5 bg-black/40 p-1 px-3 self-stretch sm:mx-0 sm:self-auto lg:flex lg:flex-wrap lg:justify-end">
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('ia'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'ia' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <BrainCircuit className="h-3.5 w-3.5" /> IA
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('payment'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'payment' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Wallet className="h-3.5 w-3.5" /> Pagamentos
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('email'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'email' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Mail className="h-3.5 w-3.5" /> E-mail
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('webhooks'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'webhooks' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Zap className="h-3.5 w-3.5" /> Webhooks
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('offers'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'offers' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Percent className="h-3.5 w-3.5" /> Ofertas
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('feature'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'feature' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Recursos
          </Button>
          <Button 
            variant="ghost"
            onClick={() => { setActiveCategory('oauth'); setSelectedItem(null); }}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition h-10 ${activeCategory === 'oauth' ? 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Login Social
          </Button>
        </div>

        {/* Mobile category selector — tabs are hidden on small screens to avoid horizontal scroll */}
        <div className="flex items-center gap-2 lg:hidden">
          <select
            value={activeCategory}
            onChange={(e) => { setActiveCategory(e.target.value as typeof activeCategory); setSelectedItem(null); }}
            className="h-11 w-full appearance-none rounded-sm border border-white/10 bg-black/60 px-3 pr-10 text-sm font-bold uppercase tracking-widest text-white focus:border-[#ff6a00] focus:outline-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
          >
            <option value="ia">IA</option>
            <option value="payment">Pagamentos</option>
            <option value="email">E-mail</option>
            <option value="webhooks">Webhooks</option>
            <option value="offers">Ofertas</option>
            <option value="feature">Recursos</option>
            <option value="oauth">Login Social</option>
          </select>
        </div>
      </div>

      {activeCategory === 'oauth' && <OAuthProvidersPanel />}


      <div className={`grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-12 ${activeCategory === 'oauth' ? 'hidden' : ''}`}>
        {/* Sidebar List — no mobile, esconde quando um item está aberto */}
        <div className={`lg:col-span-4 space-y-4 ${activeCategory === 'email' ? 'hidden lg:block' : ''} ${selectedItem && (activeCategory === 'ia' || activeCategory === 'payment') ? 'hidden lg:block' : ''}`}>

          {activeCategory === 'email' ? (
            <Card className="bg-[#111] border-white/5">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#ff6a00]" /> Servidores
                </CardTitle>
                <CardDescription className="text-[10px] text-white/40">Configuração de disparo transacional.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-xl bg-[#ff6a00]/10 border border-[#ff6a00] shadow-[0_0_20px_rgba(255,106,0,0.05)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[#ff6a00] text-black">
                      <Mail className="h-4 w-4" />
                    </div>
                    <Badge variant="outline" className="text-[8px] uppercase tracking-widest border-none text-emerald-400 bg-emerald-400/10">
                      ✅ Conectado
                    </Badge>
                  </div>
                  <h4 className="font-bold text-sm text-white uppercase tracking-tight">Resend (API)</h4>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Principal</span>
                    <ChevronRight className="h-3 w-3 text-[#ff6a00]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : activeCategory === 'webhooks' ? (

             <Card className="bg-[#111] border-white/5">
               <CardHeader className="pb-4">
                 <div className="flex items-center justify-between">
                   <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                     <Zap className="h-4 w-4 text-[#ff6a00]" /> Endpoints
                   </CardTitle>
                   <Button variant="outline" size="sm" onClick={handleCopyAll} className="h-7 text-[9px] uppercase tracking-widest bg-white/5 border-white/10 hover:bg-white/10">
                     {copiedAll ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                     Copiar Todos
                   </Button>
                 </div>
               </CardHeader>
               <CardContent className="space-y-4">
                 {WEBHOOKS.map((webhook, idx) => (
                   <div key={idx} className="p-3 bg-black/40 border border-white/5 rounded-lg group">
                     <div className="flex items-center justify-between mb-2">
                       <span className="text-[10px] font-bold text-white/60 uppercase">{webhook.name}</span>
                       <Button variant="ghost" size="icon" onClick={() => handleCopy(webhook.url)} className="h-6 w-6 opacity-0 group-hover:opacity-100 transition">
                         <Copy className="h-3 w-3" />
                       </Button>
                     </div>
                     <code className="text-[9px] text-[#ff6a00] break-all bg-orange-500/5 p-1.5 rounded block">
                       {webhook.url}
                     </code>
                   </div>
                 ))}
               </CardContent>
             </Card>
          ) : (
            <div className="space-y-3">
              {isLoading ? (
                Array(4).fill(0).map((_, i) => <div key={i} className="h-24 bg-white/5 animate-pulse rounded-lg border border-white/5" />)
              ) : (
                filtered.map((item) => {
                  const status = validateStatus(item);
                  return (
                    <button 
                      key={item.id}
                      onClick={() => { setSelectedItem(item); setOriginalItem(JSON.parse(JSON.stringify(item))); setTestResult(null); }}
                      className={`w-full text-left p-4 rounded-xl border transition-all duration-300 group ${selectedItem?.id === item.id ? 'bg-[#ff6a00]/10 border-[#ff6a00] shadow-[0_0_20px_rgba(255,106,0,0.1)]' : 'bg-[#111] border-white/5 hover:border-white/20'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`p-2 rounded-lg ${selectedItem?.id === item.id ? 'bg-[#ff6a00] text-black' : 'bg-white/5 text-[#ff6a00]'}`}>
                          {item.type === 'ia' || item.category === 'resend' ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                        </div>
                        <Badge variant="outline" className={`text-[8px] uppercase tracking-widest border-none ${status === 'connected' ? 'text-emerald-400 bg-emerald-400/10' : status === 'incomplete' ? 'text-amber-400 bg-amber-400/10' : 'text-white/20 bg-white/5'}`}>
                          {status === 'connected' ? '✅ Configurado' : status === 'incomplete' ? '⚠ Incompleto' : '❌ Não Configurado'}
                        </Badge>
                      </div>
                      <h4 className="font-bold text-sm text-white uppercase tracking-tight">{item.name}</h4>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">{item.category}</span>
                        <ChevronRight className={`h-3 w-3 transition-transform ${selectedItem?.id === item.id ? 'translate-x-1 text-[#ff6a00]' : 'text-white/20'}`} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-8">
          {activeCategory === 'email' ? <EmailIntegrationPanel integrations={integrations} /> : activeCategory === 'offers' ? <OffersIntegrationPanel /> : (activeCategory === 'feature') ? (
            <Tabs defaultValue="coupons" className="w-full">
              <TabsList className="scrollbar-hidden w-full overflow-x-auto bg-black/40 border border-white/5 p-1 mb-6 [-webkit-overflow-scrolling:touch]">
                <TabsTrigger value="coupons" className="flex-1 shrink-0 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
                  Cupons de Desconto
                </TabsTrigger>
                <TabsTrigger value="beta" className="flex-1 shrink-0 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
                  Recursos Beta
                </TabsTrigger>
              </TabsList>
              <TabsContent value="coupons"><CouponsPanel /></TabsContent>
              <TabsContent value="beta"><FeatureTogglePanel integrations={integrations} /></TabsContent>
            </Tabs>
          ) : (selectedItem && selectedItem.category !== 'resend') ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedItem(null); setTestResult(null); }}
                className="lg:hidden text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 -ml-2"
              >
                <ChevronRight className="h-3.5 w-3.5 mr-1 rotate-180" /> Voltar à lista
              </Button>
              <Tabs defaultValue="config" className="w-full">
                <TabsList className="scrollbar-hidden w-full overflow-x-auto bg-black/40 border border-white/5 p-1 mb-6 [-webkit-overflow-scrolling:touch]">
                  <TabsTrigger value="config" className="flex-1 shrink-0 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
                    Configuração
                  </TabsTrigger>
                  <TabsTrigger value="guide" className="flex-1 shrink-0 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
                    Como Configurar
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1 shrink-0 data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
                    Histórico & Logs
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="space-y-6 m-0">
                  <Card className="bg-[#111] border-white/5 overflow-hidden">
                    <CardHeader className="border-b border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg font-bold uppercase">Credenciais de Acesso</CardTitle>
                          <CardDescription className="text-xs text-white/40">Insira as chaves e tokens fornecidos pelo provedor.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                           <Label className="text-[10px] font-bold uppercase text-white/40">Status</Label>
                           <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedItem({ ...selectedItem, status: !selectedItem.status })}
                            className={`h-7 rounded-full px-4 border-none transition-all ${selectedItem.status ? 'bg-[#ff6a00] text-black shadow-[0_0_10px_rgba(255,106,0,0.3)]' : 'bg-white/10 text-white/40'}`}
                           >
                            {selectedItem.status ? 'ATIVO' : 'INATIVO'}
                           </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        {Object.keys(selectedItem.credentials).map((key) => (
                          <div key={key} className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                              <Key className="h-3 w-3 text-[#ff6a00]" /> {key.replace(/([A-Z])/g, ' $1').trim()}
                            </Label>
                            <Input 
                              type="password"
                              value={selectedItem.credentials[key]}
                              onChange={(e) => setSelectedItem({
                                ...selectedItem,
                                credentials: { ...selectedItem.credentials, [key]: e.target.value }
                              })}
                              className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm font-mono text-[16px] md:text-sm"
                              placeholder="sk-..."
                            />
                          </div>
                        ))}
                      </div>

                      <div className="pt-6 border-t border-white/5">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-4 flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-[#ff6a00]" /> Parâmetros Adicionais
                        </h4>
                        <div className="grid gap-6 md:grid-cols-2">
                          {Object.keys(selectedItem.settings).map((key) => (
                            <div key={key} className="space-y-2">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                              {key === 'environment' || key === 'testMode' ? (
                                <select 
                                  value={(String(selectedItem.settings[key]) === 'true') ? 'sandbox' : 'production'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (key === 'testMode') {
                                      setSelectedItem({
                                        ...selectedItem,
                                        settings: { ...selectedItem.settings, [key]: val === 'sandbox' } as Record<string, any>
                                      });
                                    } else {
                                      setSelectedItem({
                                        ...selectedItem,
                                        settings: { ...selectedItem.settings, [key]: val } as Record<string, any>
                                      });
                                    }
                                  }}
                                  className="w-full bg-black/40 border border-white/10 rounded-lg h-11 px-3 text-sm focus:border-[#ff6a00] outline-none appearance-none cursor-pointer"
                                >
                                  <option value="sandbox">Sandbox (Teste)</option>
                                  <option value="production">Produção</option>
                                </select>
                              ) : (
                                <Input 
                                  value={selectedItem.settings[key]}
                                  onChange={(e) => setSelectedItem({
                                    ...selectedItem,
                                    settings: { ...selectedItem.settings, [key]: e.target.value }
                                  })}
                                  className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-white/[0.01] border-t border-white/5 p-4 flex justify-between">
                       <div className="flex gap-2">
                         <Button variant="ghost" size="sm" onClick={handleRestore} className="text-[9px] uppercase tracking-widest hover:bg-white/5">
                           <RotateCcw className="h-3 w-3 mr-1.5" /> Descartar
                         </Button>
                       </div>
                       <Button onClick={handleSave} className="bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 text-[10px] font-bold uppercase tracking-widest h-9 px-6">
                         <Save className="h-3.5 w-3.5 mr-2" /> Salvar Alterações
                       </Button>
                    </CardFooter>
                  </Card>

                  {/* Test Section */}
                  <Card className="bg-[#111] border-white/5 overflow-hidden">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-[#ff6a00]" /> Console de Diagnóstico
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-4 items-center justify-between p-4 bg-black/40 border border-white/5 rounded-xl">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Ação Necessária</p>
                          <p className="text-xs text-white">Execute um teste para validar as credenciais configuradas.</p>
                        </div>
                        <Button 
                          onClick={handleTest} 
                          disabled={isTesting}
                          className="bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest h-10 px-6"
                        >
                          {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Zap className="h-3.5 w-3.5 mr-2 text-[#ff6a00]" />}
                          Testar Conexão
                        </Button>
                      </div>

                      {testResult && (
                        <div className={`p-5 rounded-xl border ${testResult.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'} animate-in slide-in-from-top-2 duration-300`}>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                              <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Status</p>
                              <Badge variant="outline" className={`h-5 text-[9px] border-none ${testResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {testResult.httpCode} {testResult.success ? 'OK' : 'ERROR'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Latência</p>
                              <p className="text-xs font-mono text-white">{testResult.latency}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Ambiente</p>
                              <p className="text-xs text-white uppercase tracking-wider">{testResult.environment}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Timestamp</p>
                              <p className="text-xs text-white">{new Date(testResult.timestamp).toLocaleTimeString()}</p>
                            </div>
                          </div>
                          <div className="mt-6 pt-6 border-t border-white/5">
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2">Endpoint Utilizado</p>
                            <code className="text-[10px] text-[#ff6a00] break-all bg-black/40 p-2 rounded block">{testResult.endpoint}</code>
                          </div>
                          <div className="mt-4">
                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2">Resposta da API</p>
                            <pre className="text-[10px] text-white/60 overflow-auto bg-black/40 p-3 rounded max-h-32 font-mono leading-relaxed">
                              {JSON.stringify(testResult.responseBody, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="guide" className="m-0 space-y-6">
                  <Card className="bg-[#111] border-white/5">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold uppercase flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-[#ff6a00]" /> Guia de Configuração
                      </CardTitle>
                      <CardDescription className="text-xs text-white/40">Siga o passo a passo para integrar {selectedItem.name} corretamente.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {(GUIDES[selectedItem.category] || ["Documentação em breve para este provedor."]).map((step, idx) => (
                          <div key={idx} className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:border-white/10 transition group">
                            <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-[#ff6a00]/10 text-[#ff6a00] font-bold text-sm border border-[#ff6a00]/20 group-hover:scale-110 transition">
                              {idx + 1}
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-white/80 leading-relaxed">{step}</p>
                              {step.toLowerCase().includes('webhook') && (
                                <Button variant="link" onClick={() => setActiveCategory('webhooks')} className="p-0 h-auto text-[10px] text-[#ff6a00] uppercase tracking-widest font-bold hover:no-underline hover:brightness-125">
                                  Ver URLs de Webhook <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <Alert className="mt-8 bg-orange-500/5 border-orange-500/20">
                        <Info className="h-4 w-4 text-[#ff6a00]" />
                        <AlertTitle className="text-xs font-bold uppercase tracking-widest text-[#ff6a00]">Dica de Segurança</AlertTitle>
                        <AlertDescription className="text-[11px] text-white/60">
                          Nunca compartilhe suas chaves privadas. O sistema criptografa todos os dados sensíveis antes do armazenamento.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="m-0 space-y-6">
                  <Card className="bg-[#111] border-white/5">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg font-bold uppercase">Registro de Atividades</CardTitle>
                        <CardDescription className="text-xs text-white/40">Últimos testes e alterações realizadas para {selectedItem.name}.</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => refetchHistory()} className="h-8 text-[9px] uppercase tracking-widest hover:bg-white/5">
                        <Activity className="h-3 w-3 mr-1.5" /> Atualizar
                      </Button>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {historyLogs && historyLogs.length > 0 ? historyLogs.map((log: any) => (
                          <div key={log.id} className="p-4 border border-white/5 bg-black/40 rounded-xl hover:border-white/10 transition">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className={`h-5 text-[8px] uppercase tracking-widest border-none ${log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {log.status}
                                </Badge>
                                <span className="text-[10px] font-bold text-white uppercase tracking-tight">{log.message}</span>
                              </div>
                              <div className="flex items-center gap-2 text-white/20">
                                <Clock className="h-3 w-3" />
                                <span className="text-[9px] font-medium">{new Date(log.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-4 text-[9px] font-bold uppercase tracking-widest text-white/30">
                              <div className="flex items-center gap-1.5">
                                <Zap className="h-3 w-3 text-[#ff6a00]" /> {log.latency || 'N/A'}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3 w-3 text-[#ff6a00]" /> {log.environment || 'N/A'}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Terminal className="h-3 w-3 text-[#ff6a00]" /> HTTP {log.http_code || '---'}
                              </div>
                            </div>
                          </div>
                        )) : (
                          <div className="py-20 flex flex-col items-center justify-center text-white/10 border border-dashed border-white/10 rounded-xl">
                            <Activity className="h-10 w-10 mb-4 opacity-5" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">Nenhum registro encontrado</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="h-[600px] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center bg-white/[0.01] p-12 text-center animate-pulse">
              <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <Settings2 className="h-10 w-10 text-white/10" />
              </div>
              <h3 className="text-xl font-bold text-white/40 uppercase tracking-tight">Selecione uma Integração</h3>
              <p className="text-sm text-white/20 mt-2 max-w-sm">
                Escolha um serviço ao lado para visualizar suas credenciais, guias de configuração e diagnósticos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Security Footer Info */}
      <div className="flex items-center gap-4 border border-white/5 bg-white/[0.02] p-6 rounded-2xl max-w-4xl mx-auto">
        <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00] border border-[#ff6a00]/20">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="text-left">
          <h4 className="font-display text-sm font-bold uppercase tracking-wide text-white">Arquitetura de Segurança de Camada Militar</h4>
          <p className="text-xs text-white/40 mt-1 leading-relaxed">
            Suas credenciais são protegidas por criptografia de nível industrial no banco de dados. 
            Todas as chaves sensíveis são mascaradas no frontend e os logs de auditoria registram cada interação técnica para conformidade total.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailIntegrationPanel({ integrations }: { integrations: Integration[] | undefined }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('config');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testTemplate, setTestTemplate] = useState(EMAIL_CATALOG[0]!.event);
  const getEmailSettingsFn = useServerFn(getEmailSettings);
  const getEmailLogsFn = useServerFn(getEmailLogs);
  const updateEmailSettingsFn = useServerFn(updateEmailSettings);
  const sendEmailFn = useServerFn(sendEmail);
  const sendCatalogTestFn = useServerFn(sendTemplateTestEmail);
  
  // Local state for form inputs to ensure persistence and React-controlled behavior
  const [formData, setFormData] = useState({
    from_name: '',
    from_email: '',
    reply_to: ''
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['email_settings'],
    queryFn: async () => await getEmailSettingsFn()
  });

  // Sync local form state with fetched data
  useEffect(() => {
    if (settings) {
      setFormData({
        from_name: settings.from_name || '',
        from_email: settings.from_email || '',
        reply_to: settings.reply_to || ''
      });
    }
  }, [settings]);

  const { data: resendIntegration, isLoading: loadingResend } = useQuery({
    queryKey: ['resend_integration'],
    queryFn: async () => await getResendIntegration()
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ['email_logs'],
    queryFn: async () => await getEmailLogsFn({ data: { limit: 20, offset: 0 } })
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateEmailSettingsFn>[0]) => updateEmailSettingsFn(input),
    onSuccess: (result: any) => {
      toast.success("Configurações de e-mail atualizadas!");
      if (result?.warning) {
        toast.warning(result.warning, { duration: 8000 });
      }
      queryClient.invalidateQueries({ queryKey: ['email_settings'] });
    },
    onError: (err: any) => toast.error("Erro ao salvar: " + err.message)
  });

  const sendTestMutation = useMutation({
    mutationFn: (input: Parameters<typeof sendEmailFn>[0]) => sendEmailFn(input),
    onSuccess: (result: any) => {
      toast.success(`E-mail aceito para envio pelo Resend (ID: ${result.id}). Verifique a caixa de entrada e a aba Logs.`);
      queryClient.invalidateQueries({ queryKey: ['email_logs'] });
      setIsSendingTest(false);
    },
    onError: (err: any) => {
      toast.error("Erro no envio: " + err.message, { duration: 10000 });
      setIsSendingTest(false);
    }
  });


  const handleManualSave = () => {
    if (!formData.from_name || formData.from_name.length < 2) {
      toast.error("O Nome do Remetente deve ter pelo menos 2 caracteres.");
      return;
    }

    if (!formData.from_email || !formData.from_email.includes('@')) {
      toast.error("Insira um e-mail de remetente válido.");
      return;
    }

    updateSettingsMutation.mutate({ 
      data: {
        from_name: formData.from_name, 
        from_email: formData.from_email, 
        reply_to: formData.reply_to || null,
        is_enabled: settings?.is_enabled ?? true
      }
    });
  };

  const handleToggleActivation = () => {
    const fromName = formData.from_name || settings?.from_name || '';
    const fromEmail = formData.from_email || settings?.from_email || '';

    if (!fromName || fromName.length < 2 || !fromEmail || !fromEmail.includes('@')) {
      toast.error("Preencha e salve a identidade do remetente antes de ativar o envio.");
      return;
    }

    updateSettingsMutation.mutate({
      data: {
        from_name: fromName,
        from_email: fromEmail,
        reply_to: formData.reply_to || settings?.reply_to || null,
        is_enabled: !settings?.is_enabled
      }
    });
  };

  if (loadingSettings) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="scrollbar-hidden mb-6 w-full justify-start gap-1 overflow-x-auto bg-black/40 border border-white/5 p-1 [-webkit-overflow-scrolling:touch]">
          <TabsTrigger value="config" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            Identidade
          </TabsTrigger>
          <TabsTrigger value="guide" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            Manual
          </TabsTrigger>
          <TabsTrigger value="templates" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            Templates
          </TabsTrigger>
          <TabsTrigger value="resend" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            API Key (Resend)
          </TabsTrigger>
          <TabsTrigger value="test" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            Teste de Envio
          </TabsTrigger>
          <TabsTrigger value="logs" className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#ff6a00] data-[state=active]:text-black uppercase text-[10px] font-bold tracking-widest px-4 sm:px-6 h-9">
            Logs de Auditoria
          </TabsTrigger>
        </TabsList>


        <TabsContent value="config" className="space-y-6 m-0">
          <Card className="bg-[#111] border-white/5">
            <CardHeader className="border-b border-white/5 bg-white/[0.02]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg font-bold uppercase">Identidade do Remetente</CardTitle>
                  <CardDescription className="text-xs text-white/40">Configure como os e-mails aparecerão para os alunos.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {settings?.validation_status && (
                    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest ${
                      settings.validation_status === 'verified' ? 'text-emerald-400 bg-emerald-400/10' : 
                      settings.validation_status === 'pending' ? 'text-amber-400 bg-amber-400/10' : 'text-red-400 bg-red-400/10'
                    }`}>
                      {settings.validation_status === 'verified' ? 'Domínio Validado' : 
                       settings.validation_status === 'pending' ? 'Validação Pendente' : 'Erro de Validação'}
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest ${settings?.is_enabled ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/20 bg-white/5'}`}>
                    {settings?.is_enabled ? 'ATIVO' : 'INATIVO'}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-6">
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Nome do Remetente</Label>
                  <Input 
                    value={formData.from_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, from_name: e.target.value }))}
                    className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">E-mail do Remetente</Label>
                  <Input 
                    value={formData.from_email}
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => setFormData(prev => ({ ...prev, from_email: e.target.value }))}
                    className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">E-mail de Resposta (Reply-To)</Label>
                  <Input 
                    value={formData.reply_to}
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => setFormData(prev => ({ ...prev, reply_to: e.target.value }))}
                    className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm"
                  />
                </div>
              </div>
              {settings?.validation_status === 'error' && settings?.validation_error && (
                <Alert className="border-red-500/20 bg-red-500/5 text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Envio bloqueado</AlertTitle>
                  <AlertDescription>{settings.validation_error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2 pt-4 border-t border-white/5 sm:flex-row sm:items-center">
                <Button 
                  onClick={handleManualSave}
                  disabled={updateSettingsMutation.isPending}
                  className="w-full sm:w-auto bg-[#ff6a00] text-black font-bold uppercase tracking-widest text-[10px] h-11 px-8"
                >
                  {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Configurações
                </Button>
                <Button 
                  variant="outline"
                  disabled={updateSettingsMutation.isPending}
                  onClick={handleToggleActivation}
                  className={cn(
                    "w-full sm:w-auto font-bold uppercase tracking-widest text-[10px] h-11 px-6 transition-all",
                    settings?.is_enabled 
                      ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20" 
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  )}
                >
                  {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : (settings?.is_enabled ? 'Desativar Envio' : 'Ativar Envio')}
                </Button>
              </div>

            </CardContent>
          </Card>

          <Card className="bg-[#111] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold uppercase flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#ff6a00]" /> Manual do E-mail (Resend)
              </CardTitle>
              <CardDescription className="text-xs text-white/40">Instruções para configurar o envio transacional.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">

              <div className="space-y-4">
                {GUIDES.resend.map((step, idx) => (
                  <div key={idx} className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-[#ff6a00]/10 text-[#ff6a00] font-bold text-sm border border-[#ff6a00]/20">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-400 uppercase tracking-widest">
                <Info className="h-4 w-4" /> Configuração DNS (Resend)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-white/60 space-y-2">
              <p>Para que os e-mails não caiam no spam, configure os seguintes registros no seu provedor de domínio:</p>
              <div className="bg-black/40 p-3 rounded-lg font-mono text-[10px] space-y-1">
                <p>MX: feedback-smtp.us-east-1.amazonses.com (ou específico do Resend)</p>
                <p>TXT: resend-verification=xxxxxx</p>
                <p>TXT: v=spf1 include:amazonses.com ~all</p>
              </div>
              <p className="mt-2 text-blue-400/60 italic">* Consulte o painel do Resend para os valores exatos de "xxxxxx".</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6 m-0">
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="resend" className="space-y-6 m-0">
          <ResendConfigTab integration={resendIntegration} />
        </TabsContent>

        <TabsContent value="test" className="space-y-6 m-0">
          <Card className="bg-[#111] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold uppercase">Simular Envio Transacional</CardTitle>
                  <CardDescription className="text-xs text-white/40">Este teste só mostra sucesso quando o Resend aceita o e-mail para envio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Destinatário de Teste</Label>
                  <Input 
                    placeholder="exemplo@email.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Template para Testar</Label>
                  <select 
                    value={testTemplate}
                    onChange={(e) => setTestTemplate(e.target.value)}
                    className="w-full h-11 bg-black border border-white/10 rounded-lg text-white text-sm px-4 outline-none focus:border-[#ff6a00]"
                  >
                    {EMAIL_CATALOG.map((item) => (
                      <option key={item.event} value={item.event}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <Button 
                disabled={!testTo || isSendingTest}
                onClick={async () => {
                  setIsSendingTest(true);
                  try {
                    await sendCatalogTestFn({
                      data: {
                        to: testTo,
                        event: testTemplate,
                        data: sampleDataFor(testTemplate),
                      }
                    });
                    toast.success("E-mail de teste enviado com o conteúdo real do template!");
                  } catch (err: any) {
                    toast.error("Falha no envio: " + (err?.message ?? 'desconhecido'));
                  } finally {
                    setIsSendingTest(false);
                  }
                }}
                className="w-full bg-[#ff6a00] text-black font-bold uppercase tracking-widest text-[10px] h-12"
              >
                {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SendHorizontal className="h-4 w-4 mr-2" />}
                Disparar E-mail de Teste
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="m-0">
          <Card className="bg-[#111] border-white/5">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold uppercase">Auditoria de Disparos</CardTitle>
                <CardDescription className="text-xs text-white/40">Últimos 20 e-mails processados pelo sistema.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['email_logs'] })} className="text-white/40">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-white/[0.02] border-y border-white/5">
                      <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Template</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Destinatário</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Status</th>
                       <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Detalhes</th>
                       <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-white/40">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loadingLogs ? (
                      Array(5).fill(0).map((_, i) => <tr key={i} className="h-16 animate-pulse bg-white/[0.01]" />)
                    ) : logs?.length === 0 ? (
                      <tr>
                         <td colSpan={5} className="px-6 py-12 text-center text-xs text-white/20 uppercase font-bold tracking-widest">Nenhum log encontrado.</td>
                      </tr>
                    ) : (
                      logs?.map((log: any) => (
                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded bg-white/5 text-[#ff6a00]">
                                <Mail className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-xs font-medium text-white/80">{log.template_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-white/40">{log.recipient_email.replace(/(.{3}).*(@.*)/, '$1***$2')}</span>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className={`text-[8px] uppercase tracking-widest border-none ${
                              log.status === 'sent' ? 'text-emerald-400 bg-emerald-400/10' : 
                              log.status === 'queued' ? 'text-blue-400 bg-blue-400/10' : 'text-red-400 bg-red-400/10'
                            }`}>
                              {log.status}
                            </Badge>
                          </td>
                           <td className="max-w-xs px-6 py-4 text-[10px] text-white/50">
                             {log.error_message || (log.provider_message_id ? `ID: ${log.provider_message_id}` : '—')}
                           </td>
                          <td className="px-6 py-4 text-[10px] text-white/20">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResendConfigTab({ integration: initialIntegration }: { integration: Integration | undefined }) {
  const queryClient = useQueryClient();
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [originalIntegration, setOriginalIntegration] = useState<Integration | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  
  const testConnectionFn = useServerFn(testIntegrationConnection);
  const saveIntegrationFn = useServerFn(saveIntegration);

  const validateMutation = useMutation({
    mutationFn: validateSender,
    onSuccess: (res) => {
      if (res.status === 'verified') toast.success("Remetente validado no Resend!");
      else if (res.status === 'pending') toast.warning("Domínio pendente de verificação DNS.");
      else toast.error(res.error || "Domínio não encontrado no Resend.");
      queryClient.invalidateQueries({ queryKey: ['email_settings'] });
    }
  });

  useEffect(() => {
    if (initialIntegration) {
      setIntegration(JSON.parse(JSON.stringify(initialIntegration)));
      setOriginalIntegration(JSON.parse(JSON.stringify(initialIntegration)));
    } else {
      setIntegration({
        id: '' as any,
        name: 'Resend',
        type: 'ia' as any,
        category: 'resend',
        status: false,
        credentials: { apiKey: '' },
        settings: {}
      });
    }
  }, [initialIntegration]);

  const handleSave = async () => {
    if (!integration) return;
    try {
      await saveIntegrationFn({ 
        data: {
          ...integration,
          type: 'ia' as any
        }
      });
      toast.success("API Key do Resend salva com sucesso.");
      
      // Auto-validate after save if we have the identity email
      const settingsResult = await getEmailSettings();
      const settings = (settingsResult as any);
      if (settings?.from_email && integration.credentials.apiKey) {

        validateMutation.mutate({ 
          data: { 
            apiKey: integration.credentials.apiKey, 
            email: settings.from_email 
          } 
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['resend_integration'] });
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setOriginalIntegration(JSON.parse(JSON.stringify(integration)));
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const handleTest = async () => {
    if (!integration?.credentials.apiKey) {
      toast.error("Insira a API Key antes de testar.");
      return;
    }
    try {
      setIsTesting(true);
      setTestResult(null);
      const result = await testConnectionFn({
        data: {
          id: integration.id || 'temp',
          category: 'resend',
          credentials: integration.credentials,
          settings: integration.settings,
          environment: 'production'
        }
      });
      setTestResult(result);
      if (result.success) toast.success("Conexão com Resend validada!");
      else toast.error("Falha na validação: " + result.message);
    } catch (err: any) {
      toast.error(err.message || "Erro no teste");
    } finally {
      setIsTesting(false);
    }
  };

  if (!integration) return null;

  return (
    <Card className="bg-[#111] border-white/5">
      <CardHeader className="border-b border-white/5 bg-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg font-bold uppercase flex items-center gap-2">
              <Mail className="h-5 w-5 shrink-0 text-[#ff6a00]" /> <span className="min-w-0">Credenciais API (Resend)</span>
            </CardTitle>
            <CardDescription className="text-xs text-white/40">Insira sua API Key para habilitar os envios transacionais.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
             <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIntegration({ ...integration, status: !integration.status })}
              className={`h-8 shrink-0 rounded-full px-4 border-none text-[10px] font-bold uppercase tracking-widest transition-all ${integration.status ? 'bg-[#ff6a00] text-black' : 'bg-white/10 text-white/40'}`}
            >
              {integration.status ? 'ATIVO' : 'INATIVO'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6">

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
            <Key className="h-3 w-3 text-[#ff6a00]" /> API Key
          </Label>
          <Input 
            type="password"
            value={integration.credentials.apiKey || ''}
            onChange={(e) => setIntegration({
              ...integration,
              credentials: { ...integration.credentials, apiKey: e.target.value }
            })}
            placeholder="re_..."
            className="bg-black/40 border-white/10 focus:border-[#ff6a00] h-11 text-sm font-mono"
          />
        </div>

        <div className="pt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3 p-4 bg-black/40 border border-white/5 rounded-xl sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Teste de Conexão</p>
              <p className="text-xs text-white">Valide se a chave inserida é válida na Resend.</p>
            </div>
            <Button 
              onClick={handleTest} 
              disabled={isTesting}
              className="w-full sm:w-auto shrink-0 bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest h-11 px-6"
            >
              {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Zap className="h-3.5 w-3.5 mr-2 text-[#ff6a00]" />}
              Testar
            </Button>
          </div>


          {testResult && (
            <div className={`p-4 rounded-xl border break-words ${testResult.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <p className="text-[10px] font-bold uppercase text-white/60">{testResult.success ? 'Conexão OK' : 'Falha na Conexão'}</p>
              <p className="text-xs text-white/40 mt-1">{testResult.message}</p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-white/[0.01] border-t border-white/5 p-4 flex flex-wrap items-center justify-between gap-2">

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => {
            if (originalIntegration) {
              setIntegration(JSON.parse(JSON.stringify(originalIntegration)));
              toast.info("Configurações restauradas.");
            }
          }} 
          className="text-[9px] uppercase tracking-widest hover:bg-white/5"
        >
          <RotateCcw className="h-3 w-3 mr-1.5" /> Descartar
        </Button>
        <Button onClick={handleSave} className="bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 text-[10px] font-bold uppercase tracking-widest h-9 px-6">
          <Save className="h-3.5 w-3.5 mr-2" /> Salvar API Key
        </Button>
      </CardFooter>
    </Card>
  );
}

function OffersIntegrationPanel() {
  const queryClient = useQueryClient();
  
  const { data: offerSettings, isLoading } = useQuery({
    queryKey: ['offer_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('category', 'offer_settings')
        .maybeSingle();
      
      if (error) throw error;
      return data;
    }
  });

  const saveOfferSettings = async (updates: { status?: boolean, discount?: number }) => {
    try {
      const existingSettings = offerSettings?.settings as Record<string, any> || {};
      const newSettings = {
        ...existingSettings,
        discountPercentage: updates.discount !== undefined ? updates.discount : (existingSettings.discountPercentage || 15)
      };

      const { error } = await supabase
        .from('integrations')
        .upsert({
          name: 'Configurações de Oferta',
          type: 'payment',
          category: 'offer_settings',
          status: updates.status !== undefined ? updates.status : (offerSettings?.status ?? true),
          credentials: offerSettings?.credentials || {},
          settings: newSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'category' });

      if (error) throw error;

      invalidateIntegrationConfig();

      if (updates.status !== undefined && typeof window !== 'undefined' && (window as any).togglePostPurchaseOfferPopup) {
        (window as any).togglePostPurchaseOfferPopup(updates.status);
      }

      toast.success("Configurações de oferta atualizadas!");
      queryClient.invalidateQueries({ queryKey: ['offer_settings'] });
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" /></div>;

  const settings = offerSettings?.settings as Record<string, any> || {};
  const currentDiscount = settings.discountPercentage || 15;
  const isEnabled = offerSettings?.status ?? true;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="bg-[#111] border-white/5 overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-white/[0.02]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg font-bold uppercase flex items-center gap-2">
                <Sparkles className="h-5 w-5 shrink-0 text-[#ff6a00]" /> <span className="min-w-0">Gestão de Ofertas (Upsell)</span>
              </CardTitle>
              <CardDescription className="text-xs text-white/40">
                Configure o comportamento do popup de oferta pós-venda.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  toast.info("Manual: Defina o percentual de desconto que será aplicado a todos os produtos sugeridos no popup de upsell que aparece após uma compra bem-sucedida.");
                }}
                className="h-9 text-[9px] uppercase tracking-widest bg-white/5 border-white/10 hover:bg-white/10"
              >
                <BookOpen className="h-3 w-3 mr-1.5" /> Manual
              </Button>
              <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-full border border-white/5">
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 ${isEnabled ? 'text-emerald-400' : 'text-white/20'}`}>
                  {isEnabled ? 'Ativado' : 'Desativado'}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => saveOfferSettings({ status: !isEnabled })}
                  className={`h-7 w-12 shrink-0 rounded-full p-0 transition-all relative ${isEnabled ? 'bg-emerald-500/20' : 'bg-white/5'}`}
                >
                  <div className={`absolute top-1 h-5 w-5 rounded-full transition-all duration-300 shadow-lg ${isEnabled ? 'right-1 bg-emerald-400 shadow-emerald-500/50' : 'left-1 bg-white/20'}`} />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-8 space-y-6 sm:space-y-8">
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2">

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                  <Percent className="h-4 w-4 shrink-0 text-[#ff6a00]" /> Percentual de Desconto
                </Label>
                <Badge variant="outline" className="bg-[#ff6a00]/10 text-[#ff6a00] border-none font-black">
                  Mínimo 15%
                </Badge>
              </div>

              <div className="relative group">
                <Input 
                  type="number"
                  min={15}
                  max={100}
                  defaultValue={currentDiscount}
                  id="discount_input"
                  className="bg-black/60 border-white/10 focus:border-[#ff6a00] h-14 text-xl font-bold pl-12 rounded-2xl transition-all"
                />
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 font-bold group-focus-within:text-[#ff6a00] transition-colors">%</span>
              </div>
              <p className="text-[10px] text-white/30 italic">
                * Este desconto será aplicado automaticamente sobre o valor original dos produtos sugeridos no popup de upsell.
              </p>
            </div>

            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                  <Zap className="h-5 w-5 text-[#ff6a00]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest">Ação Imediata</h4>
                  <p className="text-[10px] text-white/40">As mudanças refletem instantaneamente no checkout.</p>
                </div>
              </div>

              <Button 
                onClick={() => {
                  const input = document.getElementById('discount_input') as HTMLInputElement;
                  const val = parseInt(input.value);
                  if (isNaN(val) || val < 15) {
                    toast.error("O desconto mínimo permitido é de 15%");
                    return;
                  }
                  saveOfferSettings({ discount: val });
                }}
                className="w-full bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90 font-black uppercase tracking-[0.2em] text-[10px] h-12 rounded-xl shadow-lg shadow-orange-500/20"
              >
                <Save className="h-4 w-4 mr-2" /> Atualizar Regras de Oferta
              </Button>
            </div>
          </div>

          <div className="pt-6 sm:pt-8 border-t border-white/5 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
             <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Tipo de Oferta</p>
                <p className="text-xs font-bold text-white uppercase">Pós-venda (Upsell)</p>
             </div>
             <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Itens exibidos</p>
                <p className="text-xs font-bold text-white uppercase">2-3 Produtos</p>
             </div>
             <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Gatilho</p>
                <p className="text-xs font-bold text-white uppercase">Ao clicar em comprar</p>
             </div>
          </div>
        </CardContent>
      </Card>

      <Alert className="bg-[#ff6a00]/5 border-[#ff6a00]/20 max-w-2xl">
        <Info className="h-4 w-4 text-[#ff6a00]" />
        <AlertTitle className="text-xs font-bold uppercase tracking-widest text-[#ff6a00]">Dica Estratégica</AlertTitle>
        <AlertDescription className="text-[11px] text-white/50 leading-relaxed">
          Oferecer descontos entre 15% e 30% no momento da compra aumenta a taxa de conversão do ticket médio em até 22%. 
          Certifique-se de que os produtos selecionados como "complementares" façam sentido para a jornada do aluno.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function EmailTemplatesTab() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const getTemplatesFn = useServerFn(getEmailTemplates);
  const saveTemplateFn = useServerFn(saveEmailTemplate);
  const deleteTemplateFn = useServerFn(deleteEmailTemplate);
  const sendRawTestFn = useServerFn(sendRawTestEmail);
  const previewRawFn = useServerFn(previewRawTemplate);
  const [rawPreview, setRawPreview] = useState<{ subject: string; html: string } | null>(null);
  const [rawViewMode, setRawViewMode] = useState<'visual' | 'html'>('visual');
  const [isRendering, setIsRendering] = useState(false);

  const handleShowFinalHtml = async () => {
    const subject = (document.getElementById('temp_subject') as HTMLInputElement)?.value ?? '';
    const html = (document.getElementById('temp_html') as HTMLTextAreaElement)?.value ?? '';
    if (!subject.trim() || html.trim().length < 10) {
      toast.error('Preencha o assunto e o conteúdo HTML antes de visualizar.');
      return;
    }
    setIsRendering(true);
    try {
      const result = await previewRawFn({
        data: {
          subject,
          html,
          data: {
            name: 'Churrasqueiro',
            product_name: 'Curso Mestre do Churrasco',
            access_link: 'https://ronneinaveia.com.br/app',
            amount: 'R$ 197,00',
            payment_id: 'pay_000123456',
          },
        },
      });
      setRawPreview(result);
    } catch (err: any) {
      toast.error('Erro ao renderizar: ' + (err?.message ?? 'desconhecido'));
    } finally {
      setIsRendering(false);
    }
  };

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => await getTemplatesFn()
  });

  const filteredTemplates = templates?.filter((t: any) => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: saveTemplateFn,
    onSuccess: () => {
      toast.success("Template salvo com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      setIsEditing(false);
      setSelectedTemplate(null);
    },
    onError: (err: any) => toast.error("Erro ao salvar template: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplateFn,
    onSuccess: () => {
      toast.success("Template removido.");
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      setSelectedTemplate(null);
    }
  });

  const handleSave = () => {
    const name = (document.getElementById('temp_name') as HTMLInputElement).value;
    const subject = (document.getElementById('temp_subject') as HTMLInputElement).value;
    const content_html = (document.getElementById('temp_html') as HTMLTextAreaElement).value;
    const description = (document.getElementById('temp_desc') as HTMLInputElement).value;
    
    if (!name || name.length < 2) {
      toast.error("O nome do template deve ter pelo menos 2 caracteres.");
      return;
    }
    
    if (!subject || subject.length < 2) {
      toast.error("O assunto deve ter pelo menos 2 caracteres.");
      return;
    }
    
    if (!content_html || content_html.length < 10) {
      toast.error("O conteúdo HTML deve ter pelo menos 10 caracteres.");
      return;
    }

    saveMutation.mutate({ 
      data: {
        id: selectedTemplate?.id,
        name,
        subject,
        content_html,
        description,
        variables: selectedTemplate?.variables || []
      }
    });
  };

  const handleTestEmail = async () => {
    if (!selectedTemplate) return;
    const email = prompt("Digite o e-mail para receber o teste:");
    if (!email) return;

    try {
      setIsSendingTest(true);
      const subject = (document.getElementById('temp_subject') as HTMLInputElement).value;
      const html = (document.getElementById('temp_html') as HTMLTextAreaElement).value;

      await sendRawTestFn({
        data: {
          to: email,
          subject,
          html,
          data: {
            name: 'Churrasqueiro',
            product_name: 'Curso Mestre do Churrasco',
            link: 'https://ronneinaveia.com.br/app',
            dashboard_url: 'https://ronneinaveia.com.br/app',
          }
        }
      });
      toast.success("E-mail de teste enviado!");
    } catch (err: any) {
      toast.error("Erro ao enviar teste: " + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
    <EmailSystemTemplatesPanel />

    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-4 space-y-4">

        <Button 
          onClick={() => { setSelectedTemplate({ name: '', subject: '', content_html: '', description: '' }); setIsEditing(true); }}
          className="w-full bg-[#ff6a00] text-black font-bold uppercase tracking-widest text-[10px] h-10"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Template
        </Button>
        
        <div className="space-y-2">
          <div className="relative mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Input 
                placeholder="Buscar templates..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black/40 border-white/10 h-9 text-[10px] pl-8"
              />
              <Search className="h-3 w-3 text-white/20 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['email_templates'] })}
              className="h-9 w-9 border-white/10 bg-black/40 hover:bg-[#ff6a00]/10 hover:text-[#ff6a00] hover:border-[#ff6a00]/50"
              title="Atualizar listagem"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-lg" />)
          ) : filteredTemplates?.map((temp: any) => (
            <button
              key={temp.id}
              onClick={() => { setSelectedTemplate(temp); setIsEditing(true); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${selectedTemplate?.id === temp.id ? 'bg-[#ff6a00]/10 border-[#ff6a00]' : 'bg-[#111] border-white/5 hover:border-white/20'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-white uppercase tracking-tight">{temp.name}</p>
                <Badge variant="outline" className="text-[8px] border-white/10 text-white/40 uppercase">Template</Badge>
              </div>
              <p className="text-[10px] text-white/40 truncate">{temp.subject}</p>
            </button>
          ))}
          {!isLoading && error && (
            <div className="py-6 px-4 text-center text-[10px] text-red-400 uppercase font-bold tracking-widest border border-red-500/20 bg-red-500/5 rounded-lg">
              Erro ao carregar templates: {(error as any)?.message}
            </div>
          )}
          {!isLoading && !error && filteredTemplates?.length === 0 && (
            <div className="py-8 text-center text-[10px] text-white/20 uppercase font-bold tracking-widest">
              {searchQuery ? "Nenhum template encontrado" : "Nenhum template cadastrado"}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {isEditing && selectedTemplate ? (
          <Card className="bg-[#111] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold uppercase">{selectedTemplate.id ? 'Editar Template' : 'Novo Template'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Finalidade / Tipo de Uso (Slug)
                  </Label>
                  <Input 
                    id="temp_name" 
                    placeholder="ex: boas_vindas, acesso_curso"
                    defaultValue={selectedTemplate.name} 
                    className="bg-black/40 border-white/10 focus:border-[#ff6a00]" 
                  />
                  <p className="text-[9px] text-white/20 italic">* Use letras minúsculas, números e underscores (ex: recovery_password_01)</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Descrição Curta</Label>
                  <Input 
                    id="temp_desc" 
                    placeholder="Para que serve este e-mail?"
                    defaultValue={selectedTemplate.description} 
                    className="bg-black/40 border-white/10" 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Assunto do E-mail</Label>
                <Input 
                  id="temp_subject" 
                  placeholder="Assunto que o cliente verá"
                  defaultValue={selectedTemplate.subject} 
                  className="bg-black/40 border-white/10" 
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-9 space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Conteúdo HTML</Label>
                  <textarea 
                    id="temp_html" 
                    defaultValue={selectedTemplate.content_html} 
                    rows={12}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-xs text-white/80 focus:border-[#ff6a00] outline-none"
                    placeholder="<html>... Use {{variable}} para campos dinâmicos</html>"
                  />
                </div>
                <div className="lg:col-span-3 space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Variáveis Comuns</Label>
                  <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg space-y-2">
                    {['name', 'product_name', 'access_link', 'amount', 'payment_id'].map(v => (
                      <div 
                        key={v} 
                        className="flex items-center justify-between group cursor-pointer"
                        onClick={() => {
                          const textarea = document.getElementById('temp_html') as HTMLTextAreaElement;
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const text = textarea.value;
                          textarea.value = text.substring(0, start) + `{{${v}}}` + text.substring(end);
                          textarea.focus();
                        }}
                      >
                        <code className="text-[9px] text-[#ff6a00] group-hover:text-white transition-colors">{`{{${v}}}`}</code>
                        <Plus className="h-2.5 w-2.5 text-white/10 group-hover:text-[#ff6a00]" />
                      </div>
                    ))}
                    <p className="text-[8px] text-white/20 pt-2 border-t border-white/5">Clique para inserir no cursor.</p>
                  </div>
                </div>
              </div>

              {rawPreview && (
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mr-auto">
                      HTML final — assunto: <span className="text-white/70 normal-case">{rawPreview.subject}</span>
                    </p>
                    {(['visual', 'html'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setRawViewMode(mode)}
                        className={`px-3 h-8 rounded-lg border text-[9px] font-bold uppercase tracking-widest ${
                          rawViewMode === mode
                            ? 'bg-[#ff6a00]/10 border-[#ff6a00] text-white'
                            : 'bg-black/40 border-white/5 text-white/50'
                        }`}
                      >
                        {mode === 'visual' ? 'Visual' : 'Código'}
                      </button>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(rawPreview.html);
                        toast.success('HTML final copiado.');
                      }}
                      className="border-white/10 text-white/60 uppercase text-[9px] font-bold h-8 px-3"
                    >
                      Copiar
                    </Button>
                  </div>
                  <div
                    className={`rounded-xl overflow-hidden border border-white/10 h-[420px] ${
                      rawViewMode === 'visual' ? 'bg-white' : 'bg-black/60'
                    }`}
                  >
                    {rawViewMode === 'visual' ? (
                      <iframe title="HTML final do modelo" srcDoc={rawPreview.html} sandbox="" className="w-full h-full border-0" />
                    ) : (
                      <pre className="w-full h-full overflow-auto p-4 text-[10px] leading-relaxed text-emerald-200/80 whitespace-pre-wrap break-words font-mono">
                        {rawPreview.html}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-[#ff6a00] text-black font-bold uppercase tracking-widest text-[10px] px-8">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleShowFinalHtml}
                    disabled={isRendering}
                    className="border-white/10 text-white/60 hover:text-white uppercase text-[10px] font-bold"
                  >
                    {isRendering ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Eye className="h-3.5 w-3.5 mr-2" />}
                    Ver HTML final
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleTestEmail} 
                    disabled={isSendingTest}
                    className="border-white/10 text-white/60 hover:text-white uppercase text-[10px] font-bold"
                  >
                    {isSendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <SendHorizontal className="h-3.5 w-3.5 mr-2" />}
                    Enviar Teste
                  </Button>
                </div>
                {selectedTemplate.id && (
                  <Button 
                    variant="outline" 
                    onClick={() => deleteMutation.mutate({ data: { id: selectedTemplate.id } })}
                    className="border-red-500/20 text-red-500 hover:bg-red-500/10 uppercase text-[10px] font-bold"
                  >
                    Excluir
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-[400px] border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-white/10">
            <Mail className="h-12 w-12 mb-4 opacity-5" />
            <p className="text-xs uppercase font-bold tracking-widest">Selecione ou crie um template</p>
          </div>
        )}
      </div>
    </div>
    </div>
  );

}

function FeatureTogglePanel({ integrations }: { integrations: Integration[] | undefined }) {
  const queryClient = useQueryClient();
  const saveIntegrationFn = useServerFn(saveIntegration);

  const features = [
    {
      id: 'interactive_previews',
      name: 'Previews Interativas',
      description: 'Habilita o modo de interação ao vivo e componentes dinâmicos nos capítulos dos E-books.',
      icon: Sparkles,
      category: 'interactive_previews',
      settingsFields: [
        { key: 'theme', label: 'Tema do Editor', type: 'select', options: ['modern', 'classic', 'minimal'], default: 'modern' },
        { key: 'auto_sanitize', label: 'Sanitização Automática', type: 'boolean', default: true },
        { key: 'allow_scripts', label: 'Permitir Scripts Externos', type: 'boolean', default: false },
        { key: 'max_depth', label: 'Profundidade Máxima da Árvore', type: 'number', default: 5 }
      ]
    }
  ];

  const handleToggle = async (feature: any, currentStatus: boolean) => {
    try {
      const integration = integrations?.find(i => i.category === feature.category);
      
      await saveIntegrationFn({
        data: {
          id: integration?.id || '',
          name: feature.name,
          type: 'ia',
          category: feature.category,
          status: !currentStatus,
          credentials: {},
          settings: integration?.settings || { description: feature.description, is_feature: 'true' }
        }
      });
      
      toast.success(`${feature.name} ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err: any) {
      toast.error("Erro ao alterar estado: " + err.message);
    }
  };

  const handleUpdateSettings = async (feature: any, newSettings: Record<string, any>) => {
    try {
      const integration = integrations?.find(i => i.category === feature.category);
      
      await saveIntegrationFn({
        data: {
          id: integration?.id || '',
          name: feature.name,
          type: 'ia',
          category: feature.category,
          status: integration?.status ?? true,
          credentials: {},
          settings: { ...(integration?.settings || {}), ...newSettings, is_feature: 'true' }
        }
      });
      
      toast.success(`Configurações de ${feature.name} atualizadas!`);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err: any) {
      toast.error("Erro ao salvar configurações: " + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="grid gap-6">
        {features.map((feature) => {
          const integration = integrations?.find(i => i.category === feature.category);
          const isActive = integration?.status ?? false;
          
          return (
            <Card key={feature.id} className="bg-[#111] border-white/5 overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/[0.02] p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                    <div className={`shrink-0 p-3 rounded-xl ${isActive ? 'bg-[#ff6a00] text-black shadow-[0_0_20px_rgba(255,106,0,0.2)]' : 'bg-white/5 text-white/40'}`}>
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg font-bold uppercase tracking-tight">{feature.name}</CardTitle>
                      <CardDescription className="text-xs text-white/40 mt-1 max-w-md">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <Badge variant="outline" className={`text-[9px] uppercase tracking-widest border-none ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/20'}`}>
                      {isActive ? 'Ativado' : 'Desativado'}
                    </Badge>
                    <Button 
                      onClick={() => handleToggle(feature, isActive)}
                      className={`h-11 flex-1 px-6 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all sm:flex-none ${isActive ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-[#ff6a00] text-black hover:bg-[#ff6a00]/90'}`}
                    >
                      {isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {isActive && feature.settingsFields && (
                <CardContent className="p-4 sm:p-6 bg-white/[0.01]">
                  <div className="grid gap-4 sm:gap-6 md:grid-cols-2">

                    {feature.settingsFields.map((field: any) => (
                      <div key={field.key} className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{field.label}</Label>
                        
                        {field.type === 'boolean' ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-8 text-[9px] uppercase tracking-widest border-white/10",
                                String(integration?.settings?.[field.key]) === 'true' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-white/40"
                              )}
                              onClick={() => handleUpdateSettings(feature, { [field.key]: 'true' })}
                            >
                              Habilitado
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-8 text-[9px] uppercase tracking-widest border-white/10",
                                String(integration?.settings?.[field.key]) === 'false' || !integration?.settings?.[field.key] ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-white/5 text-white/40"
                              )}
                              onClick={() => handleUpdateSettings(feature, { [field.key]: 'false' })}
                            >
                              Desabilitado
                            </Button>
                          </div>
                        ) : field.type === 'select' ? (
                          <select 
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-[#ff6a00]"
                            value={String(integration?.settings?.[field.key] || field.default)}
                            onChange={(e) => handleUpdateSettings(feature, { [field.key]: e.target.value })}
                          >
                            {field.options?.map((opt: string) => (
                              <option key={opt} value={opt} className="bg-[#111]">{opt.toUpperCase()}</option>
                            ))}
                          </select>
                        ) : (
                          <Input 
                            type={field.type}
                            className="bg-black/40 border-white/10 h-9 text-xs focus:border-[#ff6a00]"
                            value={String(integration?.settings?.[field.key] || field.default)}
                            onChange={(e) => handleUpdateSettings(feature, { [field.key]: e.target.value })}
                          />
                        )}
                      </div>
                    ))}
                    {feature.category === 'interactive_previews' && (
                      <div className="md:col-span-2 mt-4 p-4 bg-white/5 border border-white/10 rounded-xl">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00] mb-3 flex items-center gap-2">
                          <BookOpen className="h-3 w-3" /> Guia de Configuração
                        </h4>
                        <div className="space-y-3">
                          {GUIDES.interactive_previews.map((step, idx) => (
                            <div key={idx} className="flex gap-3 text-[10px] text-white/60 leading-relaxed">
                              <span className="text-[#ff6a00] font-bold shrink-0">{idx + 1}.</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
      
      <Alert className="bg-orange-500/5 border-orange-500/20">
        <Info className="h-4 w-4 text-[#ff6a00]" />
        <AlertTitle className="text-xs font-bold uppercase tracking-widest text-[#ff6a00]">Informação</AlertTitle>
        <AlertDescription className="text-[11px] text-white/60">
          Ativar recursos beta ou em desenvolvimento pode afetar a experiência dos usuários finais. Use com cautela.
        </AlertDescription>
      </Alert>
    </div>
  );
}
