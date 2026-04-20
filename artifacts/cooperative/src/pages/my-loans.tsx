import { useState } from "react";
import {
  useListMyLoans,
  useCreateLoan,
  useCalculateLoan,
  useGetLoanRepayments,
  getListMyLoansQueryKey,
  getGetLoanRepaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, ChevronDown, ChevronUp } from "lucide-react";

const loanSchema = z.object({
  amount: z.number({ error: "Amount is required" }).positive(),
  tenureMonths: z.number({ error: "Tenure is required" }).int().min(1).max(60),
  purpose: z.string().optional(),
});

type LoanForm = z.infer<typeof loanSchema>;

function loanStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    admin_approved: { label: "Admin Approved", variant: "outline" },
    auditor_approved: { label: "Auditor Approved", variant: "outline" },
    super_admin_approved: { label: "Super Admin Approved", variant: "outline" },
    disbursed: { label: "Disbursed", variant: "default" },
    rejected: { label: "Rejected", variant: "destructive" },
  };
  const m = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function LoanDetailRow({ loan }: { loan: any }) {
  const [open, setOpen] = useState(false);
  const { data: repayments } = useGetLoanRepayments(loan.id, {
    query: { enabled: open, queryKey: getGetLoanRepaymentsQueryKey(loan.id) },
  });

  return (
    <div className="border rounded-lg">
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setOpen(!open)}
        data-testid={`loan-row-${loan.id}`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{formatCurrency(loan.amount)}</span>
            {loanStatusBadge(loan.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            {loan.tenureMonths} months &bull; Applied {formatDate(loan.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="font-semibold">{formatCurrency(loan.outstandingBalance)}</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {open && (
        <div className="border-t p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Principal</p>
              <p className="font-medium">{formatCurrency(loan.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Interest ({loan.interestRate}%)</p>
              <p className="font-medium">{formatCurrency(loan.interestAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Repayable</p>
              <p className="font-medium">{formatCurrency(loan.totalRepayable)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Monthly Payment</p>
              <p className="font-medium">{formatCurrency(loan.monthlyRepayment)}</p>
            </div>
          </div>

          {loan.purpose && (
            <div>
              <p className="text-muted-foreground text-sm">Purpose</p>
              <p className="text-sm">{loan.purpose}</p>
            </div>
          )}

          {loan.rejectionReason && (
            <div className="bg-destructive/10 p-3 rounded text-sm text-destructive">
              Rejection reason: {loan.rejectionReason}
            </div>
          )}

          <div>
            <h4 className="font-medium mb-2 text-sm">Repayment History</h4>
            {!repayments || repayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repayments recorded yet.</p>
            ) : (
              <div className="divide-y">
                {repayments.map((r) => (
                  <div key={r.id} className="flex justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{r.month} {r.year} &bull; {formatDate(r.createdAt)}</span>
                    <span className="font-medium">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MyLoansPage() {
  const { data: loans, isLoading } = useListMyLoans();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calcResult, setCalcResult] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLoan = useCreateLoan();
  const calcLoan = useCalculateLoan();

  const form = useForm<LoanForm>({
    resolver: zodResolver(loanSchema),
    defaultValues: { amount: 0, tenureMonths: 12, purpose: "" },
  });

  const amount = form.watch("amount");
  const tenureMonths = form.watch("tenureMonths");

  function handleCalculate() {
    if (amount > 0 && tenureMonths > 0) {
      calcLoan.mutate(
        { data: { amount, tenureMonths } },
        { onSuccess: (result) => setCalcResult(result) },
      );
    }
  }

  function onSubmit(data: LoanForm) {
    createLoan.mutate(
      { data: { amount: data.amount, tenureMonths: data.tenureMonths, purpose: data.purpose || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Loan application submitted", description: "Your application is under review." });
          queryClient.invalidateQueries({ queryKey: getListMyLoansQueryKey() });
          setDialogOpen(false);
          form.reset();
          setCalcResult(null);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to submit loan", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Loans</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-apply-loan">
              <PlusCircle className="w-4 h-4 mr-2" />
              Apply for Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Apply for a Loan</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Amount (₦)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-loan-amount"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tenureMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repayment Period (months)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-tenure-months"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose (optional)</FormLabel>
                      <FormControl>
                        <Input data-testid="input-loan-purpose" {...field} placeholder="e.g. School fees, Medical" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="button" variant="outline" className="w-full" onClick={handleCalculate} data-testid="button-calculate-loan">
                  Calculate
                </Button>

                {calcResult && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Interest (10% flat)</span>
                      <span>{formatCurrency(calcResult.interestAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Repayable</span>
                      <span className="font-semibold">{formatCurrency(calcResult.totalRepayable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly Payment</span>
                      <span className="font-semibold">{formatCurrency(calcResult.monthlyRepayment)}</span>
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={createLoan.isPending} data-testid="button-submit-loan">
                  {createLoan.isPending ? "Submitting..." : "Submit Application"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !loans || loans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No loan applications yet. Click "Apply for Loan" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => <LoanDetailRow key={loan.id} loan={loan} />)}
        </div>
      )}
    </div>
  );
}
