import { useState } from "react";
import {
  useListLoans,
  useApproveLoan,
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
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useStepUpAction } from "@/lib/step-up";

function loanStatusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    admin_approved: "outline",
    auditor_approved: "outline",
    super_admin_approved: "outline",
    disbursed: "default",
    rejected: "destructive",
  };
  return (
    <Badge variant={map[status] || "secondary"} className="text-xs">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function canApprove(role: string, status: string): boolean {
  if (role === "admin" && status === "pending") return true;
  if (role === "financial_auditor" && status === "admin_approved") return true;
  if (role === "super_admin" && (status === "pending" || status === "admin_approved" || status === "auditor_approved")) return true;
  return false;
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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveLoan = useApproveLoan();
  const rejectLoan = useRejectLoan();
  const disburseLoan = useDisburseLoan();

  const approveWithStepUp = useStepUpAction((id: number) =>
    approveLoan.mutateAsync({ id, data: {} }),
  );
  const rejectWithStepUp = useStepUpAction((id: number, notes: string) =>
    rejectLoan.mutateAsync({ id, data: { notes } }),
  );
  const disburseWithStepUp = useStepUpAction((id: number, phrase: string) =>
    disburseLoan.mutateAsync({ id, data: { confirmationPhrase: phrase } }),
  );

  async function handleApprove() {
    try {
      await approveWithStepUp(loan.id);
      toast({ title: "Loan approved" });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey({}) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleReject() {
    try {
      await rejectWithStepUp(loan.id, rejectReason);
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

  return (
    <div className="border rounded-lg" data-testid={`loan-row-${loan.id}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{loan.memberName}</span>
            {loanStatusBadge(loan.status)}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCurrency(loan.amount)} &bull; {loan.tenureMonths}m &bull; Applied {formatDate(loan.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canApprove(role, loan.status) && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApprove(); }} disabled={approveLoan.isPending} data-testid={`button-approve-${loan.id}`}>
              <CheckCircle className="w-4 h-4 mr-1" />
              Approve
            </Button>
          )}
          {canDisburse(role, loan.status) && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleDisburse(); }} disabled={disburseLoan.isPending} data-testid={`button-disburse-${loan.id}`}>
              Disburse
            </Button>
          )}
          {canReject(role, loan.status) && (
            <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); setRejectDialogOpen(true); }} data-testid={`button-reject-${loan.id}`}>
              <XCircle className="w-4 h-4 mr-1" />
              Reject
            </Button>
          )}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {open && (
        <div className="border-t p-4 space-y-3 bg-muted/30 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><p className="text-muted-foreground">Principal</p><p className="font-medium">{formatCurrency(loan.amount)}</p></div>
            <div><p className="text-muted-foreground">Interest</p><p className="font-medium">{formatCurrency(loan.interestAmount)}</p></div>
            <div><p className="text-muted-foreground">Total Repayable</p><p className="font-medium">{formatCurrency(loan.totalRepayable)}</p></div>
            <div><p className="text-muted-foreground">Monthly Payment</p><p className="font-medium">{formatCurrency(loan.monthlyRepayment)}</p></div>
          </div>
          {loan.purpose && <p className="text-muted-foreground">Purpose: {loan.purpose}</p>}
          <div className="grid grid-cols-2 gap-2">
            {loan.adminApprovedAt && <p className="text-xs text-muted-foreground">Admin approved: {formatDate(loan.adminApprovedAt)}</p>}
            {loan.auditorApprovedAt && <p className="text-xs text-muted-foreground">Auditor approved: {formatDate(loan.auditorApprovedAt)}</p>}
            {loan.superAdminApprovedAt && <p className="text-xs text-muted-foreground">Super admin approved: {formatDate(loan.superAdminApprovedAt)}</p>}
            {loan.disbursedAt && <p className="text-xs text-muted-foreground">Disbursed: {formatDate(loan.disbursedAt)}</p>}
          </div>
          {loan.rejectionReason && (
            <p className="text-destructive text-xs">Rejection reason: {loan.rejectionReason}</p>
          )}
        </div>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Loan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide a reason for rejection (optional):</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason..."
              data-testid="input-rejection-reason"
            />
            <Button variant="destructive" className="w-full" onClick={handleReject} disabled={rejectLoan.isPending} data-testid="button-confirm-reject">
              Confirm Rejection
            </Button>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Loans</h1>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48" data-testid="select-loan-status-filter">
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

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !loans || loans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">No loans found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan: any) => <LoanRow key={loan.id} loan={loan} role={role} />)}
        </div>
      )}
    </div>
  );
}
