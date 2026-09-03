import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchPaymentFromAsaas,
  getAsaasConfig,
  parseExternalReference,
  resolveUserFromPayment,
} from "@/lib/asaas.server";

const db: any = supabaseAdmin;

export type CheckoutSnapshotProduct = {
  productId: string;
  productType: "course" | "ebook" | "fidelize" | "consultation";
  title?: string;
  value?: number;
};

const ALLOWED_TYPES = new Set([
  "course",
  "ebook",
  "fidelize",
  "consultation",
]);

export function normalizeCheckoutProducts(
  input: any[],
): CheckoutSnapshotProduct[] {
  const result: CheckoutSnapshotProduct[] = [];
  const seen = new Set<string>();

  for (const raw of input || []) {
    const productId = String(
      raw?.productId || raw?.id || "",
    ).trim();

    const productType = String(
      raw?.productType || raw?.type || "",
    ).trim();

    if (!productId || !ALLOWED_TYPES.has(productType)) {
      continue;
    }

    const key = `${productType}:${productId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      productId,
      productType:
        productType as CheckoutSnapshotProduct["productType"],
      title: raw?.title
        ? String(raw.title)
        : undefined,
      value: Number.isFinite(Number(raw?.value))
        ? Number(raw.value)
        : undefined,
    });
  }

  return result;
}

/**
 * Persiste o pedido completo ANTES de chamar o Asaas.
 *
 * Se esta etapa falhar, nenhuma cobrança deve ser criada.
 * Isso elimina a corrida entre criação do paymentId e webhook.
 */
export async function rememberCheckoutIntent(input: {
  userId: string;
  method: string;
  totalValue: number;
  products: CheckoutSnapshotProduct[];
  couponCode?: string | null;
}) {
  const products = normalizeCheckoutProducts(
    input.products,
  );

  if (!input.userId) {
    throw new Error(
      "Pedido sem usuário autenticado.",
    );
  }

  if (products.length === 0) {
    throw new Error(
      "Pedido sem produtos válidos.",
    );
  }

  const main = products[0];

  /*
   * pending_checkouts atualmente representa compras
   * de cursos/e-books. Os demais produtos mantêm seus
   * fluxos especializados.
   */
  if (
    main.productType !== "course" &&
    main.productType !== "ebook"
  ) {
    return {
      ok: true as const,
      skipped: true as const,
      checkoutId: null,
    };
  }

  const now = new Date().toISOString();

  const metadata = {
    checkout_products: products,
    checkout_total: Number(
      input.totalValue || 0,
    ),
    checkout_method: input.method,
    checkout_coupon:
      input.couponCode || null,
    checkout_intent_recorded_at: now,
  };

  const { data: rows, error } = await db
    .from("pending_checkouts")
    .select(
      "id,metadata,product_id,product_type,status,created_at",
    )
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .order("created_at", {
      ascending: false,
    })
    .limit(20);

  if (error) {
    throw new Error(
      `Falha ao preparar pedido: ${error.message}`,
    );
  }

  const existing = (rows || []).find(
    (row: any) =>
      String(row.product_id) ===
        main.productId &&
      String(row.product_type) ===
        main.productType,
  );

  if (existing) {
    const { error: updateError } = await db
      .from("pending_checkouts")
      .update({
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(
        `Falha ao salvar pedido antes da cobrança: ${updateError.message}`,
      );
    }

    return {
      ok: true as const,
      skipped: false as const,
      checkoutId: existing.id,
    };
  }

  /*
   * Compatibilidade com fluxos que chegaram ao
   * checkout nativo sem savePendingCheckout prévio.
   */
  const { data: created, error: insertError } =
    await db
      .from("pending_checkouts")
      .insert({
        user_id: input.userId,
        product_id: main.productId,
        product_type: main.productType,
        metadata,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

  if (insertError || !created?.id) {
    throw new Error(
      `Falha ao criar pedido antes da cobrança: ${
        insertError?.message ||
        "registro não criado"
      }`,
    );
  }

  return {
    ok: true as const,
    skipped: false as const,
    checkoutId: created.id,
  };
}


/**
 * Persiste imediatamente a relação:
 *
 * paymentId -> usuário -> todos os produtos comprados.
 *
 * O navegador deixa de ser a fonte de verdade após a criação
 * da cobrança.
 */
export async function rememberCheckoutPayment(input: {
  paymentId: string;
  userId: string;
  status: string;
  method: string;
  totalValue: number;
  products: CheckoutSnapshotProduct[];
  subscriptionId?: string | null;
  couponCode?: string | null;
}) {
  const products = normalizeCheckoutProducts(
    input.products,
  );

  if (!input.paymentId || !input.userId) {
    throw new Error(
      "Cobrança sem paymentId ou usuário.",
    );
  }

  if (products.length === 0) {
    throw new Error(
      "Cobrança sem produtos válidos.",
    );
  }

  const now = new Date().toISOString();

  const snapshot = {
    checkout_products: products,
    checkout_total: Number(input.totalValue || 0),
    checkout_method: input.method,
    checkout_subscription_id:
      input.subscriptionId || null,
    checkout_coupon:
      input.couponCode || null,
    checkout_recorded_at: now,
  };

  const { data: existing, error: existingError } =
    await db
      .from("payments")
      .select("id,user_id,status,metadata")
      .eq("external_id", input.paymentId)
      .maybeSingle();

  if (existingError) {
    throw new Error(
      `Falha ao consultar cobrança local: ${existingError.message}`,
    );
  }

  if (existing) {
    if (
      existing.user_id &&
      existing.user_id !== input.userId
    ) {
      throw new Error(
        "Cobrança já vinculada a outro usuário.",
      );
    }

    const { error } = await db
      .from("payments")
      .update({
        user_id: input.userId,
        metadata: {
          ...(existing.metadata || {}),
          ...snapshot,
        },
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Falha ao salvar produtos da cobrança: ${error.message}`,
      );
    }
  } else {
    const provisionalPaid = [
      "RECEIVED",
      "CONFIRMED",
      "RECEIVED_IN_CASH",
    ].includes(input.status);

    const { error } = await db
      .from("payments")
      .insert({
        external_id: input.paymentId,
        user_id: input.userId,
        amount: Number(input.totalValue || 0),
        net_amount: Number(input.totalValue || 0),
        fee: 0,
        status: input.status || "PENDING",
        billing_type: input.method || null,
        external_reference: null,
        customer_id: null,
        metadata: {
          ...snapshot,
          source: "checkout_created",
        },
        confirmed_at:
          provisionalPaid ? now : null,
        updated_at: now,
      });

    if (error) {
      /*
       * Pode existir uma corrida legítima:
       * webhook pode ter criado payments entre SELECT e INSERT.
       * Nesse caso não sobrescrevemos dados financeiros;
       * apenas anexamos o snapshot.
       */
      const { data: raced } = await db
        .from("payments")
        .select("id,user_id,metadata")
        .eq("external_id", input.paymentId)
        .maybeSingle();

      if (!raced) {
        throw new Error(
          `Falha ao registrar cobrança: ${error.message}`,
        );
      }

      if (
        raced.user_id &&
        raced.user_id !== input.userId
      ) {
        throw new Error(
          "Cobrança concorrente pertence a outro usuário.",
        );
      }

      const { error: updateError } = await db
        .from("payments")
        .update({
          user_id: input.userId,
          metadata: {
            ...(raced.metadata || {}),
            ...snapshot,
          },
          updated_at: now,
        })
        .eq("id", raced.id);

      if (updateError) {
        throw new Error(
          `Falha ao anexar snapshot: ${updateError.message}`,
        );
      }
    }
  }

  /*
   * Vincula também o pending_checkout ao paymentId.
   * Isso cria uma segunda trilha de recuperação.
   */
  const main = products[0];

  if (main) {
    try {
      const { data: rows } = await db
        .from("pending_checkouts")
        .select(
          "id,metadata,product_id,product_type,status,created_at",
        )
        .eq("user_id", input.userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      const pending = (rows || []).find(
        (row: any) =>
          row.status === "pending" &&
          String(row.product_id) ===
            main.productId &&
          String(row.product_type) ===
            main.productType,
      );

      if (pending) {
        await db
          .from("pending_checkouts")
          .update({
            metadata: {
              ...(pending.metadata || {}),
              payment_id: input.paymentId,
              checkout_products: products,
              checkout_total:
                Number(input.totalValue || 0),
              checkout_method: input.method,
            },
          })
          .eq("id", pending.id);
      }
    } catch (error: any) {
      console.warn(
        "[checkout-snapshot] pending_checkout:",
        error?.message,
      );
    }
  }

  return {
    ok: true as const,
    paymentId: input.paymentId,
    productCount: products.length,
  };
}

