import { createFileRoute } from '@tanstack/react-router';

/**
 * Streams a public Google Drive video so it can be played by a native <video> tag.
 * Drive's own iframe player injects its own UI (and blocks audio on mobile autoplay),
 * so we proxy the bytes here and let the browser render clean native controls.
 * Range requests are forwarded so seeking works on iOS/Safari.
 */
const ID_RE = /^[a-zA-Z0-9_-]{10,80}$/;

function candidateUrls(id: string) {
  return [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`,
  ];
}

export const Route = createFileRoute('/api/public/drive-video')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get('id') ?? '';

        if (!ID_RE.test(id)) {
          return new Response('Invalid id', { status: 400 });
        }

        const range = request.headers.get('range');
        const headers: Record<string, string> = {
          // Drive is picky about unknown clients
          'User-Agent': 'Mozilla/5.0 (compatible; LovableVideoProxy/1.0)',
        };
        if (range) headers['Range'] = range;

        // Serve from the edge cache when possible: Drive limits how much
        // public traffic a single file may serve, so every avoided origin
        // fetch reduces the chance of hitting "quota exceeded".
        const cacheKey = new Request(
          `https://drive-video-cache/${id}?range=${encodeURIComponent(range ?? 'full')}`,
          { method: 'GET' }
        );
        const cache = (globalThis as any).caches?.default;
        if (cache) {
          const hit = await cache.match(cacheKey);
          if (hit) return hit;
        }

        let quotaExceeded = false;

        for (const target of candidateUrls(id)) {
          let upstream: Response;
          try {
            upstream = await fetch(target, {
              headers,
              redirect: 'follow',
              cf: { cacheEverything: true, cacheTtl: 86400 },
            } as RequestInit);
          } catch {
            continue;
          }

          const contentType = upstream.headers.get('content-type') ?? '';
          if (!upstream.ok && upstream.status !== 206) continue;
          // Drive answers with an HTML page when it refuses the download
          // (confirmation screen or the daily bandwidth quota page).
          if (contentType.includes('text/html')) {
            const body = await upstream.text().catch(() => '');
            if (/quota exceeded/i.test(body)) quotaExceeded = true;
            continue;
          }

          const outHeaders = new Headers();
          outHeaders.set('Content-Type', contentType || 'video/mp4');
          outHeaders.set('Accept-Ranges', 'bytes');
          outHeaders.set('Cache-Control', 'public, max-age=86400, immutable');
          for (const key of ['content-length', 'content-range', 'etag', 'last-modified']) {
            const value = upstream.headers.get(key);
            if (value) outHeaders.set(key, value);
          }

          const response = new Response(upstream.body, {
            status: upstream.status === 206 ? 206 : 200,
            headers: outHeaders,
          });

          if (cache) {
            try {
              cache.put(cacheKey, response.clone());
            } catch {
              /* cache is best-effort */
            }
          }

          return response;
        }

        if (quotaExceeded) {
          console.error(`[drive-video] Google Drive quota exceeded for id=${id}`);
          return new Response('Drive quota exceeded', {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
          });
        }

        return new Response('Video unavailable', { status: 502 });

      },
    },
  },
});
