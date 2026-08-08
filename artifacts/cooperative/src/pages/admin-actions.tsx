import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/format";
import { Gift, BarChart3, CheckCircle2, AlertTriangle, Loader2, Trash2, Send, Clock, X } from "lucide-react";
import { useStepUpAction } from "@/lib/step-up";
import { useToast } from "@/hooks/use-toast";
import { useGetProfile } from "@workspace/api-client-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const currentYear = new Date().getFullYear();

// ── API helpers ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PayoutResult {
  count: number;
  totalPaidOut: number;
  month: string;
  year: number;
  message?: string;
}

interface CreditResult {
  count: number;
  totalCredited: number;
  amount: number;
  year: number;
  message?: string;
}

// ── Christmas payout section ─────────────────────────────────────────────────

function ChristmasPayoutSection() {
  const { toast } = useToast();
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>(String(currentYear));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<PayoutResult | null>(null);

  // Dry-run preview — fetches once the confirmation dialog opens.
  const preview = useQuery({
    queryKey: ["admin", "christmas-payout", "preview"],
    queryFn: () =>
      apiGet<{ count: number; totalWouldPayout: number }>(
        "/api/admin/christmas-payout/preview",
      ),
    enabled: confirmOpen,
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (data: { month: string; year: number }) =>
      apiPost<PayoutResult>("/api/admin/christmas-payout", data),
    onSuccess: (data) => {
      setLastResult(data);
      setConfirmOpen(false);
      toast({
        title: "Christmas Savings payout processed",
        description:
          data.count > 0
            ? `${data.count} member${data.count === 1 ? "" : "s"} paid out — ${formatCurrency(data.totalPaidOut)} total.`
            : data.message ?? "No eligible members found.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Payout failed", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = month && parseInt(year) >= 2020;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <CardTitle className="text-base">Christmas Savings Payout</CardTitle>
            <CardDescription className="mt-0.5">
              Disburse Christmas Savings balances to all eligible active members and zero
              their Christmas balance. This action cannot be undone.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {lastResult && lastResult.count > 0 && (
          <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 bg-emerald-500/5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Last payout: <strong>{lastResult.count}</strong> member
              {lastResult.count === 1 ? "" : "s"} received{" "}
              <strong>{formatCurrency(lastResult.totalPaidOut)}</strong> total (
              {lastResult.month} {lastResult.year}).
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Payout Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month…" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 bg-amber-500/5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          All active members with a Christmas Savings balance &gt; ₦0 will be paid out and
          their balance reset to ₦0. Confirm carefully before proceeding.
        </div>

        <Button
          disabled={!canSubmit || mutation.isPending}
          onClick={() => setConfirmOpen(true)}
          className="w-full sm:w-auto"
        >
          {mutation.isPending ? "Processing…" : "Process Payout"}
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Christmas Savings Payout</AlertDialogTitle>
            <AlertDialogDescription>
              This will pay out all active members' Christmas Savings balances for{" "}
              <strong>{month} {year}</strong> and reset each balance to ₦0. This action
              cannot be undone.
            </AlertDialogDescription>

            {/* Dry-run preview */}
            <div className="mt-2">
              {preview.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Calculating preview…
                </div>
              ) : preview.data ? (
                <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                  <span className="font-semibold">
                    {preview.data.count} eligible member{preview.data.count === 1 ? "" : "s"}
                  </span>
                  {" · "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(preview.data.totalWouldPayout)} total
                  </span>
                  {" would be paid out."}
                </div>
              ) : null}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mutation.mutate({ month, year: parseInt(year) })}
              className="bg-red-600 hover:bg-red-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Processing…" : "Confirm Payout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Shares credit section ─────────────────────────────────────────────────────

function SharesCreditSection() {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("");
  const [year, setYear] = useState<string>(String(currentYear));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<CreditResult | null>(null);

  const parsedAmount = parseFloat(amount);
  const canSubmit = !isNaN(parsedAmount) && parsedAmount > 0 && parseInt(year) >= 2020;

  // Dry-run preview — fetches when dialog opens and amount is valid.
  const preview = useQuery({
    queryKey: ["admin", "shares-credit", "preview", parsedAmount],
    queryFn: () =>
      apiGet<{ count: number; totalWouldCredit: number }>(
        `/api/admin/shares-credit/preview?amount=${parsedAmount}`,
      ),
    enabled: confirmOpen && canSubmit,
    staleTime: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (data: { amount: number; year: number }) =>
      apiPost<CreditResult>("/api/admin/shares-credit", data),
    onSuccess: (data) => {
      setLastResult(data);
      setConfirmOpen(false);
      toast({
        title: "Share Capital credit applied",
        description:
          data.count > 0
            ? `${formatCurrency(data.amount)} credited to ${data.count} member${data.count === 1 ? "" : "s"} — ${formatCurrency(data.totalCredited)} total.`
            : data.message ?? "No active members found.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Credit failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-base">Annual Share Capital Credit</CardTitle>
            <CardDescription className="mt-0.5">
              Credit the specified amount to all active members' Share Capital balance for
              the selected year. Each member receives the same amount.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {lastResult && lastResult.count > 0 && (
          <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 bg-emerald-500/5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Last credit: <strong>{formatCurrency(lastResult.amount)}</strong> per member ×{" "}
              <strong>{lastResult.count}</strong> members ={" "}
              <strong>{formatCurrency(lastResult.totalCredited)}</strong> total ({lastResult.year}).
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Amount per Member (₦)</Label>
            <Input
              type="number"
              min={1}
              step={0.01}
              placeholder="e.g. 66375"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        {canSubmit && (
          <p className="text-xs text-muted-foreground">
            Each active member will receive{" "}
            <strong className="text-foreground">{formatCurrency(parsedAmount)}</strong>{" "}
            added to their Share Capital balance.
          </p>
        )}

        <Button
          disabled={!canSubmit || mutation.isPending}
          onClick={() => setConfirmOpen(true)}
          className="w-full sm:w-auto"
        >
          {mutation.isPending ? "Processing…" : "Apply Share Credit"}
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Share Capital Credit</AlertDialogTitle>
            <AlertDialogDescription>
              This will credit{" "}
              <strong>{formatCurrency(parsedAmount)}</strong> to every active member's Share
              Capital balance for <strong>{year}</strong>. This action cannot be undone.
            </AlertDialogDescription>

            {/* Dry-run preview */}
            <div className="mt-2">
              {preview.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Calculating preview…
                </div>
              ) : preview.data ? (
                <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                  <span className="font-semibold">{preview.data.count} active members</span>
                  {" · "}
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {formatCurrency(preview.data.totalWouldCredit)} total
                  </span>
                  {" would be credited."}
                </div>
              ) : null}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mutation.mutate({ amount: parsedAmount, year: parseInt(year) })}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Processing…" : "Confirm Credit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Reset all data section ───────────────────────────────────────────────────

function ResetDataSection() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const doReset = useStepUpAction(() =>
    apiPost<{ ok: boolean; message: string }>("/api/admin/reset-all-data", { confirm: "RESET" }),
  );

  const previewQuery = useQuery({
    queryKey: ["admin", "reset-preview"],
    queryFn: () => apiGet<{ memberCount: number; txCount: number; uploadCount: number }>("/api/admin/reset-all-data/preview"),
    enabled: open,
    staleTime: 5_000,
    retry: false,
  });

  const [resetting, setResetting] = useState(false);
  const canConfirm = confirmText === "RESET" && !resetting;

  async function handleReset() {
    setResetting(true);
    try {
      const data = await doReset();
      setOpen(false);
      setConfirmText("");
      toast({ title: "Data reset complete", description: data.message });
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-base text-destructive">Reset All Balance Data</CardTitle>
            <CardDescription className="mt-0.5">
              Wipes all transactions, upload records and opening balances. Resets every
              member's balances to zero and restores loan outstanding amounts to their
              original disbursed values. Use before importing a fresh balance snapshot.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/30 rounded-lg px-3 py-2.5 bg-destructive/5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Irreversible.</strong> This deletes the entire financial history for all
            organisations. Make sure you have a backup before proceeding.
          </span>
        </div>

        <Button
          variant="destructive"
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto"
        >
          Reset All Data…
        </Button>
      </CardContent>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Reset All Balance Data</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will permanently delete <strong>all</strong> transaction history, upload
                  records and opening balances, and set every member's balance columns to{" "}
                  <strong>₦0</strong>. Individual loan outstanding balances will be restored to
                  their original disbursed amounts.
                </p>
                {previewQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Calculating…
                  </div>
                ) : previewQuery.data ? (
                  <div className="rounded-lg bg-muted px-3 py-2.5 text-xs space-y-0.5">
                    <p><strong>{previewQuery.data.txCount.toLocaleString()}</strong> transactions will be deleted</p>
                    <p><strong>{previewQuery.data.uploadCount.toLocaleString()}</strong> upload records will be deleted</p>
                    <p><strong>{previewQuery.data.memberCount.toLocaleString()}</strong> member balances will be zeroed</p>
                  </div>
                ) : null}
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="reset-confirm" className="text-foreground">
                    Type <strong>RESET</strong> to confirm
                  </Label>
                  <Input
                    id="reset-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="RESET"
                    className="font-mono"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm}
              onClick={(e) => { e.preventDefault(); void handleReset(); }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {resetting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Resetting…</> : "Reset All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Request data clear (admin role only) ─────────────────────────────────────

function RequestDataClearSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Check if there's already a pending request. Uses the admin-accessible
  // status endpoint (not the super-admin-only /pending list).
  const statusQuery = useQuery({
    queryKey: ["admin", "data-clear-request-status"],
    queryFn: () => apiGet<{ pending: boolean; request: { id: number; createdAt: string; reason: string | null; requesterName: string } | null }>("/api/admin/data-clear-request/status"),
    staleTime: 30_000,
  });

  const hasPending = statusQuery.data?.pending ?? false;
  const myPending = statusQuery.data?.request ?? null;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await apiPost("/api/admin/request-data-clear", { reason: reason.trim() || undefined });
      toast({
        title: "Request submitted",
        description: "All super admins have been notified by email. The request will stay open until one of them approves or rejects it.",
      });
      setOpen(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-request-status"] });
    } catch (err: any) {
      // 409 means a request is already pending — refresh status to show it.
      if (err.message?.includes("already pending")) {
        queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-request-status"] });
      }
      toast({ title: "Could not submit request", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-base text-destructive">Reset All Balance Data</CardTitle>
            <CardDescription className="mt-0.5">
              Wipes all transactions, upload records and opening balances. Resets every
              member's balances to zero. Because this is irreversible, a super admin must
              approve the request before it runs.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/30 rounded-lg px-3 py-2.5 bg-destructive/5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Irreversible.</strong> Once a super admin approves this request, all financial
            history for all organisations will be permanently deleted. Make sure you have a backup
            before requesting.
          </span>
        </div>

        {hasPending && myPending ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              <Clock className="w-4 h-4" />
              Request pending super-admin review
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Submitted {new Date(myPending.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
              {myPending.reason ? ` Reason: "${myPending.reason}"` : ""}
            </p>
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            className="w-full sm:w-auto gap-2"
            disabled={statusQuery.isLoading}
          >
            <Send className="w-3.5 h-3.5" />
            Request Data Reset…
          </Button>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Request Data Reset</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will send a notification to all super admins asking them to approve a full
                  data wipe. The reset will only run once a super admin confirms it.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="clear-reason">Reason <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="clear-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this reset needed?"
                    rows={3}
                    maxLength={500}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => { e.preventDefault(); void handleSubmit(); }}
              className="bg-destructive hover:bg-destructive/90 text-white gap-2"
            >
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</> : <><Send className="w-3.5 h-3.5" />Send Request</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Pending clear requests banner (super_admin only) ──────────────────────────

function PendingClearRequestsBanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const pendingQuery = useQuery({
    queryKey: ["admin", "data-clear-requests-pending"],
    queryFn: () => apiGet<{ requests: any[] }>("/api/admin/data-clear-requests/pending"),
    staleTime: 30_000,
  });

  const doApprove = useStepUpAction((id: number) =>
    apiPost<{ ok: boolean; message: string }>(`/api/admin/data-clear-requests/${id}/approve`, {}),
  );

  const requests = pendingQuery.data?.requests ?? [];
  if (requests.length === 0) return null;

  async function handleApprove(id: number) {
    try {
      const result = await doApprove(id);
      toast({ title: "Data wiped", description: result.message });
      queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-request-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reset-preview"] });
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleReject(id: number) {
    try {
      await apiPost(`/api/admin/data-clear-requests/${id}/reject`, { reason: rejectReason.trim() || undefined });
      toast({ title: "Request rejected" });
      setRejectOpen(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "data-clear-request-status"] });
    } catch (err: any) {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <>
      {requests.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10 p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Pending data-clear request
              </span>
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Awaiting your approval</Badge>
            </div>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>

          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{r.requesterName}</strong> has requested a full data reset.
            {r.reason ? <> Reason: <em>"{r.reason}"</em></> : " No reason given."}
          </p>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => handleApprove(r.id)}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve &amp; Wipe Data
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setActiveId(r.id); setRejectOpen(true); }}
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </Button>
          </div>
        </div>
      ))}

      <AlertDialog open={rejectOpen} onOpenChange={(v) => { setRejectOpen(v); if (!v) setRejectReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject data-clear request</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>The requesting admin will be notified by email that their request was rejected.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="reject-reason">Reason <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why are you rejecting this?"
                    rows={2}
                    maxLength={500}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleReject(activeId!); }}>
              Reject Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminActionsPage() {
  const { data: profile } = useGetProfile();
  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Admin Actions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Balance events set by the admin rather than uploaded from payroll files.
          Only treasurers and super admins can perform these actions.
        </p>
      </div>

      {/* Pending requests banner — super admins only */}
      {isSuperAdmin && <PendingClearRequestsBanner />}

      <ChristmasPayoutSection />
      <SharesCreditSection />

      {/* Super admins can wipe directly; regular admins submit a request */}
      {isSuperAdmin ? <ResetDataSection /> : <RequestDataClearSection />}
    </div>
  );
}
