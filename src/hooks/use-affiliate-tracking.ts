import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

const AFFILIATE_REF_KEY = "affiliate_ref";
// Chave legada usada pela landing page / login
const LEGACY_REF_KEY = "affiliate_referrer_code";

export function useAffiliateTracking() {
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const ref = searchParams.get("ref");

    if (!ref) return;

    // Grava nas duas chaves para manter a atribuição consistente em todo o app
    localStorage.setItem(AFFILIATE_REF_KEY, ref);
    localStorage.setItem(LEGACY_REF_KEY, ref);

    // Contabiliza o clique no link do afiliado (uma vez por sessão do navegador)
    const clickKey = `affiliate_click_${ref}`;
    if (!sessionStorage.getItem(clickKey)) {
      sessionStorage.setItem(clickKey, "1");
      import("@/lib/affiliate-track.functions")
        .then(({ registerAffiliateClick }) => registerAffiliateClick({ data: { code: ref } }))
        .catch((err) => console.error("[Afiliados] Falha ao registrar clique:", err));
    }
  }, [router]);
}

export function getAffiliateRef() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AFFILIATE_REF_KEY) || localStorage.getItem(LEGACY_REF_KEY);
}

export function clearAffiliateRef() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AFFILIATE_REF_KEY);
  localStorage.removeItem(LEGACY_REF_KEY);
}
