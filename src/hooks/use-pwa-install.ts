import {
  useCallback,
  useEffect,
  useState,
} from "react";

interface BeforeInstallPromptEvent
  extends Event {
  readonly platforms: string[];

  readonly userChoice: Promise<{
    outcome:
      | "accepted"
      | "dismissed";
    platform: string;
  }>;

  prompt(): Promise<void>;
}

type InstallResult =
  | "installed"
  | "accepted"
  | "dismissed"
  | "redirected"
  | "error";

function standaloneNow() {
  if (
    typeof window === "undefined"
  ) {
    return false;
  }

  return (
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||
    Boolean(
      (
        window.navigator as Navigator & {
          standalone?: boolean;
        }
      ).standalone
    ) ||
    document.referrer.startsWith(
      "android-app://"
    )
  );
}

function globalPrompt():
  | BeforeInstallPromptEvent
  | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  return (
    (
      window as typeof window & {
        __RNV_PWA_PROMPT__?:
          BeforeInstallPromptEvent | null;
      }
    ).__RNV_PWA_PROMPT__ || null
  );
}

function clearGlobalPrompt() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  (
    window as typeof window & {
      __RNV_PWA_PROMPT__?:
        BeforeInstallPromptEvent | null;
    }
  ).__RNV_PWA_PROMPT__ = null;
}

export function usePwaInstall() {
  const [
    deferredPrompt,
    setDeferredPrompt,
  ] =
    useState<
      BeforeInstallPromptEvent | null
    >(null);

  const [
    isStandalone,
    setIsStandalone,
  ] =
    useState(false);

  const [
    isInstalling,
    setIsInstalling,
  ] =
    useState(false);

  const [
    installError,
    setInstallError,
  ] =
    useState<string | null>(null);

  const [
    isDismissed,
    setIsDismissed,
  ] =
    useState(true);

  useEffect(() => {
    const refreshState = () => {
      setIsStandalone(
        standaloneNow()
      );

      setDeferredPrompt(
        globalPrompt()
      );

      try {
        setIsDismissed(
          Boolean(
            localStorage.getItem(
              "pwa-prompt-dismissed"
            )
          )
        );
      } catch {
        setIsDismissed(false);
      }
    };

    refreshState();

    const onReady = () => {
      setDeferredPrompt(
        globalPrompt()
      );

      setInstallError(null);
    };

    const onInstalled = () => {
      clearGlobalPrompt();

      setDeferredPrompt(null);

      setIsStandalone(
        standaloneNow()
      );

      setIsInstalling(false);
    };

    const media =
      window.matchMedia(
        "(display-mode: standalone)"
      );

    const onDisplayChange = () => {
      setIsStandalone(
        standaloneNow()
      );
    };

    window.addEventListener(
      "rnv-pwa-ready",
      onReady
    );

    window.addEventListener(
      "appinstalled",
      onInstalled
    );

    media.addEventListener?.(
      "change",
      onDisplayChange
    );

    return () => {
      window.removeEventListener(
        "rnv-pwa-ready",
        onReady
      );

      window.removeEventListener(
        "appinstalled",
        onInstalled
      );

      media.removeEventListener?.(
        "change",
        onDisplayChange
      );
    };
  }, []);

  const installPwa =
    useCallback(
      async (): Promise<InstallResult> => {
        if (
          typeof window ===
          "undefined"
        ) {
          return "error";
        }

        if (standaloneNow()) {
          setIsStandalone(true);
          return "installed";
        }

        const prompt =
          deferredPrompt ||
          globalPrompt();

        // Se o React perdeu o evento ou
        // o navegador não o oferece,
        // usamos o instalador estático.
        if (!prompt) {
          window.location.assign(
            "/install-app.html"
          );

          return "redirected";
        }

        setIsInstalling(true);
        setInstallError(null);

        try {
          await prompt.prompt();

          const choice =
            await prompt.userChoice;

          clearGlobalPrompt();
          setDeferredPrompt(null);

          if (
            choice.outcome ===
            "accepted"
          ) {
            setIsInstalling(false);

            // Não fingimos que o WebAPK
            // terminou. A partir daqui a
            // instalação pertence ao Android.
            return "accepted";
          }

          setIsInstalling(false);

          try {
            localStorage.setItem(
              "pwa-prompt-dismissed",
              Date.now().toString()
            );
          } catch {
            // ignore
          }

          return "dismissed";
        } catch (error) {
          console.error(
            "[RNV PWA] Prompt:",
            error
          );

          clearGlobalPrompt();
          setDeferredPrompt(null);

          setIsInstalling(false);

          setInstallError(
            "O navegador não conseguiu abrir a instalação."
          );

          return "error";
        }
      },
      [deferredPrompt]
    );

  const dismissPrompt =
    useCallback(() => {
      try {
        localStorage.setItem(
          "pwa-prompt-dismissed",
          Date.now().toString()
        );
      } catch {
        // ignore
      }

      setIsDismissed(true);
    }, []);

  return {
    isVisible:
      !isStandalone &&
      !isDismissed &&
      Boolean(deferredPrompt),

    isStandalone,

    // Mantém a opção de instalação
    // disponível mesmo quando o evento
    // não chegou ao React. Nesse caso
    // abrimos /install-app.html.
    canInstall:
      !isStandalone,

    isInstalling,

    installError,

    installPwa,

    dismissPrompt,

    deferredPrompt,
  };
}
