import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings, 
  User, 
  CreditCard, 
  Save,
  Loader2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/afiliados/config")({
  head: () => ({
    meta: [
      { title: "Configurações de Afiliado" },
      { name: "description", content: "Ajuste seus dados de pagamento e preferências do programa de afiliados." },
      { property: "og:title", content: "Configurações de Afiliado" },
      { property: "og:description", content: "Ajuste seus dados de pagamento e preferências do programa de afiliados." },
    ],
  }),
  component: AffiliateConfigPage,
});

function AffiliateConfigPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pixKey, setPixKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: affiliate, isLoading } = useQuery({
    queryKey: ["affiliate-config", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", user?.id as string)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (affiliate?.pix_key) {
      setPixKey(affiliate.pix_key);
    }
  }, [affiliate]);

  const updateConfig = useMutation({
    mutationFn: async () => {
      setIsSaving(true);
      const { error } = await supabase
        .from("affiliates")
        .update({ pix_key: pixKey })
        .eq("id", user?.id as string);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-config"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar: " + error.message);
    },
    onSettled: () => {
      setIsSaving(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8 text-left overflow-x-hidden">
      <section className="glass p-5 sm:p-6 lg:p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-fire/20 p-2 rounded-xl">
            <CreditCard className="w-6 h-6 text-fire" />
          </div>
          <div>
            <h3 className="text-xl font-display font-black">Dados de Pagamento</h3>
            <p className="text-sm text-muted-foreground">Informe como deseja receber suas comissões.</p>
          </div>
        </div>

        <form 
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            updateConfig.mutate();
          }}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Chave PIX</label>
            <input 
              required
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="E-mail, CPF, Celular ou Chave Aleatória"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm font-medium outline-none transition-all placeholder:text-white/10 focus:border-fire/50 focus:bg-fire/5" 
            />
            <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Certifique-se de que a chave está correta para evitar erros no pagamento.
            </p>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={isSaving}
              className="btn-fire w-full py-4 flex items-center justify-center gap-2 font-bold"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </form>
      </section>

      <section className="glass p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        <h4 className="font-bold mb-4">Termos do Programa de Afiliados</h4>
        <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
          <p>1. As comissões são calculadas sobre o valor líquido da venda (após descontos e taxas de processamento).</p>
          <p>2. O prazo para liberação do saldo é de 7 dias úteis após a confirmação da compra pelo cliente.</p>
          <p>3. É proibido realizar SPAM ou utilizar técnicas de divulgação enganosas.</p>
          <p>4. O uso de marca própria como se fosse a empresa oficial é vedado.</p>
        </div>
      </section>
    </div>
  );
}
