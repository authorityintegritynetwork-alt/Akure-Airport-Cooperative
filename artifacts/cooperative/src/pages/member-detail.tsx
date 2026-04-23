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
import { Wallet, CreditCard, ShoppingBag, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function MemberDetailPage() {
  const [, params] = useRoute("/members/:id");
  const memberId = parseInt(params?.id || "0", 10);

  const { data: member, isLoading, error } = useGetMember(memberId, {
    query: { enabled: !!memberId, queryKey: getGetMemberQueryKey(memberId), retry: false },
  });
  const { data: summary } = useGetMemberSummary(memberId, {
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
        <Link href="/members"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2"/>Back to members</Button></Link>
      </div>
    );
  }
  if (isLoading) return <Skeleton className="h-64 w-full" />;
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
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to members
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/members">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{member.fullName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={member.status === "active" ? "default" : "secondary"}>{member.status}</Badge>
            <Badge variant="outline">{member.role.replace("_", " ")}</Badge>
            {member.staffId && <span className="text-sm text-muted-foreground">ID: {member.staffId}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Savings Balance</p>
                <p className="text-xl font-bold">{formatCurrency(member.savingsBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Loan Balance</p>
                <p className="text-xl font-bold">{formatCurrency(member.totalLoanBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Store Debt</p>
                <p className="text-xl font-bold">{formatCurrency(member.totalStoreDebt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
        <CardContent>
          {!transactions || transactions.length === 0 ? (
            <div className="text-muted-foreground text-sm">No transactions recorded.</div>
          ) : (
            <div className="divide-y">
              {transactions.slice(0, 10).map((tx: any) => (
                <div key={tx.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium capitalize">{tx.type.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{tx.month} {tx.year}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(tx.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Loans</CardTitle></CardHeader>
        <CardContent>
          {!loans || loans.length === 0 ? (
            <div className="text-muted-foreground text-sm">No loan applications.</div>
          ) : (
            <div className="divide-y">
              {loans.map((loan: any) => (
                <div key={loan.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{formatCurrency(loan.amount)}</p>
                    <p className="text-xs text-muted-foreground">{loan.tenureMonths} months &bull; {formatDate(loan.createdAt)}</p>
                  </div>
                  <Badge variant={loan.status === "disbursed" ? "default" : loan.status === "rejected" ? "destructive" : "secondary"} className="text-xs">
                    {loan.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Store Purchases</CardTitle></CardHeader>
        <CardContent>
          {!purchases || purchases.length === 0 ? (
            <div className="text-muted-foreground text-sm">No store purchases.</div>
          ) : (
            <div className="divide-y">
              {purchases.map((p: any) => (
                <div key={p.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.itemName}</p>
                    <p className="text-xs text-muted-foreground">{p.quantity} &times; {formatCurrency(p.unitPrice)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(p.totalPrice)}</p>
                    {p.status !== "settled" && <p className="text-xs text-destructive">Owed: {formatCurrency(p.outstandingBalance)}</p>}
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
