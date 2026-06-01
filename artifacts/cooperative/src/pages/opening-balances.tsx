import { useState } from "react";
import {
  useListOpeningBalances,
  useReconcileOpeningBalance,
  type OpeningBalance,
  type ListOpeningBalancesStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OpeningBalanceSummary,
} from "@/components/claim-opening-balance-dialog";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { Wallet, Search, AlertTriangle } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    unclaimed: { variant: "secondary", label: "Unclaimed" },
    claimed: { variant: "default", label: "Claimed" },
    needs_reconcile: { variant: "destructive", label: "Needs reconcile" },
  };
  const c = map[status] ?? { variant: "secondary" as const, label: status };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function OpeningBalancesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ListOpeningBalancesStatus | "all">("unclaimed");
  const [search, setSearch] = useState("");
  const [reconciling, setReconciling] = useState<OpeningBalance | null>(null);

  const params: any = {};
  if (statusFilter !== "all") params.status = statusFilter;
  if (search) params.search = search;

  const { data: rows, isLoading } = useListOpeningBalances(params);

  const reconcile = useReconcileOpeningBalance();
  const reconcileWithStepUp = useStepUpAction((id: number) =>
    reconcile.mutateAsync({ id }),
  );

  async function confirmReconcile() {
    if (!reconciling) return;
    try {
      await reconcileWithStepUp(reconciling.id);
      toast({
        title: "Opening balance resolved",
        description: `${reconciling.fullName}'s flagged record was discarded.`,
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/opening-balances",
      });
      setReconciling(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Could not resolve",
        description: err?.response?.data?.error ?? err.message,
        variant: "destructive",
      });
    }
  }

  const list = rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Wallet className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Opening Balances</h1>
          <p className="text-sm text-muted-foreground">
            Preloaded balances awaiting a member claim. Monthly deductions keep
            unclaimed rows current until the member registers.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Records</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  className="pl-8 w-full sm:w-56"
                  data-testid="input-search-opening-balances"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as ListOpeningBalancesStatus | "all")}
              >
                <SelectTrigger className="w-full sm:w-44" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unclaimed">Unclaimed</SelectItem>
                  <SelectItem value="needs_reconcile">Needs reconcile</SelectItem>
                  <SelectItem value="claimed">Claimed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="text-empty-opening-balances">
              No opening-balance records match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border p-4"
                  data-testid={`row-opening-balance-${row.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.fullName}</span>
                      {row.organization && <Badge variant="outline">{row.organization}</Badge>}
                      {statusBadge(row.status)}
                    </div>
                    {row.status === "needs_reconcile" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReconciling(row)}
                        data-testid={`button-reconcile-${row.id}`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-destructive" />
                        Resolve
                      </Button>
                    )}
                  </div>
                  {row.status === "needs_reconcile" && row.reconcileNote && (
                    <p className="text-xs text-destructive mb-3" data-testid={`text-reconcile-note-${row.id}`}>
                      {row.reconcileNote}
                    </p>
                  )}
                  <OpeningBalanceSummary row={row} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reconciling != null} onOpenChange={(v) => { if (!v) setReconciling(null); }}>
        <DialogContent data-testid="dialog-reconcile">
          <DialogHeader>
            <DialogTitle>Resolve flagged record</DialogTitle>
            <DialogDescription>
              This opening-balance row for <span className="font-medium">{reconciling?.fullName}</span> was
              flagged because a monthly deduction already matched a registered member.
              Resolving discards this duplicate holding record. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconciling(null)} data-testid="button-cancel-reconcile">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReconcile}
              disabled={reconcile.isPending}
              data-testid="button-confirm-reconcile"
            >
              {reconcile.isPending ? "Resolving…" : "Discard record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
