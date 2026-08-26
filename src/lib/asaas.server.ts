// src/lib/asaas.server.ts
// supabaseAdmin is now imported dynamically in functions to avoid module cycle issues

// Hosts oficiais atuais da API do Asaas. Os domínios antigos (www.asaas.com/api/v3 e
// sandbox.asaas.com/api/v3) foram descontinuados e passaram a responder HTML de erro (503).
const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_PRODUCTION_URL = "https://api.asaas.com/v3";

/** Bases alternativas usadas como failover quando o host principal responde HTML/5xx. */
const ASAAS_FALLBACKS: Record<string, string[]> = {
  [ASAAS_PRODUCTION_URL]: ["https://www.asaas.com/api/v3"],
  [ASAAS_SANDBOX_URL]: ["https://sandbox.asaas.com/api/v3"],
  "https://www.asaas.com/api/v3": [ASAAS_PRODUCTION_URL],
  "https://sandbox.asaas.com/api/v3": [ASAAS_SANDBOX_URL],
};

/** Gera a lista de URLs a tentar (principal + failover) para um endpoint do Asaas. */
function asaasUrlCandidates(url: string): string[] {
  for (const [base, alts] of Object.entries(ASAAS_FALLBACKS)) {
    if (url.startsWith(base)) {
      const path = url.slice(base.length);
      return [url, ...alts.map((a) => `${a}${path}`)];
    }
  }
  return [url];
}


export const ASAAS_USER_AGENT = "Lovable-LMS-Platform/1.0.0 (+https://lovable.app)";

export async function getAsaasConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integration, error } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("category", "asaas")
    .eq("status", true)
    .maybeSingle();

  if (error || !integration) {
    throw new Error("Integração com Asaas não está configurada ou ativa.");
  }

  const credentials = (integration.credentials || {}) as Record<string, string>;
  const settings = (integration.settings || {}) as Record<string, any>;
  const apiKey = credentials.apiKey;

  if (!apiKey) {
    throw new Error("Chave de API do Asaas ausente nas configurações.");
  }

  const isProdKey = apiKey.startsWith("$aact_prod_");
  const isSandboxKey = apiKey.startsWith("$aact_test_");

  let isTestMode =
    settings.testMode === true || settings.testMode === "true" || settings.environment === "sandbox";

  if (isProdKey && isTestMode) {
    console.warn("[Asaas] Chave de PRODUÇÃO detectada em ambiente de TESTE. Forçando PRODUÇÃO.");
    isTestMode = false;
  } else if (isSandboxKey && !isTestMode) {
    console.warn("[Asaas] Chave de SANDBOX detectada em ambiente de PRODUÇÃO. Forçando SANDBOX.");
    isTestMode = true;
  }

  return {
    apiKey,
    baseUrl: isTestMode ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL,
    isTestMode,
  };
}

/**
 * Executa uma chamada ao Asaas de forma resiliente: nunca faz JSON.parse cego.
 * Se o Asaas responder HTML (503/502/Cloudflare/manutenção), devolve uma mensagem clara
 * em vez do erro "Unexpected token '<'".
 */
