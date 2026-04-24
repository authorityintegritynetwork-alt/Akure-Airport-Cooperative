import { useRoute } from "wouter";
import {
  useGetMember,
  useGetMemberSummary,
  useListTransactions,
  useListLoans,
  useListStorePurchases,
  getGetMemberQueryKey,
  getGetMemberSummaryQueryKey,
  getListTransactionsQueryKey,
  getListLoansQueryKey,
  getListStorePurchasesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Wallet,
  CreditCard,
  ShoppingBag,
  ArrowLeft,
  Mail,
  Phone,
  IdCard,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function MemberDetailPage() {
  const [, params] = useRoute("/members/:id");
  const memberId = parseInt(params?.id || "0", 10);

  const { data: member, isLoading, error } = useGetMember(memberId, {
    query: { enabled: !!memberId, queryKey: getGetMemberQueryKey(memberId), retry: false },
  });
  useGetMemberSummary(memberId, {
    query: { enabled: !!memberId, queryKey: getGetMemberSummaryQueryKey(memberId) },
  });
  const { data: transactions } = useListTransactions({ memberId }, {
    query: { enabled: !!memberId, queryKey: getListTransactionsQueryKey({ memberId }) },
  });
  const { data: loans } = useListLoans({ memberId }, {
    query: { enabled: !!memberId, queryKey: getListLoansQueryKey({ memberId }) },
  });
  const { data: purchases } = useListStorePurchases({ memberId }, {
    query: { enabled: !!memberId, queryKey: getListStorePurchasesQueryKey({ memberId }) },
  });

  if (!memberId) {
    return (
      <div className="space-y-4 max-w-md">
        <div className="text-muted-foreground">Invalid member ID in the URL.</div>
        <Link href="/members">
          <Button variant="outline" size="sm" className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to members
          </Button>
        </Link>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!member) {
    const status = (error as any)?.response?.status ?? (error as any)?.status;
    const msg =
      (error as any)?.response?.data?.error ??
      (error as any)?.data?.error ??
      (error as any)?.message ??
      "We couldn't load this member.";
    return (
      <div className="space-y-4 max-w-md">
        <div>
          <h1 className="text-xl font-semibold">Member unavailable</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {status ? `(${status}) ` : ""}{msg}
          </p>
        </div>
        <Link href="/members">
          <Button variant="outline" size="sm" className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to members
          </Button>
        </Link>
      </div>
    );
  }

  const statusTone =
    member.status === "active"
      ? "bg-emerald-400/20 border-emerald-200/40"
      : member.status === "pending"
      ? "bg-amber-400/20 border-amber-200/40"
      : "bg-white/15 border-white/20";

  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/members">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full -ml-2 text-muted-foreground hover:text-foreground"
          data-testid="button-back-members"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Members
        </Button>
      </Link>

      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="member-detail-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-2xl font-bold shrink-0">
            {member.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight truncate">
              {member.fullName}
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-sm border ${statusTone}`}
              >
                {member.status}
              </span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide bg-white/15 backdrop-blur-sm border border-white/20">
                {member.role.replace("_", " ")}
              </span>
              {member.organization && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide bg-white/15 backdrop-blur-sm border border-white/20">
                  {member.organization}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-2 text-xs text-white/90">
          <div className="flex items-center gap-2 truncate">
            <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
            <span className="truncate">{member.email}</span>
          </div>
          {member.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>{member.phone}</span>
            </div>
          )}
          {member.staffId && (
            <div className="flex items-center gap-2">
              <IdCard className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>Staff ID {member.staffId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Balance grid */}
      <div className="grid gap-3 grid-cols-3">
        <BalanceTile
          icon={<Wallet className="w-5 h-5" />}
          label="Savings"
          value={formatCurrency(member.savingsBalance)}
          tone="success"
        />
        <BalanceTile
          icon={<CreditCard className="w-5 h-5" />}
          label="Loan Bal."
          value={formatCurrency(member.totalLoanBalance)}
          tone="warning"
        />
        <BalanceTile
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Store Debt"
          value={formatCurrency(member.totalStoreDebt)}
          tone="info"
        />
      </div>

      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {!transactions || transactions.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">
              No transactions recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 10).map((tx: any) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm capitalize truncate">
                      {tx.type.replace("_", " ")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {tx.month} {tx.year}
                    </p>
                  </div>
                  <span className="font-bold text-sm tabular-nums shrink-0">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Loans</CardTitle>
        </CardHeader>
        <CardContent>
          {!loans || loans.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">
              No loan applications.
            </div>
          ) : (
            <div className="space-y-2">
              {loans.map((loan: any) => (
                <div
                  key={loan.id}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm tabular-nums">
                      {formatCurrency(loan.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {loan.tenureMonths} months · {formatDate(loan.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      loan.status === "disbursed"
                        ? "default"
                        : loan.status === "rejected"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-[10px] rounded-full"
                  >
                    {loan.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Store Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          {!purchases || purchases.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">
              No store purchases.
            </div>
          ) : (
            <div className="space-y-2">
              {purchases.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{p.itemName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.quantity} × {formatCurrency(p.unitPrice)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm tabular-nums">
                      {formatCurrency(p.totalPrice)}
                    </p>
                    {p.status !== "settled" && (
                      <p className="text-[10px] text-destructive">
                        Owed {formatCurrency(p.outstandingBalance)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "info";
}) {
  const toneClass = {
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  }[tone];
  return (
    <Card className="rounded-2xl shadow-sm border-border/70 h-full">
      <CardContent className="p-3 sm:p-4">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${toneClass}`}
        >
          {icon}
        </div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm sm:text-lg font-bold tabular-nums truncate mt-0.5">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
