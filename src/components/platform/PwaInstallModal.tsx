import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  Download,
  Loader2,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from "lucide-react";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  usePwaInstall,
} from "@/hooks/use-pwa-install";

import {
  useIsMobile,
} from "@/hooks/use-mobile";

const STORAGE_KEY =
  "pwa-install-modal-seen-final";

function isIos() {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return false;
  }

  return /iphone|ipad|ipod/i.test(
    navigator.userAgent
  );
}

export function PwaInstallModal() {
  const {
    isStandalone,
    canInstall,
    isInstalling,
    installError,
    installPwa,
  } = usePwaInstall();

  const isMobile =
    useIsMobile();

  const ios =
    isIos();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    accepted,
    setAccepted,
  ] =
    useState(false);

  useEffect(() => {
    if (
      !isMobile ||
      isStandalone ||
      !canInstall
    ) {
      return;
    }

    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    if (
      localStorage.getItem(
        STORAGE_KEY
      )
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => setOpen(true),
        1500
      );

    return () =>
      window.clearTimeout(timer);
  }, [
    isMobile,
    isStandalone,
    canInstall,
  ]);

  useEffect(() => {
    if (isStandalone) {
      setOpen(false);
    }
  }, [isStandalone]);

  const close = () => {
    setOpen(false);

    try {
      localStorage.setItem(
        STORAGE_KEY,
        Date.now().toString()
      );
    } catch {
      // ignore
    }
  };

  const handleInstall =
    async () => {
      const result =
        await installPwa();

      if (
        result ===
        "dismissed"
      ) {
        close();
        return;
      }

      if (
        result ===
        "accepted"
      ) {
        setAccepted(true);
      }

      if (
        result ===
        "installed"
      ) {
        setOpen(false);
      }

      // redirected navega para
      // /install-app.html
    };

  const openCompatibility =
    () => {
      window.location.assign(
        "/install-app.html?fallback=1"
      );
    };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={
            isInstalling
              ? undefined
              : close
          }
        >
          <motion.div
            initial={{
              y: 40,
              opacity: 0,
              scale: 0.98,
            }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
            }}
            exit={{
              y: 40,
              opacity: 0,
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
            className="glass w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/60"
          >
            <div className="relative bg-primary/10 p-6">
              {!isInstalling && (
                <button
                  onClick={close}
                  aria-label="Fechar"
                  className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                {isInstalling ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <Smartphone className="h-7 w-7" />
                )}
              </div>

              <h2 className="mt-4 font-display text-lg font-bold text-foreground">
                {accepted
                  ? "Instalação enviada ao Android"
                  : "Instale o Ronnei na Veia"}
              </h2>

              {accepted ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    O navegador aceitou a solicitação.
                    Aguarde alguns segundos e procure
                    <strong className="text-foreground">
                      {" "}Ronnei na Veia{" "}
                    </strong>
                    na tela inicial ou na lista de aplicativos.
                  </p>

                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                    <p className="text-xs leading-relaxed text-amber-100/80">
                      Se o ícone não aparecer, o Android/Chrome
                      não concluiu o WebAPK. Use o instalador de
                      compatibilidade abaixo.
                    </p>
                  </div>

                  <button
                    onClick={openCompatibility}
                    className="btn-fire mt-4 w-full py-3 text-xs font-bold uppercase tracking-wider"
                  >
                    Abrir instalador de compatibilidade
                  </button>

                  <button
                    onClick={close}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs font-medium text-foreground"
                  >
                    Fechar
                  </button>
                </>
              ) : ios ? (
                <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 text-xs">
                    <Share className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Abra no Safari e toque em
                      <strong> Compartilhar</strong>.
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <PlusSquare className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Escolha
                      <strong> Adicionar à Tela de Início</strong>.
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    O navegador abrirá o instalador oficial do sistema.
                  </p>

                  {installError && (
                    <div className="mt-4 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                      <p className="text-xs text-red-100/80">
                        {installError}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="btn-fire mt-6 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Abrindo instalação
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Instalar aplicativo
                      </>
                    )}
                  </button>

                  <button
                    onClick={openCompatibility}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs font-medium text-foreground"
                  >
                    Problemas para instalar?
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
