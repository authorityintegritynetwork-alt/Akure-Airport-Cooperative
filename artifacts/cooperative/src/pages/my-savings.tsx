import { useGetMySavings, useListMyTransactions, getListMyTransactionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet } from "lucide-react";

export function MySavingsPage() {
  const { data: savings, isLoading: savingsLoading } = useGetMySavings();
  const { data: transactions, isLoading: txLoading } = useListMyTransactions(
    { type: "savings" },
    { query: { queryKey: getListMyTransactionsQueryKey({ type: "savings" }) } },
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">My Savings</h1>

      {savingsLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Current Balance</p>
                <p className="text-3xl font-bold text-primary">{formatCurrency(savings?.balance ?? 0)}</p>
                {savings?.lastUpdated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last updated: {formatDate(savings.lastUpdated)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Savings History</CardTitle>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No savings transactions yet.</div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3" data-testid={`tx-row-${tx.id}`}>
                  <div>
                    <p className="font-medium text-sm">{tx.description || "Savings Deduction"}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.month} {tx.year} &bull; {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-primary">{formatCurrency(tx.amount)}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">credit</Badge>
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
