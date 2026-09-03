import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Financeiro Fidelize.
 *
 * Fonte primária:
 *   assinaturas recorrentes REAIS no Asaas.
 *
 * fidelize_provisioning_logs é histórico operacional e não pode
 * ser usado sozinho para projetar receita.
 */
export const getFidelizeRevenueSnapshot =
  createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
      const { data: isAdmin } =
        await context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: "admin",
        });

      if (!isAdmin) {
        throw new Error(
          "Acesso restrito a administradores.",
        );
      }

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const {
        getFidelizePlanRecords,
      } = await import(
        "@/lib/fidelize-plans.server"
      );

      const {
        parseExternalReference,
        getAsaasConfig,
        asaasRequest,
      } = await import("@/lib/asaas.server");

      const [
        { data: paymentRows, error: paymentError },
        { data: logRows },
        plans,
      ] = await Promise.all([
        supabaseAdmin
          .from("payments")
          .select(
            "user_id, customer_id, external_reference, created_at",
          )
          .not("customer_id", "is", null)
          .order("created_at", {
            ascending: false,
          })
          .limit(5000),

        supabaseAdmin
          .from("fidelize_provisioning_logs")
          .select(
            "user_id, plan, status, subscription_status, lifecycle_status, is_test, created_at",
          )
          .eq("status", "success")
          .order("created_at", {
            ascending: false,
          })
          .limit(5000),

        getFidelizePlanRecords(),
      ]);

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      const priceOf = (plan: string) =>
        plans.find((p) => p.plan === plan)
          ?.price ?? 0;

      /*
       * Mantém somente o último registro operacional real
       * por usuário para métricas auxiliares/fallback.
       */
      const latestByUser = new Map<
        string,
        any
      >();

      for (const row of logRows ?? []) {
        if (
          row.is_test ||
          !row.user_id ||
          latestByUser.has(row.user_id)
        ) {
          continue;
        }

        latestByUser.set(
          row.user_id,
          row,
        );
      }

      const localReal = [
        ...latestByUser.values(),
      ];

      /*
       * Descobre clientes Asaas que efetivamente tiveram
       * uma compra Fidelize.
       */
      const customerIds = Array.from(
        new Set(
          (paymentRows ?? [])
            .filter((row: any) => {
              const ref =
                parseExternalReference(
                  row.external_reference,
                );

              return (
                ref?.productType ===
                "fidelize"
              );
            })
            .map(
              (row: any) =>
                row.customer_id,
            )
            .filter(Boolean),
        ),
      ) as string[];

      type LiveSubscription = {
        customerId: string;
        status: string;
        value: number;
        plan: string | null;
        dateCreated: string | null;
      };

      const live: LiveSubscription[] = [];
      let asaasErrors = 0;

      try {
        const config =
          await getAsaasConfig();

        for (
          const customerId
          of customerIds
        ) {
          try {
            const result =
              await asaasRequest(
                config,
                `/subscriptions?customer=${encodeURIComponent(
                  customerId,
                )}&limit=100`,
                "GET",
              );

            for (
              const sub
              of result?.data ?? []
            ) {
              const ref =
                parseExternalReference(
                  sub?.externalReference,
                );

              const isFidelize =
                ref?.productType ===
                  "fidelize" ||
                /fidelize/i.test(
                  String(
                    sub?.description ??
                      "",
                  ),
                );

              if (!isFidelize) {
                continue;
              }

              live.push({
                customerId,
                status: String(
                  sub?.status ??
                    "UNKNOWN",
                ).toUpperCase(),
                value: Number(
                  sub?.value ?? 0,
                ),
                plan:
                  ref?.productId ??
                  null,
                dateCreated:
                  sub?.dateCreated ??
                  sub?.createdAt ??
                  null,
              });
            }
          } catch {
            asaasErrors++;
          }
        }
      } catch {
        asaasErrors =
          customerIds.length || 1;
      }

      /*
       * Se QUALQUER consulta de assinatura falhar,
       * preferimos fallback local explicitamente marcado
       * em vez de mostrar uma projeção parcial como se fosse real.
       */
      const asaasReliable =
        asaasErrors === 0;

      const inactiveStatuses =
        new Set([
          "INACTIVE",
          "CANCELLED",
          "CANCELED",
          "EXPIRED",
        ]);

      if (asaasReliable) {
        const activeSubscriptions =
          live.filter(
            (sub) =>
              !inactiveStatuses.has(
                sub.status,
              ),
          );

        const activeCustomers =
          new Set(
            activeSubscriptions.map(
              (sub) =>
                sub.customerId,
            ),
          );

        const byPlan = plans.map(
          (plan) => {
            const rows =
              activeSubscriptions.filter(
                (sub) =>
                  sub.plan ===
                  plan.plan,
              );

            const customers =
              new Set(
                rows.map(
                  (row) =>
                    row.customerId,
                ),
              );

            const monthly =
              rows.reduce(
                (sum, row) =>
                  sum +
                  Number(
                    row.value || 0,
                  ),
                0,
              );

            return {
              plan: plan.plan,
              label: plan.label,
              price: plan.price,
              activeCount:
                customers.size,
              monthly,
            };
          },
        );

        const monthlyProjection =
          activeSubscriptions.reduce(
            (sum, sub) =>
              sum +
              Number(
                sub.value || 0,
              ),
            0,
          );

        const startOfMonth =
          new Date();

        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(
          0,
          0,
          0,
          0,
        );

        const newCustomers =
          new Set(
            activeSubscriptions
              .filter((sub) => {
                if (
                  !sub.dateCreated
                ) {
                  return false;
                }

                return (
                  new Date(
                    sub.dateCreated,
                  ) >= startOfMonth
                );
              })
              .map(
                (sub) =>
                  sub.customerId,
              ),
          );

        const inactiveCustomers =
          new Set(
            live
              .filter((sub) =>
                inactiveStatuses.has(
                  sub.status,
                ),
              )
              .map(
                (sub) =>
                  sub.customerId,
              )
              .filter(
                (customerId) =>
                  !activeCustomers.has(
                    customerId,
                  ),
              ),
          );

        /*
         * Atraso continua vindo do lifecycle/webhook local.
         * Projeção/ativos, porém, vêm do Asaas.
         */
        const overdue =
          localReal.filter(
            (row: any) =>
              row.subscription_status ===
                "overdue" &&
              row.lifecycle_status !==
                "canceled",
          );

        const overdueValue =
          overdue.reduce(
            (sum, row: any) =>
              sum +
              priceOf(
                String(row.plan),
              ),
            0,
          );

        return {
          totalCustomers:
            activeCustomers.size +
            inactiveCustomers.size,
          activeCustomers:
            activeCustomers.size,
          overdueCustomers:
            overdue.length,
          canceledCustomers:
            inactiveCustomers.size,
          newThisMonth:
            newCustomers.size,
          monthlyProjection,
          overdueValue,
          averageTicket:
            activeCustomers.size
              ? monthlyProjection /
                activeCustomers.size
              : 0,
          byPlan,
          source: "asaas" as const,
          warning: null as
            | string
            | null,
        };
      }

      /*
       * Fallback:
       * nunca presume mais que status NULL = active.
       * Apenas status explicitamente ativo entra na projeção.
       */
      const active =
        localReal.filter(
          (row: any) =>
            row.subscription_status ===
              "active" &&
            row.lifecycle_status !==
              "canceled",
        );

      const overdue =
        localReal.filter(
          (row: any) =>
            row.subscription_status ===
              "overdue",
        );

      const canceled =
        localReal.filter(
          (row: any) =>
            row.subscription_status ===
              "canceled" ||
            row.lifecycle_status ===
              "canceled",
        );

      const byPlan = plans.map(
        (plan) => {
          const activeCount =
            active.filter(
              (row: any) =>
                row.plan ===
                plan.plan,
            ).length;

          return {
            plan: plan.plan,
            label: plan.label,
            price: plan.price,
            activeCount,
            monthly:
              activeCount *
              plan.price,
          };
        },
      );

      const monthlyProjection =
        byPlan.reduce(
          (sum, plan) =>
            sum + plan.monthly,
          0,
        );

      const overdueValue =
        overdue.reduce(
          (sum, row: any) =>
            sum +
            priceOf(
              String(row.plan),
            ),
          0,
        );

      const startOfMonth =
        new Date();

      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(
        0,
        0,
        0,
        0,
      );

      const newThisMonth =
        localReal.filter(
          (row: any) =>
            new Date(
              row.created_at,
            ) >= startOfMonth,
        ).length;

      return {
        totalCustomers:
          localReal.length,
        activeCustomers:
          active.length,
        overdueCustomers:
          overdue.length,
        canceledCustomers:
          canceled.length,
        newThisMonth,
        monthlyProjection,
        overdueValue,
        averageTicket:
          active.length
            ? monthlyProjection /
              active.length
            : 0,
        byPlan,
        source:
          "local_fallback" as const,
        warning:
          "Não foi possível consultar todas as recorrências no Asaas. Exibindo o último estado local conhecido.",
      };
    });
