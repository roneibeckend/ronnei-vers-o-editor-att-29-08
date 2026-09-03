import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  asaasHeaders,
  getAsaasConfig,
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

          // 1. Envelope Validation
          //
          // Nem todo evento legítimo do Asaas possui payment.id
          // (ex.: eventos de assinatura). Validamos aqui apenas
          // o envelope comum; payment.id passa a ser obrigatório
          // somente para eventos que realmente processam pagamento.
          if (!body || typeof body.event !== "string") {
            console.error(
              "[Webhook Asaas] Invalid envelope: missing event",
            );

            return new Response(
              "Requisição inválida",
              { status: 400 },
            );
          }

          eventId = body.id
            ? String(body.id)
            : null;

          const paymentId = body.payment?.id
            ? String(body.payment.id)
            : null;

          const eventType = String(
            body.event,
          );

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

          // Comparação em tempo constante para evitar ataques de temporização
          const a = new TextEncoder().encode(String(token ?? ''));
          const b = new TextEncoder().encode(String(expectedToken ?? ''));
          let diff = a.length ^ b.length;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
          }
          // Requisição "verificada" = token confere. Sem token válido seguimos apenas
          // com eventos de confirmação, que são re-checados direto na API do Asaas
          // (server-to-server), impossibilitando liberação por payload falso.
          const verifiedRequest = Boolean(expectedToken) && diff === 0;
          if (!verifiedRequest) {
            console.warn('[Webhook Asaas] Requisição sem token válido: apenas eventos verificáveis serão processados.');
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

          // 3b. Sinais negativos da assinatura recorrente (refletem o status na área do aluno).
          const negativeEvents: Record<string, 'overdue' | 'canceled'> = {
            PAYMENT_OVERDUE: 'overdue',
            PAYMENT_DELETED: 'canceled',
            PAYMENT_REFUNDED: 'canceled',
            PAYMENT_REVERSED: 'canceled',
            PAYMENT_CHARGEBACK_REQUESTED: 'canceled',
            SUBSCRIPTION_DELETED: 'canceled',
            SUBSCRIPTION_INACTIVATED: 'canceled',
          };

          if (verifiedRequest && negativeEvents[eventType]) {
            try {
              await syncFidelizeSubscriptionSignal(body.payment ?? body.subscription, negativeEvents[eventType]!);
            } catch (signalError) {
              console.error('[Webhook Asaas] Falha ao sincronizar assinatura Fidelize:', signalError);
            }
          }

          // Estorno/chargeback: invalida créditos de consultoria ainda não usados.
          const creditVoidEvents = ['PAYMENT_REFUNDED', 'PAYMENT_REVERSED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_DELETED'];
          if (verifiedRequest && creditVoidEvents.includes(eventType) && paymentId) {
            try {
              const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
              await supabaseAdmin
                .from('consultation_credits')
                .update({ status: 'refunded' } as never)
                .eq('payment_id', paymentId)
                .eq('status', 'available');
            } catch (creditError) {
              console.error('[Webhook Asaas] Falha ao invalidar crédito de consultoria:', creditError);
            }
          }


          if (
            verifiedRequest &&
            invoiceEvents[eventType]
          ) {
            if (
              !eventId ||
              !paymentId ||
              !body.payment
            ) {
              console.warn(
                `[Webhook Asaas] ${eventType} sem dados suficientes para e-mail de fatura.`,
              );

              return new Response(
                JSON.stringify({
                  received: true,
                  event: eventType,
                  ignored: true,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              );
            }

            try {
              await sendInvoiceEmail(
                invoiceEvents[eventType]!,
                eventId,
                body.payment,
              );
            } catch (invoiceError) {
              console.error(
                "[Webhook Asaas] Falha no e-mail de fatura:",
                invoiceError,
              );
            }

            return new Response(
              JSON.stringify({
                received: true,
                event: eventType,
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json",
                },
              },
            );
          }

          if (!confirmEvents.includes(eventType)) {
             return new Response(JSON.stringify({ received: true, event: eventType }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
             });
          }

          /*
           * Eventos de confirmação precisam obrigatoriamente
           * de eventId + paymentId.
           */
          if (!eventId || !paymentId) {
            console.error(
              `[Webhook Asaas] Evento de confirmação ${eventType} sem id/payment.id`,
            );

            return new Response(
              "Evento de confirmação inválido",
              { status: 400 },
            );
          }

          /*
           * 4. CLAIM PRIMEIRO.
           *
           * A partir daqui o evento já possui rastro durável
           * antes de qualquer segunda leitura da API do Asaas.
           */
          const {
            data: earlyClaim,
            error: earlyClaimError,
          } = await supabaseAdmin.rpc(
            "acquire_asaas_webhook_claim",
            {
              p_event_id: eventId,
              p_payment_id: paymentId,
              p_event_type: eventType,
              p_payload: body,
            },
          ) as {
            data: any;
            error: any;
          };

          if (
            earlyClaimError ||
            !earlyClaim ||
            !earlyClaim[0]?.claim_token
          ) {
            const { data: currentEvent } =
              await supabaseAdmin
                .from("asaas_webhook_events")
                .select("status")
                .eq("event_id", eventId)
                .maybeSingle();

            if (
              currentEvent?.status ===
              "completed"
            ) {
              return new Response(
                JSON.stringify({
                  received: true,
                  message:
                    "Already processed",
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              );
            }

            console.warn(
              `[Webhook Asaas] Evento ${eventId} já está sendo processado ou não pôde ser adquirido.`,
              earlyClaimError,
            );

            return new Response(
              JSON.stringify({
                received: true,
                message: "Claim denied",
              }),
              {
                status: 202,
                headers: {
                  "Content-Type":
                    "application/json",
                },
              },
            );
          }

          claimToken = earlyClaim[0].claim_token as string;

          /*
           * 5. Confirmação server-to-server.
           * Agora uma inconsistência temporária não
           * consegue mais apagar o evento.
           */
          console.log(
            `[Webhook Asaas] Verificando pagamento ${paymentId} via API...`,
          );

          const verifiedPayment =
            await fetchPaymentFromAsaas(
              paymentId,
            );

          // 6. Validate Verified Payment Status
          const validStatuses = [
            "RECEIVED",
            "CONFIRMED",
            "RECEIVED_IN_CASH",
          ];

          if (
            !validStatuses.includes(
              verifiedPayment.status,
            )
          ) {
            const message =
              `Pagamento ainda não confirmado no Asaas: ${verifiedPayment.status}`;

            console.warn(
              `[Webhook Asaas] ${paymentId}: ${message}`,
            );

            /*
             * Mantemos o evento como FAILED/reprocessável.
             * O RPC consegue readquirir eventos que não
             * terminaram como completed.
             */
            await supabaseAdmin
              .from("asaas_webhook_events")
              .update({
                status: "failed",
                processed_at:
                  new Date().toISOString(),
                last_error: message,
              })
              .eq("event_id", eventId)
              .eq(
                "claim_token",
                claimToken as string,
              )
              .eq("status", "processing");

            /*
             * Não respondemos 200 para uma confirmação
             * que ainda não conseguimos concluir.
             */
            return new Response(
              JSON.stringify({
                received: false,
                retry: true,
                message,
              }),
              {
                status: 503,
                headers: {
                  "Content-Type":
                    "application/json",
                },
              },
            );
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

          // Claim já adquirido antes da verificação do status.

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

          // TAXA DE REMARCAÇÃO: aplica o novo horário guardado na reserva.
          if (productType === 'consultation_fee') {
            const { applyPaidReschedule } = await import('@/lib/consultation-attendance.server');
            const consultationId = (parsed as any).consultationId as string | null;
            if (!consultationId) {
              throw new Error('Referência da consultoria ausente na taxa de remarcação.');
            }
            const feeResult = await applyPaidReschedule(consultationId, paymentId);
            return Response.json({
              received: true,
              processed: feeResult.ok,
              type: 'consultation_fee',
            });
          }

          // CONSULTORIA: confirma a reserva, cria Calendar/Meet e envia o e-mail.

          if (productType === 'consultation') {
            const { confirmConsultationPayment } = await import('@/lib/consultations.server');
            const consultationId = (parsed as any).consultationId as string | null;

            if (!consultationId) {
              throw new Error('Referência da consultoria ausente no pagamento.');
            }

            const result = await confirmConsultationPayment({
              consultationId,
              paymentId,
              amount,
              userId,
            });

            await supabaseAdmin
              .from('asaas_webhook_events')
              .update({
                status: result.ok ? 'completed' : 'failed',
                processed_at: new Date().toISOString(),
                last_error: result.ok ? null : (result as any).error ?? 'Falha ao confirmar consultoria',
              })
              .eq('event_id', eventId as string)
              .eq('claim_token', claimToken as string)
              .eq('status', 'processing');

            if (!result.ok) {
              await logSystemError(
                'webhook_asaas',
                'Falha ao confirmar consultoria paga',
                new Error(String((result as any).error ?? 'erro desconhecido')),
                { eventId, paymentId, consultationId, userId },
              );
            }

            try {
              const { notifyAdmin, formatMoney } = await import('@/lib/admin-notify.server');
              await notifyAdmin({
                type: 'sale',
                severity: result.ok ? 'success' : 'warning',
                title: `🗓️ Consultoria paga — ${formatMoney(amount)}`,
                body: result.ok
                  ? 'Reserva confirmada e reunião criada no Google.'
                  : `Pagamento recebido, mas a confirmação falhou: ${(result as any).error}`,
                entityType: 'consultation',
                entityId: consultationId,
                link: '/admin/consultorias',
                dedupKey: `consultation-sale:${paymentId}`,
                metadata: { consultationId, paymentId, amount },
              });
            } catch (notifyErr) {
              console.warn('[Webhook Asaas] Falha ao notificar consultoria:', notifyErr);
            }

            return Response.json({ received: true, processed: result.ok, type: 'consultation' });
          }

          // FIDELIZE: provisiona automaticamente a conta do aluno no sistema Fidelize.
          if (productType === 'fidelize') {
            const { provisionFidelizeAccount } = await import('@/lib/fidelize-provisioning.server');
            const { isFidelizePlan, fidelizePlanLabel } = await import('@/lib/fidelize-plans');

            const plan = productId;
            if (!isFidelizePlan(plan)) {
              throw new Error(`Plano Fidelize inválido na referência do Asaas: ${plan}`);
            }

            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('name, email, phone')
              .eq('id', userId)
              .maybeSingle();

            const email = (profile as any)?.email || verifiedPayment.customerEmail;
            if (!email) {
              throw new Error('E-mail do aluno não encontrado para provisionar a Fidelize.');
            }

            // RENOVAÇÃO MENSAL: se a conta já existe, não reprovisiona — apenas
            // renova o acesso e atualiza o status da assinatura do aluno.
            const { applyFidelizeRecurringPayment } = await import('@/lib/fidelize-subscription.server');
            const renewal = await applyFidelizeRecurringPayment({
              userId,
              paymentId,
              plan,
              dueDate: verifiedPayment.dueDate ?? null,
              subscriptionId: verifiedPayment.subscription ?? null,
            });

            if (renewal.renewal) {
              await supabaseAdmin
                .from('asaas_webhook_events')
                .update({
                  status: 'completed',
                  processed_at: new Date().toISOString(),
                  last_error: null,
                })
                .eq('event_id', eventId as string)
                .eq('claim_token', claimToken as string)
                .eq('status', 'processing');

              return Response.json({ received: true, processed: true, type: 'fidelize', renewal: true });
            }

            const result = await provisionFidelizeAccount({
              orderId: paymentId,
              userId,
              plan,
              name: (profile as any)?.name || 'Cliente',
              email,
              phone: (profile as any)?.phone || null,
            });

            await supabaseAdmin
              .from('asaas_webhook_events')
              .update({
                status: result.success ? 'completed' : 'failed',
                processed_at: new Date().toISOString(),
                last_error: result.success ? null : result.error ?? 'Falha no provisionamento da Fidelize',
              })
              .eq('event_id', eventId as string)
              .eq('claim_token', claimToken as string)
              .eq('status', 'processing');

            try {
              const { notifyAdmin, formatMoney } = await import('@/lib/admin-notify.server');
              await notifyAdmin({
                type: 'sale',
                severity: result.success ? 'success' : 'warning',
                title: `🏷️ ${fidelizePlanLabel(plan)} — ${formatMoney(amount)}`,
                body: result.success
                  ? `Conta provisionada automaticamente para ${email}.`
                  : `Pagamento aprovado, mas o provisionamento falhou: ${result.error}`,
                entityType: 'payment',
                entityId: paymentId,
                link: '/admin/integracoes',
                dedupKey: `fidelize-sale:${paymentId}`,
                metadata: { plan, userId, paymentId, amount },
              });
            } catch (notifyErr) {
              console.warn('[Webhook Asaas] Falha ao notificar venda Fidelize:', notifyErr);
            }

            if (!result.success) {
              await logSystemError(
                'webhook_asaas',
                'Falha ao provisionar conta Fidelize',
                new Error(String(result.error ?? 'erro desconhecido')),
                { eventId, paymentId, plan, userId },
              );
            }

            return Response.json({ received: true, processed: result.success, type: 'fidelize' });
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
            .select('id, title')
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

          /*
           * 8. FINALIZAÇÃO CENTRAL — CURSO / E-BOOK
           *
           * O webhook deixa de possuir sua própria implementação de:
           * - grantAccess;
           * - Push de venda;
           * - e-mail de acesso;
           * - e-mail de pagamento.
           *
           * Webhook e polling passam a compartilhar o mesmo pipeline.
           */
          const {
            getAuthoritativeCheckoutProducts,
          } = await import(
            "@/lib/checkout-payment-snapshot.server"
          );

          const authoritativeProducts =
            await getAuthoritativeCheckoutProducts(
              paymentId,
              userId,
              parsed,
            );

          /*
           * Esta branch do webhook é a branch padrão de
           * curso/e-book. Produtos especializados continuam
           * com seus fluxos próprios.
           */
          const standardProducts =
            authoritativeProducts.filter(
              (item) =>
                item.productType === "course" ||
                item.productType === "ebook",
            );

          /*
           * Garantia adicional para cobranças antigas:
           * o produto principal validado no banco nunca pode
           * desaparecer da finalização.
           */
          if (
            !standardProducts.some(
              (item) =>
                item.productType === productType &&
                item.productId === productId,
            )
          ) {
            standardProducts.unshift({
              productType:
                productType as "course" | "ebook",
              productId,
              title:
                (existingProduct as any)?.title ||
                undefined,
              value: amount,
            });
          }

          if (standardProducts.length === 0) {
            throw new Error(
              "Pagamento confirmado sem produto padrão recuperável.",
            );
          }

          /*
           * Se existir algum item especializado no mesmo pedido,
           * não inventamos provisionamento aqui. O fluxo especializado
           * continua responsável por ele, mas a venda padrão não fica
           * sem acesso/notificação/e-mail.
           */
          const specializedProducts =
            authoritativeProducts.filter(
              (item) =>
                item.productType !== "course" &&
                item.productType !== "ebook",
            );

          if (specializedProducts.length > 0) {
            console.warn(
              `[Webhook Asaas] Pedido ${paymentId} contém ${specializedProducts.length} item(ns) especializado(s); mantendo fluxo especializado.`,
            );
          }

          const {
            finalizeStandardPaidSale,
          } = await import(
            "@/lib/sale-finalization.server"
          );

          const finalized =
            await finalizeStandardPaidSale({
              payment: verifiedPayment,
              userId,
              products: standardProducts,
              source: "webhook",
            });

          if (!finalized.ok) {
            throw new Error(
              "Venda confirmada, porém o pipeline central não concluiu.",
            );
          }

          console.log(
            `[Webhook Asaas] Venda padrão finalizada: ${paymentId} -> ${userId}`,
          );

          /*
           * 9. AFILIADO
           *
           * Comissão NÃO depende mais de customerEmail.
           * O vínculo comercial nasce da referência da cobrança.
           */
          if (affiliateCode) {
            try {
              const brl = (value: number) =>
                new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(value || 0);

              const { data: link } = await supabaseAdmin
                .from("affiliate_links")
                .select("affiliate_id")
                .eq("code", affiliateCode)
                .maybeSingle();

              const affiliateId = (link as any)?.affiliate_id || affiliateCode;
              const { data: affiliate } = await supabaseAdmin
                .from("affiliates")
                .select("id, commission_rate, referrer_id, status")
                .eq("id", affiliateId)
                .eq("status", "active")
                .maybeSingle();

              if (affiliate?.id) {
                const { data: affProfile } = await supabaseAdmin
                  .from("profiles")
                  .select("name, email, email_notifications_opt_in")
                  .eq("id", (affiliate as any).id)
                  .maybeSingle();

                const { data: affiliateSettings } = await (
                  supabaseAdmin as any
                )
                  .from("affiliate_settings")
                  .select("direct_commission_rate, second_level_commission_rate")
                  .eq("id", "00000000-0000-0000-0000-000000000000")
                  .maybeSingle();

                let rate = Number(
                  affiliateSettings?.direct_commission_rate ??
                    (affiliate as any).commission_rate ??
                    30,
                );
                const secondLevelRate = Number(
                  affiliateSettings?.second_level_commission_rate ?? 5,
                );

                if (productType === "course") {
                  const { data: custom } = await supabaseAdmin
                    .from("affiliate_custom_commissions")
                    .select("commission_rate")
                    .eq("affiliate_id", (affiliate as any).id)
                    .filter("course_id", "eq", productId)
                    .maybeSingle();
                  if (custom) rate = Number((custom as any).commission_rate);
                }

                const commission = amount * (rate / 100);
                const saleMetadata = {
                  payment_id: paymentId,
                  product_type: productType,
                  product_id: productId,
                  product_name: (existingProduct as any)?.title || null,
                  affiliate_code: affiliateCode,
                  commission_rate: rate,
                  commission_level: 1,
                };

                const { data: directCreated, error: directError } = await (
                  supabaseAdmin as any
                ).rpc("record_affiliate_commission", {
                  p_affiliate_id: (affiliate as any).id,
                  p_course_id: productType === "course" ? productId : null,
                  p_amount: amount,
                  p_commission: commission,
                  p_metadata: saleMetadata,
                });

                if (directError) {
                  console.error(
                    "[Webhook Asaas] Falha ao creditar comissão direta:",
                    directError.message,
                  );
                } else if (directCreated) {
                  try {
                    const { notifyAdmin, formatMoney } = await import(
                      "@/lib/admin-notify.server"
                    );
                    await notifyAdmin({
                      type: "affiliate",
                      severity: "info",
                      title: `🤝 Comissão de afiliado — ${formatMoney(commission)}`,
                      body:
                        `${(affProfile as any)?.name || "Parceiro"} vendeu ` +
                        `${(existingProduct as any)?.title || "produto"} ` +
                        `(${formatMoney(amount)})`,
                      entityType: "affiliate",
                      entityId: String((affiliate as any).id),
                      link: "/admin/afiliados",
                      dedupKey: `affiliate-sale:${paymentId}`,
                      metadata: {
                        affiliateCode,
                        commission,
                        amount,
                        paymentId,
                      },
                    });
                  } catch (notifyErr) {
                    console.warn(
                      "[Webhook Asaas] Falha ao notificar comissão:",
                      notifyErr,
                    );
                  }

                  if (
                    affProfile?.email &&
                    (affProfile as any).email_notifications_opt_in !== false
                  ) {
                    try {
                      const { triggerEmailOnce } = await import(
                        "@/lib/resend.server"
                      );
                      await triggerEmailOnce({
                        event: "affiliate_commission",
                        to: affProfile.email,
                        data: {
                          name: (affProfile as any).name || "Parceiro",
                          commission: brl(commission),
                          amount: brl(amount),
                          product_name:
                            (existingProduct as any)?.title || "Produto",
                          date: new Date().toLocaleDateString("pt-BR"),
                          link: "https://ronneinaveia.com.br/app/afiliados",
                        },
                        idempotencyKey: `commission_${paymentId}`,
                      });
                    } catch (commissionEmailError) {
                      console.warn(
                        "[Webhook Asaas] E-mail de comissão ficou pendente:",
                        commissionEmailError,
                      );
                    }
                  }
                }

                const referrerId = (affiliate as any).referrer_id as
                  | string
                  | null;
                if (referrerId && secondLevelRate > 0) {
                  const { data: referrer } = await supabaseAdmin
                    .from("affiliates")
                    .select("id")
                    .eq("id", referrerId)
                    .eq("status", "active")
                    .maybeSingle();

                  if (referrer?.id) {
                    const secondLevelCommission =
                      amount * (secondLevelRate / 100);
                    const { data: sponsorCreated, error: sponsorError } = await (
                      supabaseAdmin as any
                    ).rpc("record_affiliate_commission", {
                      p_affiliate_id: referrer.id,
                      p_course_id: productType === "course" ? productId : null,
                      p_amount: amount,
                      p_commission: secondLevelCommission,
                      p_metadata: {
                        ...saleMetadata,
                        referred_affiliate_id: (affiliate as any).id,
                        commission_rate: secondLevelRate,
                        commission_level: 2,
                      },
                    });

                    if (sponsorError) {
                      console.error(
                        "[Webhook Asaas] Falha ao creditar comissão de 2º nível:",
                        sponsorError.message,
                      );
                    } else if (sponsorCreated) {
                      console.log(
                        `[Webhook Asaas] Comissão de 2º nível registrada: ${paymentId} -> ${referrer.id}`,
                      );
                    }
                  }
                }
              }
            } catch (commissionError) {
              console.error(
                "[Webhook Asaas] Falha no processamento da comissão:",
                commissionError,
              );
            }
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
 * Reflete na área do aluno os sinais negativos da assinatura recorrente Fidelize
 * (fatura vencida, cobrança cancelada/estornada, assinatura removida no Asaas).
 */
async function syncFidelizeSubscriptionSignal(payment: any, status: 'overdue' | 'canceled') {
  if (!payment) return;
  const parsed = parseExternalReference(payment?.externalReference);
  if (parsed?.productType !== 'fidelize') return;

  let userId = parsed.userId as string | null;
  if (!userId) {
    const { apiKey, baseUrl } = await getAsaasConfig();
    userId = await resolveUserFromPayment(payment, baseUrl, apiKey);
  }
  if (!userId) return;

  const { applyFidelizeSubscriptionSignal } = await import('@/lib/fidelize-subscription.server');
  await applyFidelizeSubscriptionSignal({ userId, status, paymentId: payment?.id ?? null });
}

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
