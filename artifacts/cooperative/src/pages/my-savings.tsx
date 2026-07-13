import { useGetMySavings, useGetProfile, useListMyTransactions, getListMyTransactionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { Wallet, TrendingUp, Calendar, BookOpen } from "lucide-react";
import { useBalancesHidden } from "@/hooks/use-balances-hidden";

export function MySavingsPage() {
  const { data: savings, isLoading: savingsLoading } = useGetMySavings();
  const { data: profile } = useGetProfile();
  const { data: transactions, isLoading: txLoading } = useListMyTransactions(
    { type: "savings" },
    { query: { queryKey: getListMyTransactionsQueryKey({ type: "savings" }) } },
  );
  const hidden = useBalancesHidden();

  const bookSavings = profile?.obSavingsBalance != null ? Number(profile.obSavingsBalance) : null;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between md:hidden">
        <h1 className="text-xl font-bold">My Savings</h1>
      </div>
      <h1 className="hidden md:block text-2xl font-bold">My Savings</h1>

      {/* Hero balance card */}
      {savingsLoading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <div
          className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-emerald-500/20"
          style={{
            background:
              "linear-gradient(135deg, hsl(160 75% 32%) 0%, hsl(158 64% 42%) 50%, hsl(180 70% 45%) 100%)",
          }}
          data-testid="savings-hero"
        >
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-white/5 blur-3xl" />

          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-white/75 font-semibold uppercase tracking-wider">
                Current Balance
              </p>
              <p className="text-3xl sm:text-4xl font-bold mt-2 tabular-nums tracking-tight">
                {hidden ? "—" : formatCurrency(savings?.balance ?? 0)}
              </p>
              {savings?.lastUpdated && (
                <p className="text-xs text-white/70 mt-2 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Last updated {formatDate(savings.lastUpdated)}
                </p>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Wallet className="w-6 h-6" />
            </div>
          </div>

          {bookSavings != null && !hidden && (
            <div className="relative mt-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-3 flex items-center gap-3">
              <BookOpen className="w-4 h-4 shrink-0 text-white/80" />
              <div>
                <p className="text-[10px] text-white/70 uppercase tracking-wide font-semibold">Book Balance</p>
                <p className="text-base font-bold tabular-nums">{formatCurrency(bookSavings)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Savings history</CardTitle>
          <p className="text-xs text-muted-foreground">
            Monthly deductions credited to your savings account.
          </p>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="text-center py-10">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Wallet className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No savings transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deductions appear here after each monthly upload.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  data-testid={`tx-row-${tx.id}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {tx.description || "Savings deduction"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.month} {tx.year} · {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-sm text-emerald-700 dark:text-emerald-300">
                    {hidden ? "—" : `+${formatCurrency(tx.amount)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