/**
 * Confirma no próprio Asaas que paymentId pertence
 * ao usuário autenticado.
 */
export async function assertCheckoutPaymentOwnership(
  paymentId: string,
  expectedUserId: string,
) {
  const payment =
    await fetchPaymentFromAsaas(paymentId);

  const parsed = parseExternalReference(
    payment.externalReference,
  );

  if (
    !parsed?.productType ||
    !parsed?.productId
  ) {
    throw new Error(
      "Pagamento sem referência válida.",
    );
  }

  let ownerId: string | null =
    parsed.userId || null;

  if (!ownerId) {
    const { apiKey, baseUrl } =
      await getAsaasConfig();

    ownerId = await resolveUserFromPayment(
      payment,
      baseUrl,
      apiKey,
    );
  }

  if (
    !ownerId ||
    ownerId !== expectedUserId
  ) {
    throw new Error(
      "Pagamento não pertence ao usuário autenticado.",
    );
  }

  return {
    payment,
    parsed,
    userId: ownerId,
  };
}

/**
 * Recupera os produtos que o servidor registrou
 * no momento da criação da cobrança.
 *
 * Só usa externalReference como fallback para
 * cobranças antigas criadas antes desta correção.
 */
export async function getAuthoritativeCheckoutProducts(
  paymentId: string,
  userId: string,
  parsed?: ReturnType<
    typeof parseExternalReference
  >,
): Promise<CheckoutSnapshotProduct[]> {
  const { data: local } = await db
    .from("payments")
    .select("metadata")
    .eq("external_id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();

  const fromPayment =
    normalizeCheckoutProducts(
      local?.metadata?.checkout_products || [],
    );

  if (fromPayment.length > 0) {
    return fromPayment;
  }

  try {
    const { data: pendingRows } = await db
      .from("pending_checkouts")
      .select("metadata,status,created_at")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      })
      .limit(30);

    /*
     * Primeiro: vínculo exato pelo paymentId.
     */
    for (const row of pendingRows || []) {
      if (
        String(
          row?.metadata?.payment_id || "",
        ) !== paymentId
      ) {
        continue;
      }

      const recovered =
        normalizeCheckoutProducts(
          row?.metadata
            ?.checkout_products || [],
        );

      if (recovered.length > 0) {
        return recovered;
      }
    }

    /*
     * Segundo: corrida saudável.
     *
     * O pedido completo já foi persistido ANTES
     * da criação da cobrança, mas o paymentId pode
     * ainda não ter sido anexado quando o webhook
     * chegar.
     *
     * savePendingCheckout expira o anterior, então
     * usamos apenas o pedido pendente recente que
     * corresponda ao produto principal assinado
     * pelo próprio externalReference do servidor.
     */
    if (
      parsed?.productType &&
      parsed?.productId
    ) {
      const cutoff =
        Date.now() - 30 * 60 * 1000;

      for (const row of pendingRows || []) {
        if (row.status !== "pending") {
          continue;
        }

        const createdAt =
          new Date(
            row.created_at || 0,
          ).getTime();

        if (
          !createdAt ||
          createdAt < cutoff
        ) {
          continue;
        }

        const boundPayment = String(
          row?.metadata?.payment_id || "",
        );

        if (
          boundPayment &&
          boundPayment !== paymentId
        ) {
          continue;
        }

        const recovered =
          normalizeCheckoutProducts(
            row?.metadata
              ?.checkout_products || [],
          );

        const main = recovered[0];

        if (
          main &&
          main.productType ===
            parsed.productType &&
          main.productId ===
            parsed.productId
        ) {
          return recovered;
        }
      }
    }
  } catch {}

  /*
   * Compatibilidade com cobranças anteriores
   * à atualização. ExternalReference é criada
   * pelo nosso próprio servidor.
   */
  if (
    parsed?.productType &&
    parsed?.productId
  ) {
    return normalizeCheckoutProducts([
      {
        productId: parsed.productId,
        productType: parsed.productType,
      },
    ]);
  }

  return [];
}
