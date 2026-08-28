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
      
      // Limpa caches do Service Worker se possível antes do reload
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [error]);

  const handleReset = async () => {
    // Tentar recarregar a página inteira para limpar o cache do navegador e manifestos antigos
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
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
                  navigator.serviceWorker
                    .register(
                      "/sw.js",
                      {
                        scope: "/",
                        updateViaCache: "none"
                      }
                    )
                    .then(function (registration) {
                      return registration.update();
                    })
                    .catch(function (error) {
                      console.error(
                        "[RNV PWA] Falha no Service Worker:",
                        error
                      );
                    });
                }
              })();
            `,
          }}
        />
        <HeadContent />
      </head>
      <body className="antialiased overflow-x-hidden selection:bg-primary/30">
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
    });

    initPixel();
    installClientLogger();

    return () => {
      unsubBefore();
      unsubAfter();
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
    if (!hasAuthPayload) return;

    let cancelled = false;
    (async () => {
      const { completeAuthFromUrl } = await import("@/lib/auth-callback");
      const result = await completeAuthFromUrl();
      if (cancelled || result.status !== "success") return;
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
