import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/manifest/webmanifest')({
  server: {
    handlers: {
      GET: async () => {
        const manifest = {
          name: "Ronnei na Veia",
          short_name: "Ronnei na Veia",
          description: "Cursos, e-books e conteúdos exclusivos da plataforma Ronnei na Veia.",
          start_url: "/app",
          display: "standalone",
          background_color: "#0a0a0a",
          theme_color: "#1a0d08",

          icons: [
            {
              src: "/favicon.png",
              sizes: "64x64",
              type: "image/png"
            },
            {
              src: "/icons/icon-192x192.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/icons/icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "/icons/maskable-icon.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ],
          id: "/app",
          scope: "/"
        };

        return new Response(JSON.stringify(manifest), {
          headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=3600'
          },
        });
      }
    }
  }
})
