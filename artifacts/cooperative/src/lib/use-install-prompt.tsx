import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type InstallPlatform = "android" | "ios" | "desktop" | "unsupported";

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "unsupported";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isIPadOS =
    navigator.platform === "MacIntel" &&
    (navigator as any).maxTouchPoints > 1;
  if (isIOS || isIPadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

/**
 * Manages PWA install state.
 * The banner is NOT shown automatically — call `trigger()` to show it.
 * Dismissal is session-scoped (resets when the tab/browser is closed).
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() =>
    detectStandalone(),
  );
  const [bannerVisible, setBannerVisible] = useState(false);
  const platform = useMemo(detectPlatform, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setBannerVisible(false);
    };
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => {
      const standalone = detectStandalone();
      setIsStandalone(standalone);
      if (standalone) setBannerVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mql?.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mql?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const canPromptNative = !!deferredPrompt;
  const canShowIOSInstructions = platform === "ios" && !isStandalone;
  /** True when the device/browser supports installation and app isn't already installed. */
  const canInstall =
    !isStandalone && (canPromptNative || canShowIOSInstructions);

  const trigger = useCallback(() => {
    if (!isStandalone && (canPromptNative || canShowIOSInstructions)) {
      setBannerVisible(true);
    }
  }, [isStandalone, canPromptNative, canShowIOSInstructions]);

  const dismiss = useCallback(() => {
    setBannerVisible(false);
  }, []);

  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unsupported"
  > => {
    if (!deferredPrompt) return "unsupported";
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        setIsStandalone(true);
        setBannerVisible(false);
      }
      return choice.outcome;
    } catch {
      return "dismissed";
    }
  }, [deferredPrompt]);

  return {
    platform,
    isStandalone,
    canInstall,
    canPromptNative,
    canShowIOSInstructions,
    bannerVisible,
    trigger,
    dismiss,
    promptInstall,
  };
}
