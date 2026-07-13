import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  useRequestStepUpCode,
  useVerifyStepUpCode,
  useGetStepUpStatus,
  getGetStepUpStatusQueryKey,
} from "@workspace/api-client-react";
import { ShieldCheck, LogOut } from "lucide-react";

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
                ? `We emailed a 6-digit code to ${sentTo}. Enter it below to continue. The code expires in 15 minutes.`
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

/**
 * Forces email-OTP verification immediately after Clerk sign-in. Renders a
 * full-screen blocking screen with the same OTP form until the current Clerk
 * session has an active step-up grant on the server.
 */
export function StepUpGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = useGetStepUpStatus({
    query: { queryKey: getGetStepUpStatusQueryKey(), staleTime: 0, refetchOnWindowFocus: false },
  });
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestCode = useRequestStepUpCode();
  const verifyCode = useVerifyStepUpCode();
  const requestedRef = useRef(false);

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

  // Auto-send a code the first time the gate becomes visible.
  useEffect(() => {
    if (!isLoading && data && !data.active && !requestedRef.current) {
      requestedRef.current = true;
      void sendCode();
    }
  }, [isLoading, data, sendCode]);

  const handleVerify = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    try {
      await verifyCode.mutateAsync({ data: { code } });
      setCode("");
      requestedRef.current = false;
      await queryClient.invalidateQueries({ queryKey: getGetStepUpStatusQueryKey() });
      await refetch();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Invalid or expired code. Try again.");
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (data?.active) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg space-y-4" data-testid="screen-step-up-gate">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold">Verify it's you</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {sentTo
            ? `For your security, enter the 6-digit code we just emailed to ${sentTo}. The code expires in 15 minutes.`
            : error
            ? "We couldn't send the code. Click Resend to try again."
            : "Sending a 6-digit code to your email…"}
        </p>
        <Input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="text-center tracking-[0.5em] text-2xl font-mono"
          data-testid="input-gate-code"
        />
        {error && <p className="text-sm text-destructive" data-testid="text-gate-error">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={sendCode}
            disabled={requestCode.isPending}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            data-testid="button-gate-resend"
          >
            {requestCode.isPending ? "Sending…" : "Resend code"}
          </button>
          <Button
            onClick={handleVerify}
            disabled={verifyCode.isPending || code.length !== 6}
            data-testid="button-gate-verify"
          >
            {verifyCode.isPending ? "Verifying…" : "Verify & continue"}
          </Button>
        </div>
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
            data-testid="button-gate-signout"
          >
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </div>
    </div>
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
