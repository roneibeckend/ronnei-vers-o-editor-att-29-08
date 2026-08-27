import { createFileRoute } from '@tanstack/react-router';
import { triggerEmailEvent } from '@/lib/resend.server';
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  asaasHeaders,
  getAsaasConfig,
  grantAccess,
  parseExternalReference,
  resolveUserFromPayment,
  fetchPaymentFromAsaas,
} from "@/lib/asaas.server";
import { logSystemError, logSystemEvent } from "@/lib/system-log.server";

export const Route = createFileRoute('/api/public/webhooks/asaas')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let eventId: string | null = null;
        let claimToken: string | null = null;

        try {
          if (request.method !== 'POST') {
             return new Response('Método não permitido', { status: 405 });
          }

          // Use a fresh body for validation
          const body = await request.json();
          const token = request.headers.get('asaas-access-token');

          // 0. Eventos de TRANSFERÊNCIA (saídas da conta Asaas) -> livro de saídas
          if (typeof body.event === 'string' && body.event.startsWith('TRANSFER')) {
            const { validateAsaasWebhookToken, upsertTransferFromWebhook } = await import('@/lib/asaas-transfers.server');
            const valid = await validateAsaasWebhookToken(token);
            if (!valid) return new Response('Não autorizado', { status: 401 });

            if (!body.transfer?.id) {
              return new Response('Requisição inválida', { status: 400 });
            }

            await upsertTransferFromWebhook(body.transfer, body.event);
            return new Response(JSON.stringify({ received: true, event: body.event }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 1. Schema Validation
          if (!body.id || !body.event || !body.payment?.id) {
            console.error('[Webhook Asaas] Invalid schema: missing id, event or payment.id');
            return new Response('Requisição inválida', { status: 400 });
          }


          eventId = body.id as string;
          const paymentId = body.payment.id as string;
          const eventType = body.event as string;

          // 2. Webhook Token Validation
          const { data: integration, error: intError } = await supabaseAdmin
            .from('integrations')
            .select('credentials')
            .eq('category', 'asaas')
            .maybeSingle();

          if (intError || !integration) {
            console.error('[Webhook Asaas] Fail closed: Integração não encontrada ou erro:', intError);
            return new Response('Erro de configuração', { status: 500 });
          }

          const credentials = (integration.credentials || {}) as Record<string, any>;
          const expectedToken = credentials?.webhookToken;

          if (!expectedToken) {
            console.error('[Webhook Asaas] Fail closed: webhookToken não configurado.');
            return new Response('Proibido', { status: 403 });
          }

          // Comparação em tempo constante para evitar ataques de temporização
          const a = new TextEncoder().encode(String(token ?? ''));
          const b = new TextEncoder().encode(String(expectedToken));
          let diff = a.length ^ b.length;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
          }
          if (diff !== 0) {
            console.error('[Webhook Asaas] Token de acesso inválido.');
            return new Response('Não autorizado', { status: 401 });
          }


          // 3. Event Filter
          const confirmEvents = [
            'PAYMENT_RECEIVED',
            'PAYMENT_CONFIRMED',
            'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
          ];

          // 3a. Eventos de cobrança (fatura gerada / vencendo / atrasada)
          const invoiceEvents: Record<string, string> = {
            PAYMENT_CREATED: 'invoice_created',
            PAYMENT_DUEDATE_WARNING: 'invoice_due',
            PAYMENT_OVERDUE: 'invoice_overdue',
          };

          if (invoiceEvents[eventType]) {
            try {
              await sendInvoiceEmail(invoiceEvents[eventType]!, eventId as string, body.payment);
            } catch (invoiceError) {
              console.error('[Webhook Asaas] Falha no e-mail de fatura:', invoiceError);
            }
            return new Response(JSON.stringify({ received: true, event: eventType }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!confirmEvents.includes(eventType)) {
             return new Response(JSON.stringify({ received: true, event: eventType }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
             });
          }

          // 4. Server-to-Server Confirmation (BEFORE Claim to avoid trash records)
          console.log(`[Webhook Asaas] Verificando pagamento ${paymentId} via API...`);
          const verifiedPayment = await fetchPaymentFromAsaas(paymentId);

          // 5. Validate Verified Payment Status
          const validStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
          if (!validStatuses.includes(verifiedPayment.status)) {
            console.warn(`[Webhook Asaas] Pagamento ${paymentId} com status inválido para liberação: ${verifiedPayment.status}`);
            return new Response(JSON.stringify({ received: true, message: 'Payment not confirmed' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 6. Match User and Product
          const parsed = parseExternalReference(verifiedPayment.externalReference);
          if (!parsed?.productType || !parsed?.productId) {
            console.error('[Webhook Asaas] Referência externa inválida no pagamento verificado.');
            return new Response('Referência inválida', { status: 400 });
          }

          const { productType, productId, affiliateCode } = parsed;
          let userId: string | null = parsed.userId;

          if (!userId) {
            const { apiKey, baseUrl } = await getAsaasConfig();
            userId = await resolveUserFromPayment(verifiedPayment, baseUrl, apiKey);
          }

          if (!userId) {
            console.error(`[Webhook Asaas] Usuário não identificado para o pagamento ${paymentId}`);
            return new Response('Usuário não encontrado', { status: 404 });
          }

          // 7. Atomic Idempotency Claim (Postgres RPC)
          const { data: claim, error: claimError } = await supabaseAdmin.rpc('acquire_asaas_webhook_claim', {
            p_event_id: eventId as string,
            p_payment_id: paymentId as string,
            p_event_type: eventType as string,
            p_payload: body
          }) as { data: any, error: any };

          if (claimError || !claim || !claim[0]?.claim_token) {
            // Check if already completed by reading directly
            const { data: check } = await supabaseAdmin
                .from('asaas_webhook_events')
                .select('status')
                .eq('event_id', eventId)
                .maybeSingle();

            if (check?.status === 'completed') {
                return new Response(JSON.stringify({ received: true, message: 'Already processed' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            console.warn(`[Webhook Asaas] Evento ${eventId} não pôde ser adquirido (concorrência ou erro):`, claimError);
            return new Response(JSON.stringify({ received: true, message: 'Claim denied' }), {
              status: 202, 
              headers: { 'Content-Type': 'application/json' },
            });
          }

          claimToken = claim[0].claim_token as string;

          const amount = Number(verifiedPayment.value || 0);
          const netAmount = Number(verifiedPayment.netValue ?? (amount * 0.97 - 0.50));
          const fee = amount - netAmount;

          // A venda deve entrar no financeiro mesmo se um produto antigo tiver sido
          // removido depois que o link de pagamento foi criado.
          const { error: paymentError } = await supabaseAdmin.from('payments').upsert({
            external_id: paymentId,
            user_id: userId,
            amount,
            net_amount: netAmount,
            fee,
            status: verifiedPayment.status,
            billing_type: verifiedPayment.billingType,
            external_reference: verifiedPayment.externalReference,
            customer_id: verifiedPayment.customer,
            confirmed_at: verifiedPayment.confirmedDate || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'external_id' });

          if (paymentError) {
            throw new Error(`Falha ao registrar pagamento confirmado: ${paymentError.message}`);
          }

          const productTable = productType === 'course'
            ? 'courses'
            : productType === 'ebook'
              ? 'ebooks'
              : null;

          if (!productTable) {
            throw new Error(`Tipo de produto inválido na referência do Asaas: ${productType}`);
          }

          const { data: existingProduct, error: productError } = await supabaseAdmin
            .from(productTable)
            .select('id')
            .eq('id', productId)
            .maybeSingle();

          if (productError) {
            throw new Error(`Falha ao validar produto da cobrança: ${productError.message}`);
          }

          // Links antigos do Asaas podem continuar reenviando eventos depois que o
          // produto foi excluído. A venda permanece registrada, mas não tentamos
          // inserir uma matrícula que violaria a chave estrangeira.
          if (!existingProduct) {
            const message = `Pagamento confirmado para produto removido: ${productType}/${productId}. Venda registrada sem matrícula.`;
            await supabaseAdmin
              .from('asaas_webhook_events')
              .update({
                status: 'completed',
                processed_at: new Date().toISOString(),
                last_error: message,
              })
              .eq('event_id', eventId as string)
              .eq('claim_token', claimToken as string)
              .eq('status', 'processing');
            await logSystemEvent({
              level: 'warning',
              source: 'webhook_asaas',
              message,
              details: { eventId, paymentId, productType, productId, userId },
            });
            return Response.json({ received: true, processed: true, accessGranted: false });
          }

          // 8. Grant Access
          const granted = await grantAccess(productType, productId, userId);
          if (!granted) {
            throw new Error('Falha ao liberar acesso no banco de dados.');
          }

          console.log(`[Webhook Asaas] Acesso liberado: ${productType}/${productId} -> ${userId}`);

          // Central de notificações: venda aprovada em tempo real
          try {
            const { notifyAdmin, formatMoney } = await import('@/lib/admin-notify.server');
            const buyerName = verifiedPayment.customerEmail || 'Cliente';
            await notifyAdmin({
              type: 'sale',
              severity: 'success',
              title: `💰 Venda aprovada — ${formatMoney(Number(verifiedPayment.value || 0))}`,
              body: `${(existingProduct as any)?.title || productId} · ${buyerName}`,
              entityType: 'payment',
              entityId: paymentId as string,
              link: '/admin/financeiro',
              dedupKey: `sale:${paymentId}`,
              metadata: { productType, productId, userId, paymentId },
            });
          } catch (notifyErr) {
            console.warn('[Webhook Asaas] Falha ao publicar notificação de venda:', notifyErr);
          }

          // 9. Process Secondary Effects
          try {
            const customerEmail = verifiedPayment.customerEmail;
            if (customerEmail && userId) {
              const { data: profile } = await supabaseAdmin.from('profiles').select('name').eq('id', userId).maybeSingle();
              const userName = profile?.name || 'Cliente';
              const templateName = productType === 'course' ? 'course_access' : 'ebook_access';
              
              const { data: product } = await supabaseAdmin
                .from(productType === 'course' ? 'courses' : 'ebooks')
                .select('title')
                .eq('id', productId)
                .maybeSingle();

              await triggerEmailEvent({
                event: templateName,
                to: customerEmail,
                data: {
                  name: userName,
                  product_name: product?.title || (productType === 'course' ? 'Treinamento' : 'E-book'),
                  access_link: 'https://lovable.app/app'
                },
                idempotencyKey: `access_${paymentId}`
              });

              // Confirmação do pagamento (resumo da transação)
              const { triggerEmailOnce } = await import('@/lib/resend.server');
              const brl = (value: number) =>
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

              await triggerEmailOnce({
                event: 'payment_approved',
                to: customerEmail,
                data: {
                  name: userName,
                  product_name: product?.title || (productType === 'course' ? 'Treinamento' : 'E-book'),
                  amount: brl(amount),
                  method: verifiedPayment.billingType === 'PIX'
                    ? 'PIX'
                    : verifiedPayment.billingType === 'BOLETO'
                      ? 'Boleto'
                      : 'Cartão de crédito',
                  date: new Date(verifiedPayment.confirmedDate || Date.now()).toLocaleDateString('pt-BR'),
                  link: 'https://ronneinaveia.com.br/app/perfil',
                },
                idempotencyKey: `payment_approved_${paymentId}`,
              });

              // Comissão do afiliado responsável pela venda
              if (affiliateCode) {
                try {
                  const { data: link } = await supabaseAdmin
                    .from('affiliate_links')
                    .select('affiliate_id')
                    .eq('code', affiliateCode)
                    .maybeSingle();

                  const affiliateId = (link as any)?.affiliate_id || affiliateCode;

                  const { data: affiliate } = await supabaseAdmin
                    .from('affiliates')
                    .select('id, commission_rate')
                    .eq('id', affiliateId)
                    .maybeSingle();

                  if (affiliate?.id) {
                    const { data: affProfile } = await supabaseAdmin
                      .from('profiles')
                      .select('name, email, email_notifications_opt_in')
                      .eq('id', (affiliate as any).id)
                      .maybeSingle();

                    // Comissão personalizada por curso tem prioridade sobre a taxa global
                    let rate = Number((affiliate as any).commission_rate ?? 30);
                    if (productType === 'course') {
                      const { data: custom } = await supabaseAdmin
                        .from('affiliate_custom_commissions')
                        .select('commission_rate')
                        .eq('affiliate_id', (affiliate as any).id)
                        .filter('course_id', 'eq', productId)
                        .maybeSingle();
                      if (custom) rate = Number((custom as any).commission_rate);
                    }

                    const commission = amount * (rate > 1 ? rate / 100 : rate);

                    // Registra a venda e credita o saldo (idempotente por pagamento)
                    const { data: existingSale } = await supabaseAdmin
                      .from('affiliate_sales')
                      .select('id')
                      .filter('metadata->>payment_id', 'eq', paymentId)
                      .maybeSingle();

                    if (!existingSale) {
                      const { error: saleError } = await supabaseAdmin
                        .from('affiliate_sales')
                        .insert({
                          affiliate_id: (affiliate as any).id,
                          course_id: productType === 'course' ? productId : null,
                          amount,
                          commission,
                          status: 'pending',
                          metadata: {
                            payment_id: paymentId,
                            product_type: productType,
                            product_id: productId,
                            product_name: product?.title || null,
                            affiliate_code: affiliateCode,
                            commission_rate: rate,
                          },
                        } as any);

                      if (saleError) {
                        console.error('[Webhook Asaas] Falha ao registrar venda de afiliado:', saleError.message);
                      } else {
                        const { error: creditError } = await supabaseAdmin.rpc('increment_affiliate_earnings', {
                          aff_id: (affiliate as any).id,
                          amount_to_add: commission,
                        });
                        if (creditError) {
                          console.error('[Webhook Asaas] Falha ao creditar comissão:', creditError.message);
                        }
                      }
                    }

                    if (affProfile?.email && (affProfile as any).email_notifications_opt_in !== false) {
                      await triggerEmailOnce({
                        event: 'affiliate_commission',
                        to: affProfile.email,
                        data: {
                          name: (affProfile as any).name || 'Parceiro',
                          commission: brl(commission),
                          amount: brl(amount),
                          product_name: product?.title || 'Produto',
                          date: new Date().toLocaleDateString('pt-BR'),
                          link: 'https://ronneinaveia.com.br/app/afiliados',
                        },
                        idempotencyKey: `commission_${paymentId}`,
                      });
                    }
                  }
                } catch (commissionError) {
                  console.error('[Webhook Asaas] Falha no e-mail de comissão:', commissionError);
                }
              }
            }
          } catch (secondaryError) {
            console.error('[Webhook Asaas] Erro em efeitos secundários (matrícula OK):', secondaryError);
          }

          // 10. Update Gateway Fees in Financial Dashboard
          try {
            // Find the "Taxas de gateway" cost row
            const { data: costRow } = await supabaseAdmin
              .from('financial_costs')
              .select('id')
              .ilike('label', 'Taxas de gateway')
              .maybeSingle();

            // Calculate total fees for the current month to keep the dashboard accurate
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            
            const { data: feeSum } = await supabaseAdmin
              .from('payments')
              .select('fee')
              .gte('confirmed_at', startOfMonth)
              .in('status', ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

            const totalFees = feeSum?.reduce((acc, p) => acc + Number(p.fee || 0), 0) || 0;

            if (costRow) {
              await supabaseAdmin
                .from('financial_costs')
                .update({ 
                  value: totalFees,
                  updated_at: new Date().toISOString()
                })
                .eq('id', costRow.id);
            } else {
              await supabaseAdmin
                .from('financial_costs')
                .insert({
                  label: 'Taxas de gateway',
                  value: totalFees
                });
            }
          } catch (feeError) {
            console.error('[Webhook Asaas] Erro ao atualizar taxas de gateway:', feeError);
          }

          // 11. Mark as Completed (OWNER CHECK)
          const { error: completeError } = await supabaseAdmin
            .from('asaas_webhook_events')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString()
            })
            .eq('event_id', eventId as string)
            .eq('claim_token', claimToken as string)
            .eq('status', 'processing');

          if (completeError) {
            console.error('[Webhook Asaas] Falha ao completar evento (dono inválido ou expirado):', completeError);
          }

          await logSystemEvent({
            level: 'info',
            source: 'webhook_asaas',
            message: `Evento ${eventId} processado com sucesso.`,
            details: { eventId },
          });

          return new Response(JSON.stringify({ received: true, processed: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error: any) {
          console.error('[Webhook Asaas] Erro crítico:', error);
          await logSystemError('webhook_asaas', 'Erro crítico no webhook', error, { eventId });
          
          
          if (eventId && claimToken) {
            await supabaseAdmin
              .from('asaas_webhook_events')
              .update({
                status: 'failed',
                last_error: error.message
              })
              .eq('event_id', eventId as string)
              .eq('claim_token', claimToken as string)
              .eq('status', 'processing');
          }

          // Alerta crítico imediato (deduplicado por 6h) para os administradores.
          try {
            const { raiseOpsAlert } = await import('@/lib/ops-alerts.server');
            await raiseOpsAlert({
              type: 'webhook_failed',
              dedupKey: `webhook_failed:${eventId || 'sem-id'}`,
              title: 'Webhook do Asaas falhou',
              message: `O evento ${eventId || 'sem id'} não foi processado: ${error.message}`,
              details: { eventId },
            });
          } catch (alertError) {
            console.error('[Webhook Asaas] Falha ao emitir alerta:', alertError);
          }

          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});

/**
 * Envia e-mails de cobrança (fatura gerada, vencendo ou atrasada) para o aluno
 * dono do pagamento, com idempotência por evento do Asaas.
 */
async function sendInvoiceEmail(event: string, eventId: string, payment: any) {
  const email = payment?.customerEmail;
  const dueDate = payment?.dueDate;
  const invoiceUrl = payment?.invoiceUrl || payment?.bankSlipUrl || payment?.transactionReceiptUrl;
  if (!email || !dueDate || !invoiceUrl) {
    console.warn('[Webhook Asaas] Dados insuficientes para e-mail de fatura.');
    return;
  }

  const { triggerEmailOnce } = await import('@/lib/resend.server');
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email_notifications_opt_in')
    .eq('email', email)
    .maybeSingle();

  if ((profile as any)?.email_notifications_opt_in === false) return;

  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(payment?.value || 0));
  const due = new Date(`${String(dueDate).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

  const daysLate = Math.max(
    1,
    Math.floor((Date.now() - new Date(`${String(dueDate).slice(0, 10)}T12:00:00`).getTime()) / 86400000)
  );

  await triggerEmailOnce({
    event,
    to: email,
    data: {
      name: (profile as any)?.name || 'Aluno',
      amount,
      due_date: due,
      days_late: String(daysLate),
      invoice_url: invoiceUrl,
      status: payment?.status || 'Aguardando pagamento',
    },
    idempotencyKey: `${event}_${eventId}`,
  });
}
