/**
 * Utilitários de download seguros para PWA (standalone).
 *
 * Em PWA instalado (principalmente iOS) navegar a janela atual para um
 * arquivo (form target="_self" ou location.href) tira o usuário do app e
 * ele não tem botão de voltar. Por isso todo download passa por blob +
 * <a download>, mantendo o app na tela.
 */

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (window.navigator as any)?.standalone === true
  );
}

/** Salva um Blob como arquivo sem navegar a página atual. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

function filenameFromDisposition(value: string | null, fallback: string) {
  if (!value) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* ignore */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  if (plain?.[1] && plain[1] !== "download") return plain[1];
  return fallback;
}

/**
 * Baixa a resposta de um endpoint (POST/GET) como arquivo, sem sair do app.
 */
export async function downloadFromResponse(
  response: Response,
  fallbackName: string
) {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Não foi possível baixar o arquivo.");
  }
  const blob = await response.blob();
  const name = filenameFromDisposition(
    response.headers.get("content-disposition"),
    fallbackName
  );
  saveBlob(blob, name);
}

/**
 * Abre um link externo sem trocar a janela do PWA.
 */
export function openExternal(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 1000);
}
