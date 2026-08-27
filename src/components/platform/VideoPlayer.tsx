import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Loader2, AlertCircle, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface VideoPlayerProps {
  src: string;
  /** Lighter variant used on small screens / mobile data. Falls back to `src`. */
  srcMobile?: string;
  poster?: string;
  title?: string;
  videoId: string; // Used for saving progress
  onProgress?: (progress: number) => void;
  className?: string;
  aspect?: 'video' | 'portrait';
  fit?: 'cover' | 'contain';
  /** Kept for API compatibility. Intro videos never autoplay: the user always taps play. */
  isIntro?: boolean;
  /** Starts playback with sound immediately on mount (used when the user already tapped a play button). */
  autoStart?: boolean;
  /** Called when playback reaches the end (used to auto-close intro modals). */
  onEnded?: () => void;
  /** Uses `poster` as the cover even for YouTube/Drive embeds (ignores the platform thumbnail). */
  preferPoster?: boolean;
}


const isYouTubeUrl = (url: string) =>
  url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com');
const isDriveUrl = (url: string) => url.includes('drive.google.com');

function getYouTubeId(url: string) {
  if (url.includes('/embed/')) return url.split('/embed/')[1]?.split(/[?&/]/)[0] ?? '';
  if (url.includes('/shorts/')) return url.split('/shorts/')[1]?.split(/[?&/]/)[0] ?? '';
  if (url.includes('/live/')) return url.split('/live/')[1]?.split(/[?&/]/)[0] ?? '';
  if (url.includes('v=')) return url.split('v=')[1]?.split('&')[0] ?? '';
  if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split(/[?&/]/)[0] ?? '';
  return '';
}


