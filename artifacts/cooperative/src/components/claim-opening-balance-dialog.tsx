import { useState } from "react";
import {
  useGetOpeningBalanceSuggestion,
  getGetOpeningBalanceSuggestionQueryKey,
  useClaimOpeningBalance,
  useActivateMember,
  type OpeningBalance,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useStepUpAction } from "@/lib/step-up";
import { CheckCircle2, UserPlus, Wallet } from "lucide-react";

export const OPENING_BALANCE_FIELDS: { key: keyof OpeningBalance; label: string }[] = [
  { key: "savingsBalance", label: "Savings" },
  { key: "providentBalance", label: "Provident" },
  { key: "christmasBalance", label: "Christmas" },
  { key: "realLoanBalance", label: "Regular Loan" },
  { key: "emergencyLoanBalance", label: "Emergency Loan" },
  { key: "totalLoanBalance", label: "Total Loan" },
  { key: "electronicsDebt", label: "Electronics Debt" },
  { key: "sElectronicsDebt", label: "S/Electronics Debt" },
  { key: "furnitureDebt", label: "Furniture Debt" },
  { key: "commodityDebt", label: "Commodity Debt" },
  { key: "ghlFormDebt", label: "GHL Form Debt" },
  { key: "fireFundBalance", label: "Fire Fund" },
  { key: "fuelVentureBalance", label: "Fuel Venture" },
  { key: "landLoanBalance", label: "Land Loan" },
  { key: "totalStoreDebt", label: "Total Store Debt" },
];

function confidenceBadge(confidence: string) {
  const map: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
    exact: { variant: "default", label: "Exact name match" },
    fuzzy: { variant: "secondary", label: "Possible match" },
    manual: { variant: "outline", label: "Manual" },
    none: { variant: "outline", label: "No match" },
  };
  const c = map[confidence] ?? map.none;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function OpeningBalanceSummary({ row }: { row: OpeningBalance }) {
  const nonZero = OPENING_BALANCE_FIELDS.filter((f) => Number(row[f.key] ?? 0) !== 0);
  if (nonZero.length === 0) {
    return <p className="text-sm text-muted-foreground">All balances are zero.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {nonZero.map((f) => (
        <div key={f.key} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{f.label}</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(Number(row[f.key] ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ClaimOpeningBalanceDialog({
  member,
  open,
  onOpenChange,
}: {
  member: { id: number; fullName: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const memberId = member?.id ?? 0;
  const { data, isLoading } = useGetOpeningBalanceSuggestion(memberId, {
    query: {
      enabled: open && memberId > 0,
      queryKey: getGetOpeningBalanceSuggestionQueryKey(memberId),
    },
  });

  const claim = useClaimOpeningBalance();
  const activate = useActivateMember();
  const claimWithStepUp = useStepUpAction((id: number, openingBalanceId: number) =>
    claim.mutateAsync({ id, data: { openingBalanceId } }),
  );
  const activateWithStepUp = useStepUpAction((id: number) =>
    activate.mutateAsync({ id }),
  );

  function invalidate() {
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        (q.queryKey[0] === "/api/members" ||
          q.queryKey[0] === "/api/opening-balances"),
    });
  }

  async function handleApply() {
    if (!member || selectedId == null) return;
    try {
      await claimWithStepUp(member.id, selectedId);
      toast({
        title: "Opening balance applied",
        description: `${member.fullName} has been activated with their existing balance.`,
      });
      invalidate();
      onOpenChange(false);
      setSelectedId(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Could not apply balance",
        description: err?.response?.data?.error ?? err.message,
        variant: "destructive",
      });
    }
  }

  async function handleBrandNew() {
    if (!member) return;
    try {
      await activateWithStepUp(member.id);
      toast({
        title: "Member activated",
        description: `${member.fullName} starts with zero balances.`,
      });
      invalidate();
      onOpenChange(false);
      setSelectedId(null);
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({
        title: "Activation failed",
        description: err?.response?.data?.error ?? err.message,
        variant: "destructive",
      });
    }
  }

  const suggestions = data?.suggestions ?? [];
  const busy = claim.isPending || activate.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSelectedId(null);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-claim-opening-balance">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Approve {member?.fullName}
          </DialogTitle>
          <DialogDescription>
            Confirm an existing opening-balance record to preload this member's
            balances, or activate them as brand-new with zero balances.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="text-no-suggestions">
            No matching opening-balance record was found for this name. You can
            activate the member as brand-new (zero balances).
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pending verification — confirm the correct record
            </p>
            {suggestions.map((s) => {
              const row = s.openingBalance;
              const selected = selectedId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(selected ? null : row.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid={`option-opening-balance-${row.id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.fullName}</span>
                      {row.organization && (
                        <Badge variant="outline">{row.organization}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {confidenceBadge(s.confidence)}
                      {selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                  </div>
                  <OpeningBalanceSummary row={row} />
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={handleBrandNew}
            disabled={busy}
            data-testid="button-brand-new"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Brand-new (zero)
          </Button>
          <Button
            onClick={handleApply}
            disabled={busy || selectedId == null}
            data-testid="button-apply-opening-balance"
          >
            {claim.isPending ? "Applying…" : "Apply balance & activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
