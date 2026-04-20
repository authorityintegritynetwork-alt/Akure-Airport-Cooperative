import { useListMyStorePurchases, useGetMyStoreDebt } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { ShoppingBag } from "lucide-react";

function purchaseStatusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "outline"> = {
    outstanding: "secondary",
    partial: "outline",
    settled: "default",
  };
  return <Badge variant={map[status] || "secondary"}>{status}</Badge>;
}

export function MyPurchasesPage() {
  const { data: purchases, isLoading } = useListMyStorePurchases();
  const { data: debt } = useGetMyStoreDebt();

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">My Purchases</h1>

      {debt && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding Store Debt</p>
                <p className="text-2xl font-bold text-orange-700">{formatCurrency(debt.totalDebt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !purchases || purchases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No purchases yet.</div>
          ) : (
            <div className="divide-y">
              {purchases.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-3" data-testid={`purchase-row-${p.id}`}>
                  <div>
                    <p className="font-medium text-sm">{p.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.quantity} &times; {formatCurrency(p.unitPrice)} &bull; {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {purchaseStatusBadge(p.status)}
                    <div>
                      <p className="font-semibold text-sm">{formatCurrency(p.totalPrice)}</p>
                      {p.status !== "settled" && (
                        <p className="text-xs text-destructive">Owed: {formatCurrency(p.outstandingBalance)}</p>
                      )}
                    </div>
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
