import { Suspense, lazy, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  resolveLessonVideo,
  type VideoAspect,
  type VideoProvider,
} from '@/lib/video-source';

const VideoPlayer = lazy(() =>
  import('@/components/platform/VideoPlayer').then((m) => ({ default: m.VideoPlayer })),
);

interface LessonPlayerProps {
  /** Usado para salvar progresso. */
  videoId: string;
  title?: string;
  poster?: string;
  /** URL do vídeo (Bunny, YouTube, Drive ou arquivo interno já assinado). */
  videoUrl?: string | null;
  /** ID do vídeo no provedor (Bunny Stream). */
  providerVideoId?: string | null;
  provider?: VideoProvider | string | null;
  /** Padrão dos cursos: horizontal 16:9 (estilo YouTube). */
  aspect?: VideoAspect | string | null;
  className?: string;
  /** Não aplica o container/aspecto próprio — o chamador já tem o seu. */
  frameless?: boolean;
  /** Repassados ao player nativo (arquivos, YouTube, Drive). */
  preferPoster?: boolean;
  autoStart?: boolean;
  isIntro?: boolean;
  fit?: 'cover' | 'contain';
  /** Autoplay no embed do Bunny (usado em modais em que o usuário já clicou). */
  autoplay?: boolean;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
}

function Frame({
  aspect,
  className,
  frameless,
  children,
}: {
  aspect: VideoAspect;
  className?: string;
  frameless?: boolean;
  children: React.ReactNode;
}) {
  if (frameless) {
    return <div className={cn('relative h-full w-full overflow-hidden bg-black', className)}>{children}</div>;
  }
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-black',
        aspect === 'portrait'
          ? 'aspect-[9/16] max-h-[70vh] max-w-[420px] mx-auto'
          : 'aspect-video',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function LessonPlayer({
  videoId,
  title,
  poster,
  videoUrl,
  providerVideoId,
  provider,
  aspect,
  className,
  frameless,
  preferPoster,
  autoStart,
  isIntro,
  fit = 'contain',
  autoplay,
  onProgress,
  onEnded,
}: LessonPlayerProps) {
  const resolved = resolveLessonVideo({
    provider,
    videoId: providerVideoId,
    videoUrl,
    aspect,
  });

  if (resolved.kind === 'none') {
    return (
      <Frame aspect={resolved.aspect} className={className} frameless={frameless}>
        <div className="absolute inset-0 grid place-items-center text-xs text-white/40">
          Vídeo não disponível
        </div>
      </Frame>
    );
  }

  if (resolved.kind === 'bunny') {
    const src = autoplay || autoStart ? resolved.src.replace('autoplay=false', 'autoplay=true') : resolved.src;
    return (
      <Frame aspect={resolved.aspect} className={className} frameless={frameless}>
        <BunnyFrame
          src={src}
          title={title}
          onEnded={onEnded}
        />
      </Frame>
    );
  }

  return (
    <Suspense
      fallback={
        <Frame aspect={resolved.aspect} className={className} frameless={frameless}>
          <div className="absolute inset-0 animate-pulse bg-white/5" />
        </Frame>
      }
    >
      <VideoPlayer
        videoId={videoId}
        src={resolved.src}
        poster={poster}
        preferPoster={preferPoster}
        autoStart={autoStart}
        isIntro={isIntro}
        title={title}
        aspect={resolved.aspect === 'portrait' ? 'portrait' : 'video'}
        fit={fit}
        className={cn('w-full', className)}
        onProgress={onProgress}
        onEnded={onEnded}
      />
    </Suspense>
  );
}

/**
 * Embed do Bunny com escuta do evento `ended` via protocolo player.js,
 * para que aberturas fechem sozinhas quando o vídeo termina.
 */
function BunnyFrame({
  src,
  title,
  onEnded,
}: {
  src: string;
  title?: string;
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    const post = (payload: Record<string, unknown>) => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ context: 'player.js', version: '0.0.11', ...payload }),
        '*',
      );
    };

    const subscribe = () => {
      post({ method: 'addEventListener', value: 'ended', listener: 'lp-ended' });
      post({ method: 'addEventListener', value: 'ready', listener: 'lp-ready' });
    };

    const onMessage = (event: MessageEvent) => {
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
      let data: any = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || data.context !== 'player.js') return;
      if (data.event === 'ready') subscribe();
      if (data.event === 'ended') endedRef.current?.();
    };

    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', subscribe);
    const retry = window.setTimeout(subscribe, 1500);
    return () => {
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', subscribe);
      window.clearTimeout(retry);
    };
  }, [src]);

  return (
    <iframe
      ref={ref}
      src={src}
      title={title || 'Vídeo'}
      className="absolute inset-0 h-full w-full border-0"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}

export default LessonPlayer;
