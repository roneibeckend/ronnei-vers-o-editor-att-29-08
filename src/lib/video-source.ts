/**
 * Detecta vídeos hospedados fora da plataforma (YouTube, Google Drive, Vimeo).
 * Esses links são reproduzidos direto no player via iframe e NUNCA passam
 * pelo fluxo de URL assinada do storage.
 *
 * Atenção: `youtu.be` não contém a string "youtube", por isso a checagem
 * precisa ser feita por este helper e não com `includes('youtube')`.
 */
export function isExternalVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const value = url.toLowerCase();
  return (
    value.includes('youtube.com') ||
    value.includes('youtube-nocookie.com') ||
    value.includes('youtu.be') ||
    value.includes('drive.google.com') ||
    value.includes('vimeo.com')
  );
}

/** Vídeos internos precisam de URL assinada antes de tocar. */
export function needsSignedUrl(url?: string | null): boolean {
  return Boolean(url) && !isExternalVideoUrl(url);
}
