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
    value.includes('vimeo.com') ||
    // Bunny Stream CDN (pull zone) — URL pública, nunca passa por assinatura.
    value.includes('b-cdn.net') ||
    value.includes('mediadelivery.net')
  );
}

/** Vídeos internos precisam de URL assinada antes de tocar. */
export function needsSignedUrl(url?: string | null): boolean {
  return Boolean(url) && !isExternalVideoUrl(url);
}

/** Provedores suportados para vídeos de aula. */
export type VideoProvider = 'auto' | 'bunny' | 'youtube' | 'drive' | 'url';
/** Formato de exibição: horizontal (padrão YouTube 16:9) ou vertical (9:16). */
export type VideoAspect = 'landscape' | 'portrait';

export interface ResolvedVideo {
  /** Como o player deve renderizar. */
  kind: 'bunny' | 'external' | 'file' | 'none';
  /** URL pronta para o <iframe> (bunny) ou para o VideoPlayer (external/file). */
  src: string;
  aspect: VideoAspect;
  /** Vídeos internos ainda precisam de URL assinada antes de tocar. */
  needsSigning: boolean;
}

const BUNNY_LIBRARY_ID =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BUNNY_LIBRARY_ID) || '';

/** Extrai libraryId/videoId de qualquer URL do Bunny (play, embed ou CDN). */
function parseBunnyUrl(url: string): { library: string; id: string } | null {
  const match = url.match(/mediadelivery\.net\/(?:play|embed)\/([^/?#]+)\/([^/?#]+)/i);
  if (match) return { library: match[1], id: match[2] };
  const cdn = url.match(/b-cdn\.net\/([^/?#]+)/i);
  if (cdn) return { library: '', id: cdn[1] };
  return null;
}

/**
 * Aceita o ID puro do vídeo, "libraryId/videoId" ou a URL completa (play/embed)
 * do Bunny Stream e devolve sempre a URL de embed do iframe.
 */
export function buildBunnyEmbedUrl(videoId: string, libraryId = BUNNY_LIBRARY_ID): string {
  const value = videoId.trim();
  if (!value) return '';
  let library = libraryId;
  let id = '';
  if (value.startsWith('http')) {
    const parsed = parseBunnyUrl(value);
    if (!parsed) return value; // outra URL de iframe qualquer
    if (parsed.library) library = parsed.library;
    id = parsed.id;
  } else {
    const [first, second] = value.split('/');
    if (second) library = first;
    id = second || first;
  }
  if (!library || !id) return '';
  // Player limpo: sem botões de compartilhar/baixar, sem vídeos relacionados.
  return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(library)}/${encodeURIComponent(
    id,
  )}?autoplay=false&preload=true&responsive=true`;
}


export function resolveLessonVideo(input: {
  provider?: VideoProvider | string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  aspect?: VideoAspect | string | null;
}): ResolvedVideo {
  const aspect: VideoAspect = input.aspect === 'portrait' ? 'portrait' : 'landscape';
  const provider = (input.provider || 'auto') as VideoProvider;
  const url = input.videoUrl?.trim() || '';
  const id = input.videoId?.trim() || '';

  const isBunny =
    provider === 'bunny' ||
    (provider === 'auto' && (Boolean(id) || url.includes('mediadelivery.net')));

  // URL direta do CDN do Bunny (playlist HLS / mp4): toca no player nativo,
  // pois o embed em iframe exige o libraryId numérico, que a URL não contém.
  if (url.includes('b-cdn.net')) {
    return { kind: 'file', src: url, aspect, needsSigning: false };
  }

  if (isBunny) {
    // A URL completa contém o libraryId, então tem prioridade sobre o ID puro.
    const fromUrl = url.includes('mediadelivery.net') ? url : '';
    const src = buildBunnyEmbedUrl(fromUrl || id) || buildBunnyEmbedUrl(id);
    if (src) return { kind: 'bunny', src, aspect, needsSigning: false };
  }


  if (!url) return { kind: 'none', src: '', aspect, needsSigning: false };
  if (isExternalVideoUrl(url)) return { kind: 'external', src: url, aspect, needsSigning: false };
  return { kind: 'file', src: url, aspect, needsSigning: true };
}
