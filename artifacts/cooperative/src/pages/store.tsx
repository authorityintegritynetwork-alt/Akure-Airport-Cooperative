import { useState } from "react";
import {
  useListStoreItems,
  useCreateStorePurchase,
  getListMyStorePurchasesQueryKey,
  getGetMyStoreDebtQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Search, Minus, Plus, Tag } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function StorePage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items, isLoading } = useListStoreItems({ available: true });
  const purchase = useCreateStorePurchase();

  const filtered = items?.filter(
    (item: any) =>
      !search || item.name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleBuy(item: any) {
    setSelected(item);
    setQuantity(1);
  }

  function confirmPurchase() {
    if (!selected) return;
    purchase.mutate(
      { data: { storeItemId: selected.id, quantity } },
      {
        onSuccess: () => {
          toast({
            title: "Purchase confirmed",
            description: `${quantity}× ${selected.name} purchased successfully.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListMyStorePurchasesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetMyStoreDebtQueryKey(),
          });
          setSelected(null);
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message || "Purchase failed",
            variant: "destructive",
          });
        },
      },
    );
  }

  const max = selected?.quantityAvailable ?? 1;
  const total = (selected?.price ?? 0) * quantity;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Cooperative Store</h1>
          <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
            Buy now, repaid via your monthly deduction.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-full bg-card"
            data-testid="input-store-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-60 rounded-2xl" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="text-center py-12">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <ShoppingCart className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {search ? "No items match your search" : "No items available"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different keyword." : "Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item: any) => {
            const outOfStock = item.quantityAvailable === 0;
            const lowStock =
              item.quantityAvailable > 0 && item.quantityAvailable <= 5;
            return (
              <div
                key={item.id}
                data-testid={`card-store-item-${item.id}`}
                className="group rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col"
              >
                <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                  {item.imageObjectPath ? (
                    <img
                      src={`${basePath}/api/storage/objects${item.imageObjectPath}`}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingCart className="w-12 h-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {outOfStock && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
                      <span className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-card border">
                        Out of stock
                      </span>
                    </div>
                  )}
                  {lowStock && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/90 text-white shadow-sm">
                      <Tag className="w-2.5 h-2.5" />
                      Only {item.quantityAvailable} left
                    </span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <h3 className="font-semibold text-sm line-clamp-1 leading-tight">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                    <p className="text-base sm:text-lg font-bold text-primary tabular-nums leading-none">
                      {formatCurrency(item.price)}
                    </p>
                    <Button
                      size="sm"
                      className="rounded-full h-9 px-3 shadow-md shadow-primary/20"
                      disabled={outOfStock}
                      onClick={() => handleBuy(item)}
                      data-testid={`button-buy-${item.id}`}
                    >
                      Buy
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Confirm purchase</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50">
                <div className="w-14 h-14 rounded-xl bg-card border overflow-hidden shrink-0">
                  {selected.imageObjectPath ? (
                    <img
                      src={`${basePath}/api/storage/objects${selected.imageObjectPath}`}
                      alt={selected.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{selected.name}</p>
                  <p className="text-sm text-primary font-bold tabular-nums">
                    {formatCurrency(selected.price)}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Quantity
                </label>
                <div className="inline-flex items-center rounded-full border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted disabled:opacity-40"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(
                          1,
                          Math.min(max, parseInt(e.target.value) || 1),
                        ),
                      )
                    }
                    className="w-14 h-10 text-center bg-transparent font-semibold tabular-nums focus:outline-none"
                    data-testid="input-purchase-quantity"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(max, quantity + 1))}
                    disabled={quantity >= max}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted disabled:opacity-40"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {quantity} × {formatCurrency(selected.price)}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(selected.price * quantity)}
                  </span>
                </div>
                <div className="flex justify-between text-base pt-2 border-t border-primary/20">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-primary tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-center">
                This will be added to your store debt and deducted from your
                monthly salary.
              </p>

              <Button
                className="w-full rounded-xl h-11"
                disabled={purchase.isPending}
                onClick={confirmPurchase}
                data-testid="button-confirm-purchase"
              >
                {purchase.isPending
                  ? "Processing..."
                  : `Confirm purchase · ${formatCurrency(total)}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
