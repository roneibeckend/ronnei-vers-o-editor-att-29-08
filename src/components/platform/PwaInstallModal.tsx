import {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  Globe,
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

import {
  useAuth,
} from "@/hooks/use-auth";

const STORAGE_KEY_BASE =
  "pwa-install-modal-seen";

function getPlatform() {
  if (typeof navigator === "undefined") {
    return { ios: false, android: false, safari: false, chrome: false, samsung: false, standalone: false };
  }

  const ua = navigator.userAgent || "";
  const ios = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);
  const safari = ios && /safari/i.test(ua) && !/crios|fxios|opios|edgios/i.test(ua);
  const chrome = (/chrome/i.test(ua) && !/edg|opr|samsungbrowser/i.test(ua)) || /crios/i.test(ua);
  const samsung = /samsungbrowser/i.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone) ||
    document.referrer.startsWith("android-app://");

  return { ios, android, safari, chrome, samsung, standalone };
}

export function PwaInstallModal() {
  const {
    isStandalone,
    canInstall,
    isInstalling,
    installError,
    installPwa,
  } = usePwaInstall();

  const isMobile = useIsMobile();
  const { user, isLoading } = useAuth();
  const platform = getPlatform();

  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const storageKey = user?.id
    ? `${STORAGE_KEY_BASE}-${user.id}`
    : STORAGE_KEY_BASE;

  useEffect(() => {
    if (
      !isMobile ||
      isStandalone ||
      !canInstall ||
      isLoading
    ) {
      return;
    }

    if (typeof window === "undefined") return;

    if (localStorage.getItem(storageKey)) return;

    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, [isMobile, isStandalone, canInstall, isLoading, storageKey]);

  useEffect(() => {
    if (isStandalone) setOpen(false);
  }, [isStandalone]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, Date.now().toString());
    } catch {
      // ignore
    }
  };

  const handleInstall = async () => {
    const result = await installPwa();
    if (result === "dismissed") {
      close();
      return;
    }
    if (result === "accepted") setAccepted(true);
    if (result === "installed") setOpen(false);
  };

  const openCompatibility = () => {
    window.location.assign("/install-app.html?fallback=1");
  };

  const copyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const openInSafari = () => {
    // iOS não permite abrir automaticamente no Safari a partir do Chrome.
    // A melhor alternativa é copiar o link e instruir o usuário a colar no Safari.
    copyCurrentUrl();
  };

  const renderIosSafariSteps = () => (
    <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        O Safari já pode instalar o app diretamente na sua tela inicial:
      </p>
      <Step number={1} icon={<Share className="h-4 w-4" />}>
        Toque no ícone <strong>Compartilhar</strong> na barra inferior do Safari.
      </Step>
      <Step number={2} icon={<PlusSquare className="h-4 w-4" />}>
        Role o menu e escolha <strong>Adicionar à Tela de Início</strong>.
      </Step>
      <Step number={3} icon={<Smartphone className="h-4 w-4" />}>
        Confirme em <strong>Adicionar</strong>. Pronto: o app estará na home.
      </Step>
    </div>
  );

  const renderIosChromeSteps = () => (
    <div className="mt-5 space-y-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
      <p className="text-xs leading-relaxed text-amber-100/80">
        No iPhone, o Chrome <strong>não pode instalar PWAs</strong> diretamente. A instalação só é possível pelo Safari.
      </p>
      <Step number={1} icon={<Copy className="h-4 w-4" />}>
        Copie o link atual para colar no Safari.
      </Step>
      <Step number={2} icon={<Globe className="h-4 w-4" />}>
        Abra o <strong>Safari</strong>, cole o link na barra de endereços e abra esta página.
      </Step>
      <Step number={3} icon={<Share className="h-4 w-4" />}>
        No Safari, toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.
      </Step>

      <button
        onClick={openInSafari}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 py-2.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20"
      >
        {copied ? (
          <>
            <CheckMini /> Link copiado — abra o Safari e cole
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copiar link para o Safari
          </>
        )}
      </button>
    </div>
  );

  const renderSamsungSteps = () => (
    <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Step number={1} icon={<Smartphone className="h-4 w-4" />}>
        Toque no botão de <strong>menu</strong> do Samsung Internet (três barras).
      </Step>
      <Step number={2} icon={<PlusSquare className="h-4 w-4" />}>
        Escolha <strong>Adicionar página a</strong> → <strong>Tela inicial</strong>.
      </Step>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-4 backdrop-blur-md sm:items-center"
          onClick={isInstalling ? undefined : close}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="glass w-full max-w-md overflow-hidden rounded-3xl border border-white/10 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/60"
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

              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-ember to-flame text-white shadow-lg shadow-ember/30">
                {isInstalling ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : accepted ? (
                  <Download className="h-8 w-8" />
                ) : (
                  <Smartphone className="h-8 w-8" />
                )}
              </div>

              <h2 className="mt-5 font-display text-xl font-bold text-foreground">
                {accepted
                  ? "Instalação solicitada"
                  : "Instale o Ronnei na Veia"}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {accepted
                  ? "O navegador aceitou a instalação. Em poucos segundos o ícone do app vai aparecer na sua tela inicial ou gaveta de apps."
                  : "Adicione o Ronnei na Veia à tela inicial para acessar seus cursos e receitas como um aplicativo nativo, sem precisar digitar o endereço toda vez."}
              </p>

              {accepted ? (
                <>
                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                    <p className="text-xs leading-relaxed text-amber-100/80">
                      Se o ícone não aparecer, o Android/Chrome não concluiu o WebAPK. Use o instalador de compatibilidade abaixo.
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
              ) : platform.ios && platform.safari ? (
                renderIosSafariSteps()
              ) : platform.ios && platform.chrome ? (
                renderIosChromeSteps()
              ) : platform.samsung ? (
                renderSamsungSteps()
              ) : (
                <>
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-3 text-xs">
                      <Download className="h-4 w-4 shrink-0 text-primary" />
                      <span>
                        O navegador abrirá o instalador oficial do sistema.
                      </span>
                    </div>
                  </div>

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

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  O app não ocupa espaço na loja e recebe atualizações automaticamente. Funciona em Android, iPhone e iPad.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({
  number,
  icon,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
        {number}
      </div>
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <span className="leading-relaxed text-foreground/90">{children}</span>
    </div>
  );
}

function CheckMini() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
