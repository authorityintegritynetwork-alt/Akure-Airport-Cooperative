import { useState } from "react";
import {
  useListMyLoans,
  useCreateLoan,
  useCalculateLoan,
  useGetLoanRepayments,
  useListLoanProducts,
  getListMyLoansQueryKey,
  getGetLoanRepaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  PlusCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Banknote,
  Wallet,
  Tv,
  Stethoscope,
  Fuel,
  ShoppingBasket,
  Briefcase,
  Sparkles,
} from "lucide-react";

const PRODUCT_VISUAL: Record<
  string,
  { icon: React.ReactNode; gradient: string; ring: string }
> = {
  regular: {
    icon: <Wallet className="w-5 h-5" />,
    gradient: "from-blue-500/15 to-indigo-500/10",
    ring: "ring-blue-500/30",
  },
  electronics: {
    icon: <Tv className="w-5 h-5" />,
    gradient: "from-violet-500/15 to-purple-500/10",
    ring: "ring-violet-500/30",
  },
  emergency: {
    icon: <Stethoscope className="w-5 h-5" />,
    gradient: "from-rose-500/15 to-red-500/10",
    ring: "ring-rose-500/30",
  },
  fuel_venture: {
    icon: <Fuel className="w-5 h-5" />,
    gradient: "from-amber-500/15 to-orange-500/10",
    ring: "ring-amber-500/30",
  },
  provision: {
    icon: <ShoppingBasket className="w-5 h-5" />,
    gradient: "from-emerald-500/15 to-teal-500/10",
    ring: "ring-emerald-500/30",
  },
  commercial: {
    icon: <Briefcase className="w-5 h-5" />,
    gradient: "from-sky-500/15 to-cyan-500/10",
    ring: "ring-sky-500/30",
  },
};

function getProductVisual(code: string) {
  return (
    PRODUCT_VISUAL[code] ?? {
      icon: <Sparkles className="w-5 h-5" />,
      gradient: "from-slate-500/15 to-slate-500/5",
      ring: "ring-slate-500/30",
    }
  );
}

const loanSchema = z.object({
  loanProductId: z
    .number({ message: "Please choose a loan type" })
    .int()
    .positive(),
  amount: z.number({ message: "Amount is required" }).positive(),
  tenureMonths: z.number({ message: "Tenure is required" }).int().min(1).max(60),
  purpose: z.string().optional(),
});

type LoanForm = z.infer<typeof loanSchema>;