function getDriveId(url: string) {
  const match = url.match(/\/file\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&#]+)/);
  return match?.[1] ?? '';
}

function getDrivePreviewUrl(url: string) {
  const id = getDriveId(url);
  if (!id) return url;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview?autoplay=1`;
}

/**
 * Only genuinely constrained connections (data-saver / 2G-3G) or very small,
 * low-density screens fall back to the lighter encode. Everyone else gets the
 * full-quality file so the video never looks blurry.
 */
function prefersLightVariant() {
  if (typeof window === 'undefined') return false;
  const connection = (navigator as any).connection;
  const saveData = Boolean(connection?.saveData);
  const slowLink = ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '');
  // Em telas de celular a versão leve (540x960, ~1 Mbps) já é nítida e baixa
  // metade dos bytes, evitando travadas no início da reprodução.
  const phoneScreen = window.matchMedia('(max-width: 768px)').matches;
  return saveData || slowLink || phoneScreen;
}


const PROGRESS_SAVE_INTERVAL_MS = 5000;
const MAX_RECOVERY_ATTEMPTS = 3;

export function VideoPlayer({
  src,
  srcMobile,
  poster,
  title,
  videoId,
  onProgress,
  className,
  aspect = 'video',
  fit = 'cover',
  autoStart = false,
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [useLight, setUseLight] = useState(false);
  const [portraitThumb, setPortraitThumb] = useState(false);
  // Capa horizontal dentro de um quadro vertical: precisamos "encaixar" a
  // imagem (contain) com um fundo desfocado, em vez de recortar/esticar.
  const [landscapeThumb, setLandscapeThumb] = useState(false);
  const embedIframeRef = useRef<HTMLIFrameElement>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const recoveryAttempts = useRef(0);
  const lastSaveRef = useRef(0);

  const isYouTube = isYouTubeUrl(src);
  const ytId = isYouTube ? getYouTubeId(src) : '';
  const isShorts = src.includes('/shorts/');
  const isDrive = isDriveUrl(src);
  // Google Drive public downloads regularly return quota/HTML pages and the
  // original files are very large. Use Drive's preview player so Google serves
  // its mobile/adaptive stream instead of forcing the browser to download the
  // whole source video through our proxy.
  const isEmbed = isYouTube || isDrive;
  const baseSrc = useLight && srcMobile ? srcMobile : src;
  const playableSrc = baseSrc;
  const driveId = isDrive ? getDriveId(src) : '';
  const cleanPoster = poster || (driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200` : undefined);
  const frameClass =
    aspect === 'portrait' || isShorts || (isEmbed && portraitThumb && !started)
      ? 'aspect-[9/16] max-w-[420px] w-full'
      : 'aspect-video';

  // Decide the encode after hydration so SSR markup stays stable.
  useEffect(() => {
    if (srcMobile) setUseLight(prefersLightVariant());
  }, [srcMobile]);

  // Reset when the media changes
  useEffect(() => {
    setStarted(false);
    setIsLoading(false);
    setHasError(false);
    setNeedsUnmute(false);
    recoveryAttempts.current = 0;
    setPortraitThumb(false);
    setLandscapeThumb(false);
  }, [src]);

  // Progress persistence (native <video> only), throttled to avoid layout thrash
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (isEmbed) return;
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSaveRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
      lastSaveRef.current = now;
      try {
        localStorage.setItem(`video_progress_${videoId}`, String(video.currentTime));
      } catch {
        /* storage may be unavailable */
      }
      onProgressRef.current?.(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [src, videoId, isEmbed]);

  // Free decoder/network resources when the player leaves the screen (modal close,
  // chapter switch, route change). Without this iOS keeps the buffer in memory.
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* nothing else to clean */
      }
    };
  }, []);

  // Auto-recovery: a dropped connection leaves the element stalled forever.
  const recover = useCallback(() => {
    const video = videoRef.current;
    if (!video || recoveryAttempts.current >= MAX_RECOVERY_ATTEMPTS) {
      setHasError(true);
      setIsLoading(false);
      return;
    }
    recoveryAttempts.current += 1;
    const resumeAt = video.currentTime;
    setIsLoading(true);
    try {
      video.load();
      const onReady = () => {
        video.removeEventListener('loadedmetadata', onReady);
        if (resumeAt > 0 && resumeAt < (video.duration || Infinity)) video.currentTime = resumeAt;
        void video.play().catch(() => undefined);
      };
      video.addEventListener('loadedmetadata', onReady);
    } catch {
      setHasError(true);
      setIsLoading(false);
    }
  }, []);

  // Come back online → resume where playback stopped.
  useEffect(() => {
    if (isEmbed || !started) return;
    const handleOnline = () => {
      const video = videoRef.current;
      if (video && video.paused && !hasError) recover();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isEmbed, started, hasError, recover]);

  // Start playback with sound. Called by the overlay button or automatically
  // when the user already tapped a play button before this player mounted.
  const startPlayback = useCallback(async () => {
    setHasError(false);
    setStarted(true);
    if (isEmbed) return;
    const video = videoRef.current;
    if (!video) return;
    setIsLoading(true);
    recoveryAttempts.current = 0;
    video.muted = false;
    video.removeAttribute('muted');
    video.defaultMuted = false;
    video.volume = 1;
    setNeedsUnmute(false);
    try {
      if (video.currentTime === 0) {
        try {
          const saved = Number(localStorage.getItem(`video_progress_${videoId}`));
          if (Number.isFinite(saved) && saved > 0 && saved < video.duration) video.currentTime = saved;
        } catch {
          /* storage may be unavailable */
        }
      }
      await video.play();
    } catch {
      // Some mobile browsers still refuse audible playback: start muted and
      // offer an explicit "tap for sound" action instead of failing silently.
      try {
        video.muted = true;
        await video.play();
        setNeedsUnmute(true);
      } catch {
        /* user can press the native play button */
      }
      setIsLoading(false);
    }
  }, [isEmbed, videoId]);

  // Autostart: the click that opened this player counts as the user gesture.
  useEffect(() => {
    if (!autoStart) return;
    const id = requestAnimationFrame(() => void startPlayback());
    return () => cancelAnimationFrame(id);
  }, [autoStart, startPlayback, playableSrc]);

  // ---- YouTube via IFrame API: um único toque inicia a reprodução.
  useEffect(() => {
    if (!isYouTube || !started || !ytId) return;
    let cancelled = false;

    const disableCaptions = (player: any) => {
      try {
        // IFrame API documented way: unload the captions module.
        player.unloadModule('captions');
        player.unloadModule('cc');
      } catch {
        /* módulo pode não estar carregado */
      }
      try {
        // Fallback: load captions module and select an empty track.
        player.loadModule?.('captions');
        player.setOption?.('captions', 'track', {});
      } catch {
        /* API pode não expor setOption */
      }
      try {
        // Another fallback: set language to empty string.
        player.setOption?.('captions', 'track', { languageCode: '' });
      } catch {
        /* ignora */
      }
    };

    const create = () => {
      const YT = (window as any).YT;
      if (cancelled || !YT?.Player || !ytHostRef.current) return;
      ytPlayerRef.current = new YT.Player(ytHostRef.current, {
        videoId: ytId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          disablekb: 1,
          fs: 0,
        },
        events: {
          onReady: (event: any) => {
            const player = event.target;
            disableCaptions(player);
            try {
              player.playVideo();
              player.unMute();
              player.setVolume(100);
              player.playVideo();
            } catch {
              /* ignora */
            }
            window.setTimeout(() => {
              if (cancelled) return;
              try {
                if (player.getPlayerState?.() !== 1) {
                  player.mute();
                  player.playVideo();
                  setNeedsUnmute(true);
                } else if (player.isMuted?.()) {
                  setNeedsUnmute(true);
                }
              } catch {
                /* ignora */
              }
            }, 800);
          },
          onStateChange: (event: any) => {
            disableCaptions(event.target);
            if (event.data === 1) {
              setIsLoading(false);
              try {
                if (!event.target.isMuted?.()) setNeedsUnmute(false);
              } catch {
                /* ignora */
              }
            }
            if (event.data === 0) onEndedRef.current?.();
          },
          onError: () => {
            setIsLoading(false);
            setHasError(true);
          },
        },
      });
    };

    const w = window as any;
    if (w.YT?.Player) {
      create();
    } else {
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        create();
      };
      if (!document.querySelector('script[data-yt-api="1"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.ytApi = '1';
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        /* já destruído */
      }
      ytPlayerRef.current = null;
    };
  }, [isYouTube, started, ytId]);



  // ---- External embeds.
  // YouTube: usamos a IFrame API. Ao tocar no nosso play criamos o player e
  // chamamos playVideo() direto por código, então o botão do YouTube nunca
  // aparece (um único toque inicia). Legendas são desligadas via API.
  if (isEmbed) {
    const embedUrl = isYouTube ? '' : getDrivePreviewUrl(baseSrc);

    // oar2 existe apenas em vídeos verticais; se falhar caímos na horizontal.
    // Para YouTube priorizamos a miniatura do próprio vídeo (oar2 = vertical),
    // pois a capa do e-book é horizontal e ficaria distorcida no quadro 9:16.
    const thumb = isYouTube
      ? (ytId ? `https://i.ytimg.com/vi/${ytId}/oar2.jpg` : poster)
      : cleanPoster;

    const handleEmbedPlay = () => {
      setIsLoading(true);
      setStarted(true);
    };

    return (
      <div className={cn('relative mx-auto bg-black rounded-xl overflow-hidden shadow-2xl', frameClass, className)}>
        {started && isYouTube && <div ref={ytHostRef} className="absolute inset-0 h-full w-full" />}

        {started && !isYouTube && (
          <iframe
            ref={embedIframeRef}
            src={embedUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            title={title || 'Vídeo'}
          />
        )}

        {started && isYouTube && isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black pointer-events-none">
            <Loader2 className="w-10 h-10 animate-spin text-fire" />
          </div>
        )}

        {started && isYouTube && needsUnmute && (
          <Button
            type="button"
            onClick={() => {
              try {
                ytPlayerRef.current?.unMute();
                ytPlayerRef.current?.setVolume(100);
                ytPlayerRef.current?.playVideo();
              } catch {
                /* player pode ter sido destruído */
              }
              setNeedsUnmute(false);
            }}
            className="btn-fire absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest"
          >
            <VolumeX className="h-4 w-4" /> Toque para ativar o som
          </Button>
        )}

        {!started && (
          <div className="absolute inset-0 z-10">
            {thumb && (
              <>
                {/* Fundo desfocado: evita bordas vazias quando a capa não é 9:16. */}
                {landscapeThumb && (
                  <img
                    src={thumb}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-125 object-cover object-center blur-2xl opacity-50"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              <img
                src={thumb}
                alt={title || 'Capa do vídeo'}
                // Capa vertical preenche o quadro; capa horizontal é encaixada
                // inteira e centralizada sobre o fundo desfocado (sem cortes).
                className={cn(
                  'relative h-full w-full object-center',
                  landscapeThumb ? 'object-contain' : 'bg-black object-cover',
                )}
                loading="lazy"
                decoding="async"
                onLoad={(event) => {
                  const img = event.currentTarget;
                  // Capa vertical (ex.: vídeo de celular): o quadro vira 9:16.
                  if (img.naturalHeight > img.naturalWidth) {
                    setPortraitThumb(true);
                    setLandscapeThumb(false);
                  } else {
                    setLandscapeThumb(true);
                  }
                }}
                onError={(event) => {
                  const img = event.currentTarget;
                  if (ytId && img.src.includes('oar2')) {
                    img.src = `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
                  } else if (ytId && img.src.includes('maxresdefault')) {
                    img.src = `https://i.ytimg.com/vi/${ytId}/hq720.jpg`;
                  } else if (ytId && img.src.includes('hq720')) {
                    img.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
                  }
                }}
              />
              </>
            )}

            <Button
              type="button"
              variant="ghost"
              onClick={handleEmbedPlay}
              aria-label="Reproduzir vídeo"
              className="absolute inset-0 h-full w-full rounded-none bg-black/20 p-0 hover:bg-black/20"
            >
              <span className="w-20 h-20 rounded-full bg-fire shadow-fire flex items-center justify-center transition-transform hover:scale-110 active:scale-95">
                <Play className="w-8 h-8 text-white ml-1 fill-current" />
              </span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const handlePlay = startPlayback;


  const enableSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.removeAttribute('muted');
    video.volume = 1;
    setNeedsUnmute(false);
    void video.play().catch(() => undefined);
  };


  return (
    <div className={cn('relative mx-auto bg-black rounded-xl overflow-hidden shadow-2xl', frameClass, className)}>
      <video
        key={playableSrc}
        ref={videoRef}
        src={playableSrc}
        poster={autoStart ? undefined : cleanPoster}
        title={title}
        className={cn('h-full w-full bg-black', fit === 'contain' ? 'object-contain' : 'object-cover')}
        playsInline
        webkit-playsinline="true"
        preload={autoStart ? 'auto' : 'none'}
        controls={started}
        controlsList="nodownload noplaybackrate"

        onWaiting={() => setIsLoading(true)}
        onPlaying={() => {
          setIsLoading(false);
          recoveryAttempts.current = 0;
        }}
        onCanPlay={() => setIsLoading(false)}
        onEnded={() => {
          setIsLoading(false);
          // O vídeo terminou: limpa o progresso salvo e avisa quem abriu o
          // player para fechar a tela automaticamente.
          try {
            localStorage.removeItem(`video_progress_${videoId}`);
          } catch {
            /* storage may be unavailable */
          }
          onEndedRef.current?.();
        }}
        onStalled={() => {
          if (started) recover();
        }}
        onError={() => {
          setIsLoading(false);
          if (started) recover();
          else setHasError(true);
        }}
      />

      {/* Clean cover with a single play button until playback starts */}
      {!started && !hasError && (
        <Button
          type="button"
          variant="ghost"
          onClick={handlePlay}
          aria-label="Reproduzir vídeo"
          className="absolute inset-0 h-full w-full rounded-none bg-black/20 p-0 hover:bg-black/20"
        >
          <span className="w-20 h-20 rounded-full bg-fire shadow-fire flex items-center justify-center transition-transform hover:scale-110 active:scale-95">
            <Play className="w-8 h-8 text-white ml-1 fill-current" />
          </span>
        </Button>
      )}




      {needsUnmute && started && !hasError && (
        <Button
          type="button"
          onClick={enableSound}
          className="btn-fire absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest"
        >
          <VolumeX className="h-4 w-4" /> Toque para ativar o som
        </Button>
      )}

      {isLoading && started && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10 pointer-events-none">
          <Loader2 className="w-10 h-10 animate-spin text-fire" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-20 p-6 text-center">
          <AlertCircle className="w-10 h-10 text-fire mb-3" />
          <h3 className="text-white font-bold mb-1">O vídeo não carregou</h3>
          <p className="text-white/60 text-sm mb-5">Verifique sua conexão e tente novamente.</p>
          <Button
            type="button"
            onClick={() => {
              setHasError(false);
              setStarted(false);
              recoveryAttempts.current = 0;
              videoRef.current?.load();
            }}
            className="btn-fire px-6 py-2 text-sm"
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
