import { useState } from "react";
import {
  useListLoans,
  useApproveLoan,
  useFastTrackApproveLoan,
  useRejectLoan,
  useDisburseLoan,
  useGetProfile,
  getListLoansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  AlertCircle,
  Zap,
} from "lucide-react";
import { useStepUpAction } from "@/lib/step-up";

function loanStatusPill(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    admin_approved: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
    auditor_approved: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    super_admin_approved: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    disbursed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
        map[status] || "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function canApprove(role: string, status: string): boolean {
  if (role === "admin" && status === "pending") return true;
  if (role === "financial_auditor" && status === "admin_approved") return true;
  if (role === "super_admin" && (status === "pending" || status === "admin_approved" || status === "auditor_approved")) return true;
  return false;
}

function canFastTrack(role: string, status: string): boolean {
  return (
    role === "super_admin" &&
    ["pending", "admin_approved", "auditor_approved"].includes(status)
  );
}

function canDisburse(role: string, status: string): boolean {
  return (role === "treasurer" || role === "super_admin") && status === "super_admin_approved";
}

function canReject(role: string, status: string): boolean {
  return (
    ["admin", "financial_auditor", "super_admin"].includes(role) &&
    ["pending", "admin_approved", "auditor_approved"].includes(status)
  );
}

function LoanRow({ loan, role }: { loan: any; role: string }) {
  const [open, setOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [fastTrackOpen, setFastTrackOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveLoan = useApproveLoan();
  const fastTrackLoan = useFastTrackApproveLoan();
  const rejectLoan = useRejectLoan();
  const disburseLoan = useDisburseLoan();

  const approveWithStepUp = useStepUpAction((id: number) =>
    approveLoan.mutateAsync({ id, data: {} }),
  );
  const fastTrackWithStepUp = useStepUpAction((id: number) =>
    fastTrackLoan.mutateAsync({ id, data: {} }),
  );
  const rejectWithStepUp = useStepUpAction((id: number, notes: string) =>
    rejectLoan.mutateAsync({ id, data: { notes } }),
  );
  const disburseWithStepUp = useStepUpAction((id: number, phrase: string) =>
    disburseLoan.mutateAsync({ id, data: { confirmationPhrase: phrase } }),
  );

  function patchLoanInCache(updated: any) {
    // Patch every cached list query for this endpoint regardless of filter params.
    const prefix = getListLoansQueryKey({})[0];
    queryClient.setQueriesData<any[]>({ queryKey: [prefix] }, (old) =>
      old?.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
    );
  }

  async function handleApprove() {
    try {
      const updated = await approveWithStepUp(loan.id);
      if (updated && (updated as any).id) patchLoanInCache(updated);
      toast({ title: "Loan approved" });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey({}) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleFastTrack() {
    try {
      const updated = await fastTrackWithStepUp(loan.id);
      if (updated && (updated as any).id) patchLoanInCache(updated);
      toast({
        title: "Loan fast-tracked",
        description: "The loan is now ready for disbursement.",
      });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey({}) });
      setFastTrackOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleReject() {
    try {
      const updated = await rejectWithStepUp(loan.id, rejectReason);
      if (updated && (updated as any).id) patchLoanInCache(updated);
      toast({ title: "Loan rejected" });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey({}) });
      setRejectDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleDisburse() {
    const expected = `DISBURSE-${loan.id}`;
    const phrase = window.prompt(
      `Disbursing ₦${loan.amount.toLocaleString()} to ${loan.memberName}.\n\nThis action moves money and cannot be undone.\nType the confirmation phrase below to authorize:\n\n${expected}`,
      "",
    );
    if (phrase == null) return;
    if (phrase.trim() !== expected) {
      toast({ title: "Disbursement cancelled", description: "Confirmation phrase did not match.", variant: "destructive" });
      return;
    }
    try {
      await disburseWithStepUp(loan.id, expected);
      toast({ title: "Loan disbursed" });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey({}) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const canA = canApprove(role, loan.status);
  const canFT = canFastTrack(role, loan.status);
  const canD = canDisburse(role, loan.status);
  const canR = canReject(role, loan.status);
  const hasAction = canA || canFT || canD || canR;
  const skippedStages: string[] = [];
  if (canFT) {
    if (!loan.adminApprovedAt) skippedStages.push("Admin approval");
    if (!loan.auditorApprovedAt) skippedStages.push("Auditor approval");
  }

  return (
    <div
      className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md"
      data-testid={`loan-row-${loan.id}`}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm truncate">{loan.memberName}</p>
              {loanStatusPill(loan.status)}
            </div>
            <p className="text-base font-bold tabular-nums mt-1">
              {formatCurrency(loan.amount)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              {loan.loanProductName && (
                <Badge
                  variant="secondary"
                  className="rounded-full text-[10px] px-2 py-0 h-4 font-semibold"
                >
                  {loan.loanProductName}
                </Badge>
              )}
              <span>
                {loan.tenureMonths}m · Applied {formatDate(loan.createdAt)}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="w-10 h-10 -m-1 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/30 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Principal</p>
              <p className="font-bold tabular-nums">{formatCurrency(loan.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Interest</p>
              <p className="font-bold tabular-nums">{formatCurrency(loan.interestAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Repayable</p>
              <p className="font-bold tabular-nums">{formatCurrency(loan.totalRepayable)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Monthly</p>
              <p className="font-bold tabular-nums">{formatCurrency(loan.monthlyRepayment)}</p>
            </div>
          </div>
          {loan.purpose && (
            <p className="text-xs"><span className="text-muted-foreground">Purpose:</span> {loan.purpose}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {loan.adminApprovedAt && <p className="text-[11px] text-muted-foreground">Admin approved: {formatDate(loan.adminApprovedAt)}</p>}
            {loan.auditorApprovedAt && <p className="text-[11px] text-muted-foreground">Auditor approved: {formatDate(loan.auditorApprovedAt)}</p>}
            {loan.superAdminApprovedAt && <p className="text-[11px] text-muted-foreground">Super admin approved: {formatDate(loan.superAdminApprovedAt)}</p>}
            {loan.disbursedAt && <p className="text-[11px] text-muted-foreground">Disbursed: {formatDate(loan.disbursedAt)}</p>}
          </div>
          {loan.rejectionReason && (
            <p className="text-destructive text-xs">
              <AlertCircle className="w-3 h-3 inline mr-1 -mt-0.5" />
              {loan.rejectionReason}
            </p>
          )}
        </div>
      )}

      {hasAction && (
        <div className="border-t border-border/50 p-2 flex flex-wrap gap-1.5 bg-muted/20">
          {canA && (
            <Button
              size="sm"
              className="flex-1 min-w-[110px] rounded-lg gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleApprove()}
              disabled={approveLoan.isPending}
              data-testid={`button-approve-${loan.id}`}
            >
              <CheckCircle className="w-4 h-4" /> Approve
            </Button>
          )}
          {canFT && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[140px] rounded-lg gap-1.5 h-9 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 hover:text-amber-700"
              onClick={() => setFastTrackOpen(true)}
              disabled={fastTrackLoan.isPending}
              data-testid={`button-fast-track-${loan.id}`}
            >
              <Zap className="w-4 h-4" /> Fast-track
            </Button>
          )}
          {canD && (
            <Button
              size="sm"
              className="flex-1 min-w-[110px] rounded-lg h-9 bg-primary hover:bg-primary/90"
              onClick={() => handleDisburse()}
              disabled={disburseLoan.isPending}
              data-testid={`button-disburse-${loan.id}`}
            >
              Disburse
            </Button>
          )}
          {canR && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[110px] rounded-lg gap-1.5 h-9 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setRejectDialogOpen(true)}
              data-testid={`button-reject-${loan.id}`}
            >
              <XCircle className="w-4 h-4" /> Reject
            </Button>
          )}
        </div>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Reject Loan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide a reason for rejection (optional):</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason..."
              className="rounded-xl"
              data-testid="input-rejection-reason"
            />
            <Button variant="destructive" className="w-full rounded-xl" onClick={handleReject} disabled={rejectLoan.isPending} data-testid="button-confirm-reject">
              Confirm Rejection
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fastTrackOpen} onOpenChange={setFastTrackOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </span>
              Fast-track approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 border border-border/60 p-3 text-sm space-y-1">
              <p className="font-semibold">{loan.memberName}</p>
              <p className="text-muted-foreground">
                {formatCurrency(loan.amount)} · {loan.tenureMonths} months
                {loan.loanProductName ? ` · ${loan.loanProductName}` : ""}
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will set the loan to <span className="font-semibold text-foreground">awaiting disbursement</span> in one step,
              bypassing the standard approval chain. Use this only for urgent or
              pre-vetted cases.
            </p>
            {skippedStages.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Stages that will be skipped:
                </p>
                <ul className="list-disc list-inside text-amber-700/90 dark:text-amber-200/90 space-y-0.5">
                  {skippedStages.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700/70 dark:text-amber-200/70 pt-1">
                  This action is logged in the audit trail with your name.
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setFastTrackOpen(false)}
                disabled={fastTrackLoan.isPending}
                data-testid={`button-cancel-fast-track-${loan.id}`}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleFastTrack}
                disabled={fastTrackLoan.isPending}
                data-testid={`button-confirm-fast-track-${loan.id}`}
              >
                {fastTrackLoan.isPending ? "Approving..." : "Yes, fast-track"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LoansAdminPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: profile } = useGetProfile();

  const params: any = {};
  if (statusFilter) params.status = statusFilter;

  const { data: loans, isLoading } = useListLoans(params, {
    query: { queryKey: getListLoansQueryKey(params) },
  });

  const role = profile?.role || "";

  // Action-needed counter (shown in hero)
  const actionableCount = (loans || []).filter((l: any) => {
    if (canApprove(role, l.status)) return true;
    if (canDisburse(role, l.status)) return true;
    return false;
  }).length;

  return (
    <div className="space-y-5">
      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="loans-admin-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />

        <div className="relative">
          <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
            Loan Approvals
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
            {actionableCount}
          </h1>
          <p className="text-xs text-white/80 mt-1">
            {actionableCount === 0
              ? "Nothing awaiting your action"
              : `Awaiting your action${
                  loans ? ` · ${loans.length} loan${loans.length === 1 ? "" : "s"} total` : ""
                }`}
          </p>
        </div>

        <div className="relative mt-5">
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger
              className="rounded-full bg-white/15 backdrop-blur-sm border-white/20 text-white h-10 [&>svg]:text-white/80 hover:bg-white/20"
              data-testid="select-loan-status-filter"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="admin_approved">Admin Approved</SelectItem>
              <SelectItem value="auditor_approved">Auditor Approved</SelectItem>
              <SelectItem value="super_admin_approved">Super Admin Approved</SelectItem>
              <SelectItem value="disbursed">Disbursed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : !loans || loans.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No loans found.</p>
            <p className="text-sm mt-1">Try adjusting the status filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan: any) => <LoanRow key={loan.id} loan={loan} role={role} />)}
        </div>
      )}
    </div>
  );
}
