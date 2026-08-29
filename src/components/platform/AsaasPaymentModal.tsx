import React from 'react';
import { supabase } from "@/integrations/supabase/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ExternalLink, CheckCircle2, ShoppingBag, ArrowRight, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { verifyAsaasPayment, checkAsaasCheckoutHealth } from "@/lib/asaas.functions";
import { completePendingCheckout } from "@/lib/checkout.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { gtmPurchase } from "@/lib/gtm";
import { getMyFidelizeAccount } from "@/lib/fidelize-account.functions";
import { useQueryClient } from "@tanstack/react-query";



export function AsaasPaymentModal() {
  const { isOpen, paymentUrl, title, productId, productType, value, transactionId, status, closePayment, setStatus } = usePaymentModal();
  const { isEnrolledInCourse, isEnrolledInEbook, refetchEnrollments } = useEnrollments();
  const [opened, setOpened] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [checkoutDown, setCheckoutDown] = React.useState(false);
  const navigate = useNavigate();
  const completeCheckout = useServerFn(completePendingCheckout);
  const probeCheckout = useServerFn(checkAsaasCheckoutHealth);
  const fetchFidelizeAccount = useServerFn(getMyFidelizeAccount);
  const queryClient = useQueryClient();


  React.useEffect(() => {
    if (isOpen) setOpened(false);
  }, [isOpen, paymentUrl]);

  // Sonda a página do Asaas: se estiver fora do ar (503), avisamos antes de redirecionar.
  React.useEffect(() => {
    if (!isOpen || !paymentUrl) { setCheckoutDown(false); return; }
    let active = true;
    setCheckoutDown(false);
    probeCheckout({ data: { url: paymentUrl } })
      .then((r) => { if (active) setCheckoutDown(!r.available); })
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen, paymentUrl, probeCheckout]);

  // Fidelize: confirma quando o provisionamento aparece (webhook do Asaas -> provision-account)
  React.useEffect(() => {
    if (!isOpen || productType !== 'fidelize' || (status as string) === 'confirmed') return;
    let active = true;
    const check = async () => {
      try {
        const account: any = await fetchFidelizeAccount();
        if (active && account) {
          setStatus('confirmed');
          queryClient.invalidateQueries({ queryKey: ['fidelize-account'] });
        }
      } catch {
        /* silencioso: seguimos tentando */
      }
    };
    const interval = window.setInterval(check, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [isOpen, productType, status, setStatus, fetchFidelizeAccount, queryClient]);

  // Polling: revalida as matrículas e confirma automaticamente após o webhook
  React.useEffect(() => {
    if (!isOpen || !productId || !productType || productType === 'fidelize' || (status as string) === 'confirmed') return;

    const check = async () => {
      // Avoid double confirm
      if ((status as string) === 'confirmed') return;
      
      await refetchEnrollments();
      const isEnrolled = productType === 'course'
        ? isEnrolledInCourse(productId)
        : isEnrolledInEbook(productId);
      if (isEnrolled) {
        setStatus('confirmed');
        // Limpa checkout pendente ao confirmar
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
             const { data: pending } = await supabase
               .from('pending_checkouts')
               .select('id')
               .eq('user_id', session.user.id)
               .eq('status', 'pending')
               .maybeSingle();
             
             if (pending) {
               await completeCheckout({ data: { checkoutId: pending.id } });
             }
          }
        } catch (e) {
          console.error("Erro ao completar checkout:", e);
        }
      }

    };

    const interval = window.setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [isOpen, productId, productType, status, isEnrolledInCourse, isEnrolledInEbook, setStatus, refetchEnrollments]);

  // Pagamento aprovado: dispara o evento de conversão uma única vez
  const purchaseTracked = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (status !== 'confirmed' || !productId || !productType) return;
    if (!transactionId) return; // sem o ID real do pedido Asaas não reportamos a compra
    if (purchaseTracked.current === transactionId) return;
    purchaseTracked.current = transactionId;
    gtmPurchase({
      productId,
      productType,
      productName: title,
      value: Number(value ?? 0),
      transactionId,
    });
  }, [status, productId, productType, title, value, transactionId]);

  // Redirecionamento automático após confirmação
  React.useEffect(() => {
    if (status === 'confirmed' && productId && productType) {
      const timer = setTimeout(() => {
        closePayment();
        navigate({
          to:
            productType === 'fidelize'
              ? '/app/fidelize'
              : productType === 'course'
                ? `/app/cursos/${productId}`
                : `/app/ebooks/${productId}`,
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, productId, productType, navigate, closePayment]);

  const handleOpenCheckout = () => {
    if (!paymentUrl) return;
    window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    setOpened(true);
  };

  // Verificação manual: consulta o Asaas diretamente (caso o webhook falhe)
  const handleVerifyNow = async () => {
    if (!productId || !productType) return;
    setChecking(true);
    try {
      const result = await verifyAsaasPayment({ data: { productId, productType } });
      await refetchEnrollments();
      if (result.confirmed) {
        setStatus('confirmed');
        toast.success("Pagamento confirmado! Acesso liberado.");
      } else {
        toast.info(result.message || "Ainda não localizamos a confirmação do pagamento.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível verificar o pagamento agora.");
    } finally {
      setChecking(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closePayment()}>
      <DialogContent className="max-w-lg w-[95vw] glass border-white/10">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 pr-6">
            <ShoppingBag className="h-5 w-5 text-fire shrink-0" />
            {status === 'confirmed' ? 'Pagamento confirmado' : title}
          </DialogTitle>
          <DialogDescription>
            {status === 'confirmed'
              ? (productType === 'fidelize' ? 'Sua conta Fidelize está sendo criada.' : 'Seu acesso já está liberado.')
              : 'Finalize o pagamento na página segura do Asaas. Esta janela acompanha a confirmação automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {status === 'confirmed' ? (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <div className="mb-6 rounded-full bg-green-500/10 p-6 text-green-500">
                <CheckCircle2 className="h-16 w-16" />
              </div>
              <h2 className="text-2xl font-black mb-2">Sucesso!</h2>
              <p className="text-muted-foreground max-w-sm">
                {productType === 'fidelize'
                  ? 'Pagamento confirmado! Estamos criando sua conta na Fidelize agora — os dados de acesso chegam no seu e-mail e também aparecem na sua área Fidelize.'
                  : 'Seu pagamento foi confirmado e o acesso ao conteúdo já está liberado.'}
              </p>
              <div className="mt-6 flex items-center gap-2 text-fire font-medium">
                Redirecionando você agora <ArrowRight className="h-4 w-4" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="checkout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 py-2">
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                <p className="text-sm text-muted-foreground">
                  Pix, cartão ou boleto no ambiente oficial do Asaas. Não feche esta janela: o acesso é liberado aqui
                  automaticamente após a confirmação.
                </p>
              </div>

              {checkoutDown && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <div className="text-sm">
                    <p className="font-bold text-amber-400">Asaas temporariamente indisponível</p>
                    <p className="text-muted-foreground">
                      A página de pagamento do Asaas está fora do ar neste momento (erro 503 no provedor). Seu pedido
                      ficou salvo: tente novamente em alguns minutos usando o mesmo link. Nenhuma cobrança foi feita.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleOpenCheckout}
                disabled={!paymentUrl}
                className="btn-fire w-full font-bold disabled:opacity-50"
              >
                {opened ? 'Reabrir pagamento' : 'Ir para o pagamento seguro'}
                <ExternalLink className="h-4 w-4" />
              </button>

              <button
                onClick={handleVerifyNow}
                disabled={checking}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition hover:bg-white/10 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {checking ? 'Verificando pagamento...' : 'Já paguei — verificar agora'}
              </button>

              {opened && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-fire" />
                  Aguardando confirmação do pagamento
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
