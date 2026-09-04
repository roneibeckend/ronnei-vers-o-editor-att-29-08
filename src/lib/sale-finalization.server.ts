import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  grantAccess,
  parseExternalReference,
} from "@/lib/asaas.server";
import {
  notifyAdmin,
  formatMoney,
} from "@/lib/admin-notify.server";
import { triggerEmailOnce } from "@/lib/resend.server";
import type {
  CheckoutSnapshotProduct,
} from "@/lib/checkout-payment-snapshot.server";

const db: any = supabaseAdmin;

const PAID_STATUSES = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
]);

async function hasAccess(
  productType: "course" | "ebook",
  productId: string,
  userId: string,
) {
  const table =
    productType === "course"
      ? "course_enrollments"
      : "ebook_enrollments";

  const column =
    productType === "course"
      ? "course_id"
      : "ebook_id";

  const { data } = await db
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .eq(column, productId)
    .maybeSingle();

  return Boolean(data);
}

async function getTitle(
  product: CheckoutSnapshotProduct,
) {
  if (product.title) return product.title;

  const table =
    product.productType === "course"
      ? "courses"
      : "ebooks";

  const { data } = await db
    .from(table)
    .select("title")
    .eq("id", product.productId)
    .maybeSingle();

  return (
    data?.title ||
    (product.productType === "course"
      ? "Treinamento"
      : "E-book")
  );
}

function paymentMethodLabel(value: unknown) {
  switch (String(value || "")) {
    case "PIX":
      return "PIX";
    case "BOLETO":
      return "Boleto";
    case "CREDIT_CARD":
      return "Cartão de crédito";
    default:
      return String(value || "Pagamento");
  }
}

/**
 * Pipeline central para vendas de curso/e-book.
 *
 * Só retorna sucesso depois de:
 * 1. confirmar status pago;
 * 2. garantir todas as matrículas;
 * 3. verificar as matrículas no banco;
 * 4. registrar/atualizar o pagamento;
 * 5. criar a notificação administrativa;
 * 6. tentar o e-mail transacional.
 *
 * Push/e-mail não podem remover a matrícula já concedida.
 */
