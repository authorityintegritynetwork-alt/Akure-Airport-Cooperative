import { useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInstallPrompt } from "@/lib/use-install-prompt";

interface InstallBannerProps {
  scopeKey?: string;
}

export function InstallBanner({ scopeKey = "anon" }: InstallBannerProps) {
  const {
    visible,
    canPromptNative,
    canShowIOSInstructions,
    promptInstall,
    dismiss,
  } = useInstallPrompt(scopeKey);
  const [iosOpen, setIosOpen] = useState(false);

  if (!visible) return null;

  const handleInstall = async () => {
    if (canPromptNative) {
      await promptInstall();
      return;
    }
    if (canShowIOSInstructions) {
      setIosOpen(true);
    }
  };

  return (
    <>
      <div
        role="region"
        aria-label="Install Akure Cooperative app"
        data-testid="install-banner"
        className="sticky top-0 z-[60] w-full bg-gradient-to-r from-primary via-blue-700 to-sky-600 text-primary-foreground shadow-md"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2 sm:px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Download className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              Install the Akure Co-operative app
            </p>
            <p className="hidden truncate text-[11px] text-white/80 sm:block">
              Faster access to savings, loans and the store — works offline.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleInstall}
            data-testid="install-banner-cta"
            className="h-8 rounded-full bg-white px-3 text-xs font-semibold text-primary shadow-sm hover:bg-white/90"
          >
            Install
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            data-testid="install-banner-dismiss"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Sheet open={iosOpen} onOpenChange={setIosOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-border/60 px-5 pb-8 pt-5 sm:max-w-md sm:mx-auto"
          data-testid="install-banner-ios-sheet"
        >
          <SheetHeader className="text-left">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted" />
            <SheetTitle className="text-lg font-bold">
              Add to Home Screen
            </SheetTitle>
            <SheetDescription>
              Install the Akure Co-operative app on your iPhone or iPad in three
              quick steps.
            </SheetDescription>
          </SheetHeader>

          <ol className="mt-5 space-y-3">
            <li className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">
                  Tap the Share button
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  Look for <Share className="inline h-3.5 w-3.5" /> at the
                  bottom of Safari.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                2
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">
                  Choose “Add to Home Screen”
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  Scroll the share menu and tap{" "}
                  <Plus className="inline h-3.5 w-3.5" /> Add to Home Screen.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                3
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">
                  Tap Add in the top corner
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The app icon will appear on your Home Screen, ready to launch.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setIosOpen(false);
                dismiss();
              }}
              data-testid="install-banner-ios-not-now"
            >
              Not now
            </Button>
            <Button
              className="h-11 flex-1 rounded-xl"
              onClick={() => setIosOpen(false)}
              data-testid="install-banner-ios-done"
            >
              Got it
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
