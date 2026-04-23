import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequestStepUpCode, useVerifyStepUpCode } from "@workspace/api-client-react";
import { ShieldCheck } from "lucide-react";

type ResolveFn = (verified: boolean) => void;

type Ctx = {
  prompt: () => Promise<boolean>;
};

const StepUpContext = createContext<Ctx | null>(null);

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<ResolveFn | null>(null);

  const requestCode = useRequestStepUpCode();
  const verifyCode = useVerifyStepUpCode();

  const sendCode = useCallback(async () => {
    setError(null);
    setSentTo(null);
    try {
      const r = await requestCode.mutateAsync();
      setSentTo(r.sentTo);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to send code");
    }
  }, [requestCode]);

  const prompt = useCallback(async () => {
    setCode("");
    setError(null);
    setOpen(true);
    void sendCode();
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [sendCode]);

  const finish = (verified: boolean) => {
    setOpen(false);
    setCode("");
    setError(null);
    setSentTo(null);
    resolverRef.current?.(verified);
    resolverRef.current = null;
  };

  const handleVerify = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    try {
      await verifyCode.mutateAsync({ data: { code } });
      finish(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Invalid or expired code. Try again.");
    }
  };

  return (
    <StepUpContext.Provider value={{ prompt }}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) finish(false); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-step-up">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Confirm it's you
            </DialogTitle>
            <DialogDescription>
              {sentTo
                ? `We emailed a 6-digit code to ${sentTo}. Enter it below to continue. The code expires in 10 minutes.`
                : error
                ? "We couldn't send the code. Click Resend to try again."
                : "Sending a 6-digit code to your email…"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center tracking-[0.5em] text-2xl font-mono"
              data-testid="input-step-up-code"
            />
            {error && (
              <p className="text-sm text-destructive" data-testid="text-step-up-error">{error}</p>
            )}
            <button
              type="button"
              onClick={sendCode}
              disabled={requestCode.isPending}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              data-testid="button-step-up-resend"
            >
              {requestCode.isPending ? "Sending…" : "Resend code"}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish(false)} data-testid="button-step-up-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              disabled={verifyCode.isPending || code.length !== 6}
              data-testid="button-step-up-verify"
            >
              {verifyCode.isPending ? "Verifying…" : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}

function useStepUpContext(): Ctx {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("StepUpProvider missing in tree");
  return ctx;
}

/**
 * Wraps a mutation function so that, if the API rejects with HTTP 403 +
 * `step_up_required`, we prompt the user for the email code, verify it,
 * then transparently retry the original call.
 */
export function useStepUpAction<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const { prompt } = useStepUpContext();
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (err: any) {
      const data = err?.response?.data;
      const status = err?.response?.status;
      if (status === 403 && data?.step_up_required) {
        const ok = await prompt();
        if (!ok) {
          const cancel: any = new Error("Verification cancelled");
          cancel.cancelled = true;
          throw cancel;
        }
        return await fn(...args);
      }
      throw err;
    }
  };
}
