import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { PwaUpdateManager } from "../components/platform/PwaUpdateManager";

import { useAffiliateTracking } from "../hooks/use-affiliate-tracking";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initPixel, trackEvent } from "../lib/pixel";
import { gtmPageView, gtmSocialClick, gtmPwaInstalled } from "../lib/gtm";

import { installClientLogger, logClient } from "../lib/client-logger";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-fire">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-fire">Voltar ao início</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    logClient("error", "app", error.message, { stack: error.stack?.slice(0, 2000) });
    
    // Auto-recovery for chunk errors or failed style loading
    const isChunkError = error.message.toLowerCase().includes('chunk') || 
                        error.message.toLowerCase().includes('dynamically imported');
    
    if (isChunkError && typeof window !== 'undefined') {
      console.warn("Detectado erro de carregamento de recursos. Tentando recuperação automática...");
      
      // Limpa os caches (sem desregistrar o SW: desregistrar + recarregar
      // provoca "Failed to update a ServiceWorker for scope").
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("rnv-") || key.startsWith("ronnei-"))
            .forEach((key) => void caches.delete(key));
        }).catch(() => { /* ignora */ });
      }

      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [error]);

  const handleReset = async () => {
    // Recarrega limpando os caches do app (mantém o SW de push registrado).
    if (typeof window !== 'undefined') {
      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.allSettled(
            keys
              .filter((key) => key.startsWith('rnv-') || key.startsWith('ronnei-'))
              .map((key) => caches.delete(key)),
          );
        } catch {
          /* ignora */
        }
      }
      window.location.reload();
      return;
    }

    await queryClient.resetQueries();
    router.invalidate();
    reset();
  };

  const handleGoHome = async () => {
    const { data } = await import("@/integrations/supabase/client").then(m => m.supabase.auth.getSession());
    if (data.session) {
      navigate({ to: "/inicio" });
    } else {
      navigate({ to: "/" });
    }
    reset();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Erro ao carregar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente em instantes.</p>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-left">
            <p className="text-[10px] font-mono text-red-400 break-all">{error.message}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={handleReset} className="btn-fire">
            Tentar novamente
          </button>
          <button onClick={handleGoHome} className="btn-ghost-fire">
            Ir para o início
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "Ronnei na Veia" },
      {
        name: "description",
        content:
          "Plataforma oficial Espetinho na Veia: conteúdos, cursos e materiais para lucrar com espetinhos.",
      },
      { name: "theme-color", content: "#1a0d08" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Espetinho na Veia" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Ronnei na Veia" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-touch-fullscreen", content: "yes" },
      { name: "full-screen", content: "yes" },
      { name: "browsermode", content: "application" },
      { name: "application-name", content: "Ronnei na Veia" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.json?v=20260827-brand" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      // Fontes self-hosted (subset latino, variáveis) com preload: sem round-trip
      // para o Google Fonts e sem CSS externo bloqueando a renderização.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/inter-latin-var.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/oswald-latin-var.woff2",
        crossOrigin: "anonymous",
      },
    ],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Espetinho na Veia",
          url: "https://espetinhonaveia.lovable.app",
          description:
            "Educação prática para montar, temperar, precificar e vender espetinhos com alta margem.",
          email: "contato@espetinhonaveia.com",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        {/* Google Tag Manager — container único, carregado uma só vez */}
        <script
          data-rnv-gtm
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){if(w.__RNV_GTM_LOADED__)return;w.__RNV_GTM_LOADED__=true;w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-M376JTZP');`,
          }}
        />
        <script

          data-rnv-auth-return
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var s = new URLSearchParams(location.search);
                  var h = new URLSearchParams(location.hash.replace(/^#/, ""));
                  // Marcado ANTES do supabase-js consumir o hash da URL, para
                  // sabermos que esta carga de página é um retorno de login social.
                  window.__RNV_AUTH_RETURN__ =
                    s.has("code") || h.has("access_token") ||
                    ((s.has("token_hash") || s.has("token")) && s.has("type"));
                } catch (e) {
                  window.__RNV_AUTH_RETURN__ = false;
                }
              })();
            `,
          }}
        />
        <script
          data-rnv-pwa-bootstrap

          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.__RNV_PWA_BOOTSTRAPPED__) return;

                window.__RNV_PWA_BOOTSTRAPPED__ = true;
                window.__RNV_PWA_PROMPT__ = null;

                window.addEventListener(
                  "beforeinstallprompt",
                  function (event) {
                    event.preventDefault();

                    window.__RNV_PWA_PROMPT__ = event;

                    window.dispatchEvent(
                      new Event("rnv-pwa-ready")
                    );

                    console.info(
                      "[RNV PWA] beforeinstallprompt capturado"
                    );
                  },
                  { passive: false }
                );

                window.addEventListener(
                  "appinstalled",
                  function () {
                    window.__RNV_PWA_PROMPT__ = null;

                    console.info(
                      "[RNV PWA] appinstalled recebido"
                    );
                  }
                );

                if ("serviceWorker" in navigator) {
                  var host = location.hostname;

                  var blocked =
                    window.top !== window.self ||
                    !window.isSecureContext ||
                    location.search.indexOf("sw=off") > -1 ||
                    host === "localhost" ||
                    host === "127.0.0.1" ||
                    host.indexOf("id-preview--") === 0 ||
                    host.indexOf("preview--") === 0 ||
                    host === "lovableproject.com" ||
                    host.slice(-19) === ".lovableproject.com" ||
                    host.slice(-16) === ".beta.lovable.dev" ||
                    host.slice(-16) === "-dev.lovable.app";

                  if (blocked) {
                    navigator.serviceWorker
                      .getRegistrations()
                      .then(function (list) {
                        list.forEach(function (reg) {
                          var script =
                            (reg.active || reg.installing || reg.waiting || {})
                              .scriptURL || "";
                          if (script.indexOf("/sw.js") > -1) reg.unregister();
                        });
                      })
                      .catch(function () {});
                  } else if (!window.__RNV_SW_REGISTRATION__) {
                    window.__RNV_SW_REGISTRATION__ = navigator.serviceWorker
                      .register("/sw.js", {
                        scope: "/",
                        updateViaCache: "none"
                      })
                      .catch(function (error) {
                        console.warn(
                          "[RNV PWA] Service Worker indisponível:",
                          error
                        );
                        return null;
                      });
                  }
                }

              })();
            `,
          }}
        />
        <HeadContent />
      </head>
      <body className="antialiased overflow-x-hidden selection:bg-primary/30">
        {/* Google Tag Manager (noscript) */}
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M376JTZP"
height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
          }}
        />
        <script

          dangerouslySetInnerHTML={{
            __html: `
              // Script de Resiliência Visual: Detecta se o CSS principal falhou ou se há erros de chunk precoces
              (function() {
                
                window.addEventListener('error', function(e) {
                  if (e.message && (e.message.indexOf('chunk') > -1 || e.message.indexOf('dynamically imported') > -1)) {
                    console.warn('Recuperação de Layout: Detectada falha crítica. Recarregando...');
                    window.location.reload();
                  }
                }, true);

                // Verifica se as variáveis de tema foram carregadas
                window.addEventListener('load', function() {
                  setTimeout(function() {
                    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary');
                    if (!primary || primary.trim() === '') {
                      console.error('Falha na Resiliência: Layout não carregado corretamente. Restaurando...');
                      window.location.reload();
                    }
                  }, 2000);
                });
              })();
            `,
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Rastreia mudanças de rota para a barra de progresso e trackings.
    const unsubBefore = router.subscribe("onBeforeNavigate", () => {
      if (typeof document !== "undefined") {
        document.body.classList.add("loading-route");
      }
    });
    
    const unsubAfter = router.subscribe("onResolved", () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("loading-route");
      }
      trackEvent("PageView");
      gtmPageView();
    });

    initPixel();
    gtmPageView();
    installClientLogger();

    // Cliques em WhatsApp/Instagram (delegado: cobre todas as rotas, sem duplicar).
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;
      const href = anchor.href || "";
      if (/wa\.me|api\.whatsapp\.com|whatsapp:/i.test(href)) {
        gtmSocialClick("whatsapp", window.location.pathname);
      } else if (/instagram\.com/i.test(href)) {
        gtmSocialClick("instagram", window.location.pathname);
      }
    };
    document.addEventListener("click", onClick, true);

    const onInstalled = () => gtmPwaInstalled("installed");
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      unsubBefore();
      unsubAfter();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [router]);

  // Rede de segurança do login social: se o Supabase devolver o código/tokens
  // em uma rota que não é /auth/callback (acontece quando o Site URL do projeto
  // sobrescreve o redirectTo), concluímos a sessão aqui e levamos para /app.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path.startsWith("/auth/callback") || path.startsWith("/inicio")) return;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasAuthPayload =
      search.has("code") ||
      hash.has("access_token") ||
      ((search.has("token_hash") || search.has("token")) && search.has("type"));
    // O supabase-js pode já ter consumido o hash antes deste efeito; o script
    // do <head> registra esse retorno em __RNV_AUTH_RETURN__.
    const isAuthReturn =
      hasAuthPayload || (window as any).__RNV_AUTH_RETURN__ === true;
    if (!isAuthReturn) return;
    (window as any).__RNV_AUTH_RETURN__ = false;

    let cancelled = false;
    (async () => {
      const { completeAuthFromUrl } = await import("@/lib/auth-callback");
      const result = await completeAuthFromUrl();
      if (cancelled || result.status !== "success") return;
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { gtmTrackAuthenticatedUser } = await import("@/lib/gtm");
        const { data } = await supabase.auth.getUser();
        gtmTrackAuthenticatedUser(data.user as any);
      } catch {
        /* noop */
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      router.navigate({ to: result.redirectTo, replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient, router]);

  useAffiliateTracking();


  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      
      <Toaster
        position="top-center"
        theme="dark"
        richColors
        closeButton
        duration={4000}
        offset="calc(env(safe-area-inset-top, 0px) + 16px)"
        mobileOffset="calc(env(safe-area-inset-top, 0px) + 16px)"
        toastOptions={{ closeButton: true }}
      />
      <PwaUpdateManager />
    </QueryClientProvider>
  );
}
