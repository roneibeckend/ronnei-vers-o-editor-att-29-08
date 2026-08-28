import { Suspense, lazy } from 'react';
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
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
}

function Frame({
  aspect,
  className,
  children,
}: {
  aspect: VideoAspect;
  className?: string;
  children: React.ReactNode;
}) {
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
      <Frame aspect={resolved.aspect} className={className}>
        <div className="absolute inset-0 grid place-items-center text-xs text-white/40">
          Vídeo não disponível
        </div>
      </Frame>
    );
  }

  if (resolved.kind === 'bunny') {
    return (
      <Frame aspect={resolved.aspect} className={className}>
        <iframe
          src={resolved.src}
          title={title || 'Aula'}
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </Frame>
    );
  }

  return (
    <Suspense
      fallback={
        <Frame aspect={resolved.aspect} className={className}>
          <div className="absolute inset-0 animate-pulse bg-white/5" />
        </Frame>
      }
    >
      <VideoPlayer
        videoId={videoId}
        src={resolved.src}
        poster={poster}
        title={title}
        aspect={resolved.aspect === 'portrait' ? 'portrait' : 'video'}
        fit="contain"
        className={cn('w-full', className)}
        onProgress={onProgress}
        onEnded={onEnded}
      />
    </Suspense>
  );
}

export default LessonPlayer;
