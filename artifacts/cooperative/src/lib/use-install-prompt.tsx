import { useCallback, useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type InstallPlatform = "android" | "ios" | "desktop" | "unsupported";

const DISMISS_KEY_PREFIX = "aacs-install-dismissed-at:";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "unsupported";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isIPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
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

export function useInstallPrompt(scopeKey: string = "anon") {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => detectStandalone());
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const platform = useMemo(detectPlatform, []);
  const storageKey = `${DISMISS_KEY_PREFIX}${scopeKey}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setDismissedAt(raw ? Number(raw) : null);
    } catch {
      setDismissedAt(null);
    }
  }, [storageKey]);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => setIsStandalone(detectStandalone());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mql?.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mql?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(storageKey, String(now));
    } catch {
      // ignore
    }
    setDismissedAt(now);
  }, [storageKey]);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unsupported"> => {
    if (!deferredPrompt) return "unsupported";
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "dismissed") {
        dismiss();
      }
      return choice.outcome;
    } catch {
      return "dismissed";
    }
  }, [deferredPrompt, dismiss]);

  const dismissedRecently =
    dismissedAt != null && Date.now() - dismissedAt < DISMISS_TTL_MS;

  const canPromptNative = !!deferredPrompt;
  const canShowIOSInstructions = platform === "ios" && !isStandalone;
  const eligible = !isStandalone && (canPromptNative || canShowIOSInstructions);
  const visible = eligible && !dismissedRecently;

  return {
    platform,
    isStandalone,
    canPromptNative,
    canShowIOSInstructions,
    visible,
    dismiss,
    promptInstall,
  };
}