export async function asaasFetchJson(
  url: string,
  init: RequestInit,
  attempts = 2,
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  let last: { ok: boolean; status: number; json: any; text: string } | null = null;

  for (const candidate of asaasUrlCandidates(url)) {
    for (let i = 0; i < attempts; i++) {
      let res: Response;
      try {
        res = await fetch(candidate, init);
      } catch (e: any) {
        last = { ok: false, status: 0, json: null, text: e?.message || "Falha de rede" };
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        continue;
      }

      const text = await res.text().catch(() => "");
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      last = { ok: res.ok, status: res.status, json, text };

      // Resposta não-JSON (HTML de manutenção/proxy) ou 5xx/429: vale tentar novamente.
      const retryable = res.status >= 500 || res.status === 429 || json === null;
      if (!retryable) return last;
      console.warn(`[Asaas] Resposta não utilizável de ${candidate} (HTTP ${res.status}). Tentando novamente...`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }

  return last!;
}


/** Traduz uma resposta do Asaas em mensagem legível para o usuário final. */
export function asaasErrorMessage(result: { status: number; json: any; text: string }) {
  const apiMessage =
    result.json?.errors?.[0]?.description || result.json?.message || null;
  if (apiMessage) return apiMessage;

  if (result.status === 0) {
    return "Não foi possível conectar ao Asaas. Verifique sua conexão e tente novamente.";
  }
  if (result.status === 401 || result.status === 403) {
    return "Chave de API do Asaas inválida ou sem permissão. Confira a chave e o ambiente (Produção/Sandbox).";
  }
  if (result.status >= 500 || /<html/i.test(result.text)) {
    return `O Asaas está temporariamente indisponível (HTTP ${result.status}). Aguarde alguns minutos e tente novamente.`;
  }
  return `Erro inesperado do Asaas (HTTP ${result.status}).`;
}

export async function asaasRequest(
  config: { apiKey: string; baseUrl: string; isTestMode?: boolean },
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
  body?: Record<string, any>
) {
  const url = `${config.baseUrl}${path}`;
  const res = await asaasFetchJson(url, {
    method,
    headers: asaasHeaders(config.apiKey),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok || !res.json) {
    throw new Error(asaasErrorMessage(res));
  }

  return res.json;

}

export function asaasHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    access_token: apiKey,
    "User-Agent": ASAAS_USER_AGENT,
  };
}

export function buildExternalReference(opts: {
  productType: string;
  productId: string;
  userId: string;
  affiliateRef?: string | null;
}) {
  return [
    opts.productType,
    opts.productId,
    `u_${opts.userId}`,
    ...(opts.affiliateRef ? [`ref_${opts.affiliateRef}`] : []),
  ].join(":");
}

export function parseExternalReference(ref: string | null | undefined) {
  if (!ref || !ref.includes(":")) return null;
  const parts = ref.split(":");
  const userPart = parts.find((p) => p.startsWith("u_"));
  const affiliatePart = parts.find((p) => p.startsWith("ref_"));
  return {
    productType: parts[0],
    productId: parts[1],
    userId: userPart ? userPart.replace("u_", "") : null,
    affiliateCode: affiliatePart ? affiliatePart.replace("ref_", "") : null,
  };
}

export async function grantAccess(
  productType: string,
  productId: string,
  userId: string,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  if (productType === "course") {
    const { error } = await supabaseAdmin
      .from("course_enrollments")
      .upsert({ user_id: userId, course_id: productId }, { onConflict: "user_id,course_id" });
    if (error) {
      console.error("[Asaas] Falha ao matricular em curso:", {
        message: error.message,
        code: error.code,
        details: error.details,
        userId,
        productId,
      });
      return false;
    }
    
    
    // Auto-generate certificate if enabled and progess check passes (handled in separate logic usually, but here we can trigger initial check)
    // Marca checkout pendente como concluído se existir
    const { error: checkoutError } = await supabaseAdmin
      .from('pending_checkouts')
      .update({ status: 'completed' })
      .eq('user_id', userId)
      .eq('product_id', productId)
      .eq('product_type', 'course')
      .eq('status', 'pending');
      
    if (checkoutError) console.error("[Asaas] Erro ao concluir checkout pendente:", checkoutError);

    // Confirma resgate de cupom pendente para este produto (se houver)
    const { error: couponError } = await (supabaseAdmin as any).rpc("complete_coupon_redemption", {
      p_user_id: userId,
      p_product_id: productId,
      p_product_type: "course",
    });
    if (couponError) console.error("[Coupons] Erro ao confirmar resgate:", couponError);

    return true;
  }
  if (productType === "ebook") {
    const { error } = await supabaseAdmin
      .from("ebook_enrollments")
      .upsert({ user_id: userId, ebook_id: productId }, { onConflict: "user_id,ebook_id" });
    if (error) {
      console.error("[Asaas] Falha ao matricular em ebook:", {
        message: error.message,
        code: error.code,
        details: error.details,
        userId,
        productId,
      });
      return false;
    }
    
    // Marca checkout pendente como concluído se existir
    const { error: checkoutError } = await supabaseAdmin
      .from('pending_checkouts')
      .update({ status: 'completed' })
      .eq('user_id', userId)
      .eq('product_id', productId)
      .eq('product_type', 'ebook')
      .eq('status', 'pending');

    if (checkoutError) console.error("[Asaas] Erro ao concluir checkout pendente:", checkoutError);

    // Confirma resgate de cupom pendente para este produto (se houver)
    const { error: couponError } = await (supabaseAdmin as any).rpc("complete_coupon_redemption", {
      p_user_id: userId,
      p_product_id: productId,
      p_product_type: "ebook",
    });
    if (couponError) console.error("[Coupons] Erro ao confirmar resgate:", couponError);

    return true;
  }

  return false;
}

/** Resolve o usuário a partir do pagamento quando a referência externa não traz o id. */
export async function resolveUserFromPayment(payment: any, baseUrl: string, apiKey: string) {
  const emailFromPayload = payment?.customerEmail;
  let email: string | null = emailFromPayload || null;

  if (!email && payment?.customer) {
    try {
      const res = await fetch(`${baseUrl}/customers/${payment.customer}`, {
        headers: asaasHeaders(apiKey),
      });
      if (res.ok) {
        const customer = await res.json();
        email = customer?.email || null;
      }
    } catch (e) {
      console.error("[Asaas] Falha ao buscar cliente:", e);
    }
  }

  if (!email) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  return profile?.id || null;
}

export async function fetchPaymentFromAsaas(paymentId: string) {
  const { apiKey, baseUrl } = await getAsaasConfig();
  const res = await asaasFetchJson(`${baseUrl}/payments/${paymentId}`, {
    headers: asaasHeaders(apiKey),
  });

  if (!res.ok || !res.json) {
    throw new Error(asaasErrorMessage(res));
  }

  return res.json;
}


/** Consulta o Asaas por pagamentos confirmados de um produto para um usuário. */
export async function findConfirmedPayment(params: {
  productType: string;
  productId: string;
  userId: string;
  userEmail?: string | null;
}) {
  const { apiKey, baseUrl } = await getAsaasConfig();
  const strictPrefix = `${params.productType}:${params.productId}:u_${params.userId}`;
  const legacyPrefix = `${params.productType}:${params.productId}`;
  const email = params.userEmail?.toLowerCase() || null;

  for (const status of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) {
    const res = await asaasFetchJson(`${baseUrl}/payments?status=${status}&limit=100`, {
      headers: asaasHeaders(apiKey),
    });
    if (!res.ok || !res.json) continue;
    const payments: any[] = res.json?.data || [];

    const strict = payments.find(
      (p) => typeof p.externalReference === "string" && p.externalReference.startsWith(strictPrefix),
    );
    if (strict) return strict;

    // Compatibilidade com links antigos (sem o id do usuário na referência):
    // valida a titularidade pelo e-mail do cliente no Asaas.
    if (email) {
      const legacyCandidates = payments.filter(
        (p) =>
          typeof p.externalReference === "string" &&
          p.externalReference.startsWith(legacyPrefix) &&
          !p.externalReference.includes(":u_"),
      );

      for (const candidate of legacyCandidates) {
        const ownerId = await resolveUserFromPayment(candidate, baseUrl, apiKey);
        if (ownerId === params.userId) return candidate;
      }
    }
  }
  return null;
}


/**
 * Verifica se a página hospedada de checkout do Asaas está respondendo.
 * O Asaas ocasionalmente devolve 503 (HTML do balanceador) em www.asaas.com,
 * o que deixaria o cliente numa tela de erro crua ao clicar em pagar.
 */
export async function probeAsaasCheckout(url: string): Promise<{ available: boolean; status: number }> {
  let host = "";
  try { host = new URL(url).hostname; } catch { return { available: false, status: 0 }; }
  if (!/(^|\.)asaas\.com$/.test(host)) return { available: false, status: 0 };

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": ASAAS_USER_AGENT, accept: "text/html" },
    });
    return { available: res.status < 500, status: res.status };
  } catch {
    return { available: false, status: 0 };
  }
}