const STATUS_META: Record<
  string,
  {
    label: string;
    cls: string;
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: "Pending review",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: <Clock className="w-3 h-3" />,
  },
  admin_approved: {
    label: "Admin approved",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  auditor_approved: {
    label: "Auditor approved",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  super_admin_approved: {
    label: "Awaiting disbursement",
    cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  disbursed: {
    label: "Disbursed",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    icon: <Banknote className="w-3 h-3" />,
  },
  rejected: {
    label: "Rejected",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20",
    icon: <XCircle className="w-3 h-3" />,
  },
};

function LoanStatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || {
    label: status,
    cls: "bg-muted text-muted-foreground",
    icon: <Clock className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

function LoanCard({ loan }: { loan: any }) {
  const [open, setOpen] = useState(false);
  const { data: repayments } = useGetLoanRepayments(loan.id, {
    query: { enabled: open, queryKey: getGetLoanRepaymentsQueryKey(loan.id) },
  });

  const principal = Number(loan.amount) || 0;
  const outstanding = Number(loan.outstandingBalance) || 0;
  const totalRepayable = Number(loan.totalRepayable) || principal;
  const paid = Math.max(0, totalRepayable - outstanding);
  const percentPaid =
    totalRepayable > 0
      ? Math.min(100, Math.round((paid / totalRepayable) * 100))
      : 0;
  const isDisbursed = loan.status === "disbursed";

  return (
    <div
      className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden"
      data-testid={`loan-row-${loan.id}`}
    >
      <button
        type="button"
        className="w-full text-left p-4 active:bg-muted/40 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums">
                {formatCurrency(loan.amount)}
              </span>
              <LoanStatusPill status={loan.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
              {loan.loanProductName && (
                <Badge
                  variant="secondary"
                  className="rounded-full text-[10px] px-2 py-0 h-4 font-semibold"
                >
                  {loan.loanProductName}
                </Badge>
              )}
              <span>
                {loan.tenureMonths} months · Applied {formatDate(loan.createdAt)}
              </span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Outstanding
            </p>
            <p
              className={`font-bold tabular-nums text-base ${
                outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatCurrency(outstanding)}
            </p>
          </div>
        </div>

        {isDisbursed && (
          <div className="mt-3 space-y-1.5">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${percentPaid}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{percentPaid}% repaid</span>
              <span className="inline-flex items-center gap-1">
                {open ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                Details
              </span>
            </div>
          </div>
        )}

        {!isDisbursed && (
          <div className="mt-2 flex justify-end">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              {open ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Details
            </span>
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 space-y-4 bg-muted/30">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Principal" value={formatCurrency(loan.amount)} />
            <Stat
              label={`Interest (${loan.interestRate}%)`}
              value={formatCurrency(loan.interestAmount)}
            />
            <Stat
              label="Total repayable"
              value={formatCurrency(loan.totalRepayable)}
            />
            <Stat
              label="Monthly"
              value={formatCurrency(loan.monthlyRepayment)}
            />
          </div>

          {loan.purpose && (
            <div className="rounded-xl bg-card border border-border/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Purpose
              </p>
              <p className="text-sm mt-1">{loan.purpose}</p>
            </div>
          )}

          {loan.rejectionReason && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-700 dark:text-rose-300">
              <p className="font-semibold text-xs uppercase mb-1">
                Rejection reason
              </p>
              {loan.rejectionReason}
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-2 text-sm">Repayment history</h4>
            {!repayments || repayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No repayments recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border/50 rounded-xl bg-card border border-border/50 px-3">
                {repayments.map((r) => (
                  <div key={r.id} className="flex justify-between py-2 text-sm">
                    <span className="text-muted-foreground">
                      {r.month} {r.year} · {formatDate(r.createdAt)}
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.amount)}
                    </span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card border border-border/50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="font-semibold tabular-nums text-sm mt-0.5 truncate">
        {value}
      </p>
    </div>
  );
}

export function MyLoansPage() {
  const { data: loans, isLoading } = useListMyLoans();
  const { data: loanProducts } = useListLoanProducts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [calcResult, setCalcResult] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLoan = useCreateLoan();
  const calcLoan = useCalculateLoan();

  const form = useForm<LoanForm>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      loanProductId: undefined as unknown as number,
      amount: 0,
      tenureMonths: 12,
      purpose: "",
    },
  });

  function resetForm() {
    form.reset({
      loanProductId: undefined as unknown as number,
      amount: 0,
      tenureMonths: 12,
      purpose: "",
    });
  }

  function openDialog() {
    resetForm();
    setCalcResult(null);
    setStep(1);
    setDialogOpen(true);
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setStep(1);
      setCalcResult(null);
      resetForm();
    }
  }

  const amount = form.watch("amount");
  const tenureMonths = form.watch("tenureMonths");
  const selectedProductId = form.watch("loanProductId");
  const selectedProduct = (loanProducts ?? []).find(
    (p) => p.id === selectedProductId,
  );

  function handleSelectProduct(p: { id: number; defaultTenureMonths: number; maxTenureMonths: number }) {
    form.setValue("loanProductId", p.id, { shouldValidate: true });
    const current = form.getValues("tenureMonths");
    if (!current || current > p.maxTenureMonths) {
      form.setValue("tenureMonths", p.defaultTenureMonths);
    }
    setCalcResult(null);
  }

  function handleCalculate() {
    if (amount > 0 && tenureMonths > 0 && selectedProductId) {
      calcLoan.mutate(
        { data: { amount, tenureMonths, loanProductId: selectedProductId } },
        { onSuccess: (result) => setCalcResult(result) },
      );
    }
  }

  function onSubmit(data: LoanForm) {
    const product = (loanProducts ?? []).find(
      (p) => p.id === data.loanProductId,
    );
    if (!product) {
      form.setError("loanProductId", { message: "Please choose a loan type" });
      setStep(1);
      return;
    }
    if (data.tenureMonths > product.maxTenureMonths) {
      form.setError("tenureMonths", {
        message: `${product.name} allows up to ${product.maxTenureMonths} month${
          product.maxTenureMonths === 1 ? "" : "s"
        }.`,
      });
      return;
    }
    createLoan.mutate(
      {
        data: {
          amount: data.amount,
          tenureMonths: data.tenureMonths,
          purpose: data.purpose || undefined,
          loanProductId: data.loanProductId,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Loan application submitted",
            description: "Your application is under review.",
          });
          queryClient.invalidateQueries({
            queryKey: getListMyLoansQueryKey(),
          });
          setDialogOpen(false);
          form.reset();
          setCalcResult(null);
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message || "Failed to submit loan",
            variant: "destructive",
          });
        },
      },
    );
  }

  const totalOutstanding =
    loans?.reduce(
      (s, l) => s + (Number((l as any).outstandingBalance) || 0),
      0,
    ) ?? 0;
  const activeCount =
    loans?.filter((l: any) => l.status === "disbursed").length ?? 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">My Loans</h1>
        <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
          <Button
            type="button"
            data-testid="button-apply-loan"
            onClick={openDialog}
            className="rounded-full shadow-md shadow-primary/25 hidden md:inline-flex"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Apply for Loan
          </Button>
          <DialogContent className="sm:max-w-lg rounded-3xl p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setCalcResult(null);
                    }}
                    className="-ml-1.5 p-1.5 rounded-full hover:bg-muted active:scale-95 transition"
                    data-testid="button-back-to-products"
                    aria-label="Back to loan types"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <DialogTitle className="text-base font-semibold">
                  {step === 1 ? "Choose a loan" : "Loan details"}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                <span
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step >= 1 ? "bg-primary" : "bg-muted"
                  }`}
                />
                <span
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step >= 2 ? "bg-primary" : "bg-muted"
                  }`}
                />
              </div>
            </DialogHeader>

            {step === 1 && (
              <div
                className="px-5 py-4 space-y-2.5 max-h-[70vh] overflow-y-auto"
                data-testid="loan-product-picker"
              >
                <p className="text-xs text-muted-foreground pb-1">
                  Pick the option that best matches what you need the funds for.
                  You can compare rates and terms below.
                </p>
                {(loanProducts ?? []).map((p) => {
                  const v = getProductVisual(p.code);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        handleSelectProduct(p);
                        setStep(2);
                      }}
                      data-testid={`loan-product-${p.code}`}
                      className={`group w-full text-left rounded-2xl border border-border/60 p-3.5 bg-gradient-to-br ${v.gradient} hover:border-primary/50 hover:ring-2 ${v.ring} transition-all active:scale-[0.99]`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center text-foreground/80 shrink-0">
                          {v.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold leading-tight truncate">
                              {p.name}
                            </p>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                              {p.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 font-semibold"
                            >
                              {p.interestRate}% flat
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 font-medium"
                            >
                              Up to {p.maxTenureMonths} mo
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {(loanProducts ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No loan products are available right now.
                  </p>
                )}
              </div>
            )}

            {step === 2 && selectedProduct && (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto"
                >
                  {/* Selected product summary */}
                  <div
                    className={`rounded-2xl border border-border/60 p-3 bg-gradient-to-br ${getProductVisual(selectedProduct.code).gradient}`}
                    data-testid="selected-product-summary"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center text-foreground/80 shrink-0">
                        {getProductVisual(selectedProduct.code).icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          {selectedProduct.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {selectedProduct.interestRate}% flat · up to{" "}
                          {selectedProduct.maxTenureMonths} mo
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStep(1);
                          setCalcResult(null);
                        }}
                        className="text-[11px] font-semibold text-primary hover:underline"
                        data-testid="button-change-product"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Loan amount (₦)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            className="h-11 rounded-xl"
                            data-testid="input-loan-amount"
                            placeholder="e.g. 50000"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? 0
                                  : parseFloat(e.target.value),
                              )
                            }
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
                        <FormLabel className="flex items-center justify-between">
                          <span>Repayment period (months)</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            Max {selectedProduct.maxTenureMonths} mo
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={selectedProduct.maxTenureMonths}
                            className="h-11 rounded-xl"
                            data-testid="input-tenure-months"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? 0
                                  : parseInt(e.target.value),
                              )
                            }
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
                          <Input
                            className="h-11 rounded-xl"
                            data-testid="input-loan-purpose"
                            {...field}
                            placeholder="e.g. School fees, Medical"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl h-11"
                    onClick={handleCalculate}
                    disabled={
                      !amount ||
                      !tenureMonths ||
                      tenureMonths > selectedProduct.maxTenureMonths ||
                      calcLoan.isPending
                    }
                    data-testid="button-calculate-loan"
                  >
                    {calcLoan.isPending ? "Calculating..." : "Preview repayment"}
                  </Button>

                  {calcResult && (
                    <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3 text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Interest ({calcResult.interestRate}% flat)
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(calcResult.interestAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Total repayable
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(calcResult.totalRepayable)}
                        </span>
                      </div>
                      <div className="flex justify-between text-base pt-1.5 border-t border-primary/15">
                        <span className="font-semibold">Monthly payment</span>
                        <span className="font-bold tabular-nums text-primary">
                          {formatCurrency(calcResult.monthlyRepayment)}
                        </span>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full rounded-xl h-11"
                    disabled={createLoan.isPending}
                    data-testid="button-submit-loan"
                  >
                    {createLoan.isPending
                      ? "Submitting..."
                      : "Submit application"}
                  </Button>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Hero summary */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-violet-500/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(258 70% 35%) 0%, hsl(248 70% 45%) 50%, hsl(220 80% 50%) 100%)",
        }}
        data-testid="loans-hero"
      >
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/75 font-semibold uppercase tracking-wider">
              Total Outstanding
            </p>
            <p className="text-3xl sm:text-4xl font-bold mt-2 tabular-nums tracking-tight">
              {formatCurrency(totalOutstanding)}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {activeCount} active loan{activeCount === 1 ? "" : "s"} ·{" "}
              {loans?.length ?? 0} total
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : !loans || loans.length === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="text-center py-12">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <CreditCard className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No loan applications yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the + button below to apply for your first loan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <LoanCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}

      {/* Floating apply button on mobile */}
      <button
        type="button"
        onClick={openDialog}
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-blue-500 text-primary-foreground shadow-xl shadow-primary/40 flex items-center justify-center active:scale-95 transition-transform"
        data-testid="button-apply-loan-fab"
        aria-label="Apply for loan"
      >
        <PlusCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