export async function finalizeStandardPaidSale(input: {
  payment: any;
  userId: string;
  products: CheckoutSnapshotProduct[];
  source:
    | "checkout"
    | "polling"
    | "webhook"
    | "reconciliation"
    | "manual";
}) {
  const paymentId = String(
    input.payment?.id || "",
  );

  if (!paymentId) {
    throw new Error(
      "Pagamento confirmado sem identificador.",
    );
  }

  const status = String(
    input.payment?.status || "",
  );

  if (!PAID_STATUSES.has(status)) {
    throw new Error(
      `Pagamento ainda não confirmado: ${status || "UNKNOWN"}`,
    );
  }

  const parsed = parseExternalReference(
    input.payment?.externalReference,
  );

  // Se a referência moderna possui userId,
  // ela obrigatoriamente precisa coincidir.
  if (
    parsed?.userId &&
    parsed.userId !== input.userId
  ) {
    throw new Error(
      "Pagamento pertence a outro usuário.",
    );
  }

  const products = input.products.filter(
    (p) =>
      p.productType === "course" ||
      p.productType === "ebook",
  );

  if (
    products.length === 0 ||
    products.length !== input.products.length
  ) {
    throw new Error(
      "Finalizador padrão recebeu tipo de produto não suportado.",
    );
  }

  // 1. Garante cada acesso de forma idempotente.
  for (const product of products) {
    const ok = await grantAccess(
      product.productType,
      product.productId,
      input.userId,
    );

    if (!ok) {
      throw new Error(
        `Falha ao liberar ${product.productType}:${product.productId}`,
      );
    }
  }

  // 2. Não confiamos apenas no retorno da função.
  // Conferimos se a matrícula realmente existe.
  for (const product of products) {
    // hasAccess cobre apenas conteúdos com matrícula (cursos/e-books).
    if (product.productType !== "course" && product.productType !== "ebook") continue;
    const verified = await hasAccess(
      product.productType,
      product.productId,
      input.userId,
    );

    if (!verified) {
      throw new Error(
        `Matrícula não encontrada após liberação: ${product.productType}:${product.productId}`,
      );
    }
  }

  // 3. Resolve títulos reais.
  const resolvedProducts = [];

  for (const product of products) {
    resolvedProducts.push({
      ...product,
      title: await getTitle(product),
    });
  }

  const amount = Number(
    input.payment?.value || 0,
  );

  const netAmount = Number(
    input.payment?.netValue ?? amount,
  );

  const fee = Math.max(
    0,
    amount - netAmount,
  );

  const now = new Date().toISOString();

  // Preserva snapshot e demais metadados já existentes.
  const { data: existingPayment } =
    await db
      .from("payments")
      .select("metadata")
      .eq("external_id", paymentId)
      .maybeSingle();

  const existingMetadata =
    existingPayment?.metadata || {};

  const productName = resolvedProducts
    .map((p) => p.title)
    .filter(Boolean)
    .join(" + ");

  const { error: paymentError } =
    await db
      .from("payments")
      .upsert(
        {
          external_id: paymentId,
          user_id: input.userId,
          amount,
          net_amount: netAmount,
          fee,
          status,
          billing_type:
            input.payment?.billingType || null,
          external_reference:
            input.payment?.externalReference ||
            null,
          customer_id:
            input.payment?.customer || null,
          confirmed_at:
            input.payment?.confirmedDate ||
            input.payment?.paymentDate ||
            now,
          updated_at: now,
          metadata: {
            ...existingMetadata,
            checkout_products:
              resolvedProducts,
            product_name: productName,
            sale_finalized_at: now,
            sale_finalized_source:
              input.source,
            access_verified: true,
          },
        },
        {
          onConflict: "external_id",
        },
      );

  if (paymentError) {
    throw new Error(
      `Falha ao registrar pagamento: ${paymentError.message}`,
    );
  }

  // 4. Finaliza também qualquer checkout
  // explicitamente vinculado ao paymentId.
  try {
    const { data: checkouts } =
      await db
        .from("pending_checkouts")
        .select("id,status,metadata")
        .eq("user_id", input.userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(30);

    const ids = (checkouts || [])
      .filter(
        (row: any) =>
          row.status !== "completed" &&
          String(
            row?.metadata?.payment_id || "",
          ) === paymentId,
      )
      .map((row: any) => row.id);

    if (ids.length > 0) {
      await db
        .from("pending_checkouts")
        .update({
          status: "completed",
        })
        .in("id", ids);
    }
  } catch (error: any) {
    console.warn(
      "[sale] Falha ao concluir checkout vinculado:",
      error?.message,
    );
  }

  const { data: profile } =
    await db
      .from("profiles")
      .select(
        "name,email,email_notifications_opt_in",
      )
      .eq("id", input.userId)
      .maybeSingle();

  // 5. Notificação administrativa idempotente.
  const dedupKey = `sale:${paymentId}`;

  const { data: existingNotification } =
    await db
      .from("admin_notifications")
      .select("id")
      .eq("dedup_key", dedupKey)
      .limit(1)
      .maybeSingle();

  let adminNotification =
    existingNotification
      ? "already_created"
      : "not_created";

  if (!existingNotification) {
    try {
      const result = await notifyAdmin({
        type: "sale",
        severity: "success",
        title:
          `💰 Venda aprovada — ${formatMoney(amount)}`,
        body:
          `${productName || "Produto"} · ` +
          `${profile?.name || profile?.email || "Cliente"}`,
        entityType: "payment",
        entityId: paymentId,
        link: "/admin/financeiro",
        dedupKey,
        metadata: {
          paymentId,
          userId: input.userId,
          products: resolvedProducts,
          source: input.source,
        },
      });

      adminNotification =
        (result as any)?.created
          ? "created"
          : "not_created";
    } catch (error: any) {
      adminNotification = "failed";

      console.error(
        "[sale] Falha na notificação administrativa:",
        error?.message,
      );
    }
  }

  // 6. Um único e-mail pós-compra.
  // Se o Resend estiver sem quota,
  // triggerEmailOnce/triggerEmailEvent deixa o
  // evento disponível para recuperação.
  let customerEmail =
    "not_applicable";

  if (
    profile?.email &&
    profile.email_notifications_opt_in !== false
  ) {
    try {
      await triggerEmailOnce({
        event: "payment_approved",
        to: profile.email,
        data: {
          subject:
            "✅ Pagamento aprovado — seu acesso está liberado",
          name:
            profile.name ||
            profile.email.split("@")[0],
          product_name:
            productName ||
            "Produto Ronnei na Veia",
          amount: formatMoney(amount),
          method: paymentMethodLabel(
            input.payment?.billingType,
          ),
          date: new Date(
            input.payment?.confirmedDate ||
              input.payment?.paymentDate ||
              Date.now(),
          ).toLocaleDateString("pt-BR"),
          link:
            "https://ronneinaveia.com.br/app",
        },
        idempotencyKey:
          `payment_approved_${paymentId}`,
      });

      customerEmail = "sent";
    } catch (error: any) {
      customerEmail = "queued_or_failed";

      console.warn(
        "[sale] E-mail pós-compra pendente:",
        error?.message,
      );
    }
  }

  // Guarda também a situação operacional.
  try {
    const { data: fresh } =
      await db
        .from("payments")
        .select("metadata")
        .eq("external_id", paymentId)
        .maybeSingle();

    await db
      .from("payments")
      .update({
        metadata: {
          ...(fresh?.metadata || {}),
          sale_pipeline: {
            access: "verified",
            admin_notification:
              adminNotification,
            customer_email:
              customerEmail,
            finalized_at: now,
            source: input.source,
          },
        },
        updated_at:
          new Date().toISOString(),
      })
      .eq("external_id", paymentId);
  } catch (error: any) {
    console.warn(
      "[sale] Falha ao registrar auditoria final:",
      error?.message,
    );
  }

  return {
    ok: true as const,
    paymentId,
    products: resolvedProducts,
    adminNotification,
    customerEmail,
  };
}
