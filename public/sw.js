const RNV_SW_VERSION = "rnv-pwa-20260824-final";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) =>
            key.startsWith("ronnei-") ||
            key.startsWith("rnv-") ||
            key.startsWith("workbox-") ||
            key.startsWith("vite-pwa-")
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Handler real de navegação.
  // Não bloqueia a instalação esperando baixar assets.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return new Response(
            `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1a0d08">
<title>Ronnei na Veia</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:24px;
  box-sizing:border-box;
  background:#0a0a0a;
  color:white;
  font-family:system-ui,-apple-system,sans-serif;
  text-align:center
}
main{max-width:420px}
h1{font-size:24px}
p{color:#aaa;line-height:1.5}
button{
  margin-top:12px;
  border:0;
  border-radius:12px;
  padding:13px 20px;
  background:#ff5a1f;
  color:white;
  font-weight:800
}
</style>
</head>
<body>
<main>
<h1>Sem conexão</h1>
<p>Conecte-se à internet para continuar acessando o Ronnei na Veia.</p>
<button onclick="location.reload()">Tentar novamente</button>
</main>
</body>
</html>`,
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8"
              }
            }
          );
        }
      })()
    );
  }
});
