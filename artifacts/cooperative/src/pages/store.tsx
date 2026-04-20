import { useState } from "react";
import {
  useListStoreItems,
  useCreateStorePurchase,
  getListMyStorePurchasesQueryKey,
  getGetMyStoreDebtQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ShoppingCart } from "lucide-react";

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
          toast({ title: "Purchase confirmed", description: `${quantity}x ${selected.name} purchased successfully.` });
          queryClient.invalidateQueries({ queryKey: getListMyStorePurchasesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyStoreDebtQueryKey() });
          setSelected(null);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Purchase failed", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cooperative Store</h1>
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
          data-testid="input-store-search"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No items available.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {filtered.map((item: any) => (
            <Card key={item.id} data-testid={`card-store-item-${item.id}`} className="overflow-hidden">
              {item.imageObjectPath ? (
                <img
                  src={`${basePath}/api/storage/objects${item.imageObjectPath}`}
                  alt={item.name}
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground/30" />
                </div>
              )}
              <CardContent className="pt-4 space-y-1">
                <h3 className="font-semibold">{item.name}</h3>
                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                <p className="text-lg font-bold text-primary">{formatCurrency(item.price)}</p>
                <p className="text-xs text-muted-foreground">{item.quantityAvailable} in stock</p>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={item.quantityAvailable === 0}
                  onClick={() => handleBuy(item)}
                  data-testid={`button-buy-${item.id}`}
                >
                  Purchase
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                You are purchasing: <strong>{selected.name}</strong>
              </p>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Quantity:</label>
                <Input
                  type="number"
                  min={1}
                  max={selected.quantityAvailable}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-24"
                  data-testid="input-purchase-quantity"
                />
              </div>
              <div className="bg-muted rounded p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Unit price</span>
                  <span>{formatCurrency(selected.price)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(selected.price * quantity)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This purchase will be recorded as store debt and deducted from your monthly salary.
              </p>
              <Button
                className="w-full"
                disabled={purchase.isPending}
                onClick={confirmPurchase}
                data-testid="button-confirm-purchase"
              >
                {purchase.isPending ? "Processing..." : "Confirm Purchase"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
