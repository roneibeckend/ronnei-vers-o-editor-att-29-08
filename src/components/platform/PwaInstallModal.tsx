import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share, PlusSquare, X, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useIsMobile } from "@/hooks/use-mobile";

const STORAGE_KEY = "pwa-install-modal-seen";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Popup de instalação exibido no primeiro acesso do aluno em mobile,
 * quando o app ainda não foi instalado (não está em modo standalone).
 */
export function PwaInstallModal() {
  const { isStandalone, canInstall, installPwa } = usePwaInstall();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ios = isIos();

  useEffect(() => {
    if (!isMobile || isStandalone) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // iOS não emite beforeinstallprompt: mostramos instruções manuais.
    if (!canInstall && !ios) return;

    const timer = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(timer);
  }, [isMobile, isStandalone, canInstall, ios]);

  const close = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }
  };

  const handleInstall = async () => {
    await installPwa();
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/60"
          >
            <div className="relative bg-primary/10 p-6">
              <button
                onClick={close}
                aria-label="Fechar"
                className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Smartphone className="h-7 w-7" />
              </div>

              <h2 className="mt-4 font-display text-lg font-bold text-foreground">
                Instale o app na tela inicial
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Acesse seus cursos, e-books e materiais com um toque — mais rápido, em tela
                cheia e sem precisar abrir o navegador.
              </p>

              {ios && !canInstall ? (
                <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 text-xs text-foreground">
                    <Share className="h-4 w-4 shrink-0 text-primary" />
                    <span>1. Toque em <strong>Compartilhar</strong> na barra do Safari</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground">
                    <PlusSquare className="h-4 w-4 shrink-0 text-primary" />
                    <span>2. Escolha <strong>Adicionar à Tela de Início</strong></span>
                  </div>
                  <button
                    onClick={close}
                    className="btn-fire w-full py-2 text-xs font-bold uppercase tracking-wider"
                  >
                    Entendi
                  </button>
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-2">
                  <button
                    onClick={handleInstall}
                    className="btn-fire flex w-full items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider"
                  >
                    <Download className="h-4 w-4" />
                    Instalar agora
                  </button>
                  <button
                    onClick={close}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-white/10"
                  >
                    Agora não
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
