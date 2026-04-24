import { useListMyStorePurchases, useGetMyStoreDebt } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { ShoppingBag, CheckCircle2, Clock, CircleDot } from "lucide-react";

const STATUS_META: Record<
  string,
  { label: string; cls: string; icon: React.ReactNode; iconCls: string }
> = {
  outstanding: {
    label: "Outstanding",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20",
    icon: <Clock className="w-3 h-3" />,
    iconCls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  partial: {
    label: "Partial",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: <CircleDot className="w-3 h-3" />,
    iconCls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  settled: {
    label: "Settled",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    icon: <CheckCircle2 className="w-3 h-3" />,
    iconCls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.outstanding;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

export function MyPurchasesPage() {
  const { data: purchases, isLoading } = useListMyStorePurchases();
  const { data: debt } = useGetMyStoreDebt();

  const totalDebt = Number(debt?.totalDebt ?? 0);
  const purchaseCount = purchases?.length ?? 0;
  const outstandingCount =
    purchases?.filter((p: any) => p.status !== "settled").length ?? 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold">My Purchases</h1>

      {/* Hero debt card — colored by debt amount */}
      <div
        className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl ${
          totalDebt > 0
            ? "shadow-rose-500/20"
            : "shadow-emerald-500/20"
        }`}
        style={{
          background:
            totalDebt > 0
              ? "linear-gradient(135deg, hsl(20 80% 45%) 0%, hsl(0 75% 55%) 50%, hsl(340 75% 55%) 100%)"
              : "linear-gradient(135deg, hsl(160 75% 32%) 0%, hsl(158 64% 42%) 50%, hsl(180 70% 45%) 100%)",
        }}
        data-testid="purchases-hero"
      >
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/75 font-semibold uppercase tracking-wider">
              {totalDebt > 0 ? "Outstanding store debt" : "All caught up"}
            </p>
            <p className="text-3xl sm:text-4xl font-bold mt-2 tabular-nums tracking-tight">
              {formatCurrency(totalDebt)}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {purchaseCount} total purchase{purchaseCount === 1 ? "" : "s"}
              {outstandingCount > 0
                ? ` · ${outstandingCount} unpaid`
                : ""}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Purchase history</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each purchase is repaid via your monthly salary deduction.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !purchases || purchases.length === 0 ? (
            <div className="text-center py-10">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <ShoppingBag className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No purchases yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Items you buy in the store will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {purchases.map((p: any) => {
                const meta = STATUS_META[p.status] || STATUS_META.outstanding;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    data-testid={`purchase-row-${p.id}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.iconCls}`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {p.itemName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.quantity} × {formatCurrency(p.unitPrice)} ·{" "}
                        {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-semibold tabular-nums text-sm">
                        {formatCurrency(p.totalPrice)}
                      </p>
                      <StatusPill status={p.status} />
                      {p.status !== "settled" && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                          Owed: {formatCurrency(p.outstandingBalance)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
