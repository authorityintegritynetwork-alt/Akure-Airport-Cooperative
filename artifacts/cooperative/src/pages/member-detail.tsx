import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetMember,
  useGetMemberSummary,
  useGetMemberBalanceTimeline,
  useListTransactions,
  useListLoans,
  useListStorePurchases,
  useGetProfile,
  useSearchAllMembers,
  useLinkCooperativeRecord,
  getGetMemberQueryKey,
  getSearchAllMembersQueryKey,
  getGetMemberSummaryQueryKey,
  getGetMemberBalanceTimelineQueryKey,
  getListTransactionsQueryKey,
  getListLoansQueryKey,
  getListStorePurchasesQueryKey,
  type SearchAllMembersResponseItem,
} from "@workspace/api-client-react";
import { useStepUpAction } from "@/lib/step-up";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  TrendingUp,
  Wrench,
  Landmark,
  Table2,
  Link2,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BalanceTimeline } from "@/components/balance-timeline";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
  const { data: timeline } = useGetMemberBalanceTimeline(memberId, {
    query: { enabled: !!memberId, queryKey: getGetMemberBalanceTimelineQueryKey(memberId) },
  });
  const { data: currentUser } = useGetProfile();
  const canAdjust =
    currentUser?.role === "treasurer" || currentUser?.role === "super_admin";
  const canLink =
    (currentUser?.role === "admin" || currentUser?.role === "super_admin") &&
    !!(member as any)?.canBeRetroactivelyLinked;

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [, navigate] = useLocation();

  // Pending sign-ups should be managed exclusively from the Pending Sign-ups
  // tab. If an admin somehow navigates here for a pending member, send them back.
  useEffect(() => {
    if (member && member.status === "pending") {
      navigate("/members?tab=pending", { replace: true });
    }
  }, [member, navigate]);

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

      {/* Zero-balance link banner — only shown to admins when member has no history */}
      {canLink && (
        <Card className="rounded-2xl border-amber-200/60 bg-amber-50/50 dark:bg-amber-500/5 dark:border-amber-400/20 shadow-sm">
          <CardContent className="p-4 flex items-start gap-3">
            <Link2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                No cooperative record linked
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                This member was approved with zero balance. If they have existing savings or loan history, link their cooperative record now.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-xl border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/10"
              onClick={() => setLinkDialogOpen(true)}
              data-testid="button-link-cooperative-record"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              Link record
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Per-product balance breakdown */}
      <PerProductBalances member={member} memberId={memberId} canAdjust={canAdjust} />

      {/* Month-by-month pivot table */}
      {timeline && <MonthlyDeductionTable timeline={timeline} />}

      {timeline && (
        <Card className="rounded-2xl shadow-sm border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Balance Timeline
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              From opening balance through each uploaded month to the current balance.
            </p>
          </CardHeader>
          <CardContent>
            <BalanceTimeline timeline={timeline} />
          </CardContent>
        </Card>
      )}

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

      {canLink && (
        <LinkCooperativeRecordDialog
          memberId={memberId}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          onLinked={(newId) => {
            setLinkDialogOpen(false);
            navigate(`/members/${newId}`, { replace: true });
          }}
        />
      )}
    </div>
  );
}

// ── Helper: are ALL balance columns zero? ─────────────────────────────────────
function isAllZeroBalance(member: any): boolean {
  return [
    member.sharesBalance,
    member.savingsBalance,
    member.providentBalance,
    member.christmasBalance,
    member.realLoanBalance,
    member.emergencyLoanBalance,
    member.fuelVentureBalance,
    member.landLoanBalance,
    member.totalLoanBalance,
    member.electronicsDebt,
    member.sElectronicsDebt,
    member.furnitureDebt,
    member.commodityDebt,
    member.ghlFormDebt,
    member.fireFundBalance,
    member.totalStoreDebt,
  ].every((v) => parseFloat(v ?? "0") === 0);
}

// ── Link cooperative record dialog ────────────────────────────────────────────
function LinkCooperativeRecordDialog({
  memberId,
  open,
  onOpenChange,
  onLinked,
}: {
  memberId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLinked: (newId: number) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedRecord, setSelectedRecord] =
    useState<SearchAllMembersResponseItem | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Full record details (for savings balance preview in confirm step)
  const { data: selectedFull } = useGetMember(selectedRecord?.id ?? 0, {
    query: {
      enabled: !!selectedRecord?.id,
      queryKey: getGetMemberQueryKey(selectedRecord?.id ?? 0),
    },
  });

  const { data: searchResults, isFetching: isSearching } = useSearchAllMembers(
    { q: debouncedQuery },
    {
      query: {
        enabled: debouncedQuery.length >= 2,
        queryKey: getSearchAllMembersQueryKey({ q: debouncedQuery }),
      },
    },
  );

  const linkMutation = useLinkCooperativeRecord();
  const linkWithStepUp = useStepUpAction(
    (cooperativeRecordId: number) =>
      linkMutation.mutateAsync({ id: memberId, data: { cooperativeRecordId } }),
  );

  function resetDialog() {
    setSelectedRecord(null);
    setSearchQuery("");
    setDebouncedQuery("");
  }

  async function handleConfirm() {
    if (!selectedRecord) return;
    try {
      const result = await linkWithStepUp(selectedRecord.id);
      onLinked(result.id);
    } catch (err: any) {
      toast({
        title: "Link failed",
        description:
          err?.response?.data?.error ?? err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  }

  const isSearchMode = debouncedQuery.length >= 2;
  const unlinkedResults = (searchResults ?? []).filter((r) => !r.isLinked);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetDialog();
      }}
    >
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link to cooperative record</DialogTitle>
          <DialogDescription>
            Search for the member's existing cooperative record to transfer their savings and loan history onto this account.
          </DialogDescription>
        </DialogHeader>

        {!selectedRecord ? (
          /* ── Search step ── */
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Search by name, ID or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {isSearchMode ? (
              isSearching ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : unlinkedResults.length > 0 ? (
                <div className="space-y-2">
                  {unlinkedResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRecord(r)}
                      className="w-full text-left border rounded-xl p-3 transition border-border hover:border-primary/50 hover:bg-muted/30"
                    >
                      <p className="font-medium text-sm">{r.fullName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.organization || "—"}
                        {r.staffId ? ` · ID ${r.staffId}` : ""}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No unclaimed records found for "{debouncedQuery}"
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                Type at least 2 characters to search all cooperative records.
              </p>
            )}
          </div>
        ) : (
          /* ── Confirm step ── */
          <div className="space-y-4">
            {/* Selected record summary */}
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Selected cooperative record
              </p>
              <p className="font-semibold">{selectedRecord.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {selectedRecord.organization || "—"}
                {selectedRecord.staffId ? ` · ID ${selectedRecord.staffId}` : ""}
                {selectedRecord.phone ? ` · ${selectedRecord.phone}` : ""}
              </p>
              {selectedFull && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-t border-border/40 pt-2">
                  <span className="text-muted-foreground">Savings balance</span>
                  <span className="font-semibold tabular-nums text-right">
                    {formatCurrency(selectedFull.savingsBalance)}
                  </span>
                  {(selectedFull.totalLoanBalance ?? 0) > 0 && (
                    <>
                      <span className="text-muted-foreground">Loan balance</span>
                      <span className="font-semibold tabular-nums text-right">
                        {formatCurrency(selectedFull.totalLoanBalance)}
                      </span>
                    </>
                  )}
                  {selectedFull.employeeNo && (
                    <>
                      <span className="text-muted-foreground">Employee No.</span>
                      <span className="font-semibold text-right">
                        {selectedFull.employeeNo}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Warning */}
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-400/20 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">⚠️ This action cannot be undone</p>
              <p>
                The member's current zero-balance account will be permanently deleted and replaced by this cooperative record. Their login access will be preserved.
              </p>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setSelectedRecord(null)}
                disabled={linkMutation.isPending}
              >
                ← Change record
              </Button>
              <Button
                className="rounded-xl"
                onClick={handleConfirm}
                disabled={linkMutation.isPending}
                data-testid="button-confirm-link"
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                {linkMutation.isPending ? "Linking…" : "Confirm & link"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}



// ── Monthly Deduction Pivot Table ────────────────────────────────────────────

const TABLE_COLS = [
  { key: "savings",       label: "Savings" },
  { key: "christmas",     label: "Christmas" },
  { key: "shares",        label: "Shares" },
  { key: "realLoan",      label: "Real Loan" },
  { key: "provident",     label: "Provision Loan" },
  { key: "emergencyLoan", label: "Emergency Loan" },
  { key: "fuelVenture",   label: "Fuel & Venture" },
  { key: "landLoan",      label: "Land Loan" },
  { key: "fire",          label: "Fire Fund" },
  { key: "electronics",   label: "Electronics" },
  { key: "sElectronics",  label: "S/Electronics" },
  { key: "furniture",     label: "Furniture" },
  { key: "commodity",     label: "Commodity" },
  { key: "ghlForm",       label: "GHL Form" },
] as const;

function MonthlyDeductionTable({ timeline }: { timeline: any }) {
  // Only show columns that have any data
  const activeCols = TABLE_COLS.filter(({ key }) => {
    const col = timeline.columns?.[key];
    return col && (col.ob > 0 || (col.months?.length ?? 0) > 0);
  });

  if (activeCols.length === 0) return null;

  // Collect all unique months sorted chronologically
  const monthMap = new Map<string, { label: string }>();
  for (const { key } of activeCols) {
    for (const m of (timeline.columns[key].months ?? [])) {
      const mk = `${m.year}-${String(m.month).padStart(2, "0")}`;
      if (!monthMap.has(mk)) monthMap.set(mk, { label: m.label });
    }
  }
  const sortedMonths = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Build month → col → amount lookup
  const lookup: Record<string, Record<string, number>> = {};
  for (const { key } of activeCols) {
    for (const m of (timeline.columns[key].months ?? [])) {
      const mk = `${m.year}-${String(m.month).padStart(2, "0")}`;
      if (!lookup[mk]) lookup[mk] = {};
      lookup[mk][key] = m.amount;
    }
  }

  // Total per column = opening balance + sum of all monthly amounts
  const totals: Record<string, number> = {};
  for (const { key } of activeCols) {
    const col = timeline.columns[key];
    totals[key] = (col.ob ?? 0) + (col.months ?? []).reduce((s: number, m: any) => s + m.amount, 0);
  }

  const hasOb = activeCols.some(({ key }) => (timeline.columns[key].ob ?? 0) > 0);

  return (
    <Card className="rounded-2xl shadow-sm border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Table2 className="w-4 h-4" />
          Monthly Deduction Breakdown
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Each upload month's deductions across all product types, with cumulative totals.
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-1">
        <div className="relative">
          <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap sticky left-0 z-10 bg-muted/50 min-w-[130px]">
                  Month
                </th>
                {activeCols.map(({ key, label }) => (
                  <th key={key} className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap min-w-[110px]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Opening Balance row */}
              {hasOb && (
                <tr className="border-b border-border/40 bg-sky-500/5">
                  <td className="px-4 py-2 font-semibold text-sky-700 dark:text-sky-400 whitespace-nowrap sticky left-0 z-10 bg-sky-500/5">
                    Opening Balance
                  </td>
                  {activeCols.map(({ key }) => {
                    const ob = timeline.columns[key].ob ?? 0;
                    return (
                      <td key={key} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${ob > 0 ? "text-sky-700 dark:text-sky-400 font-medium" : "text-muted-foreground/30"}`}>
                        {ob > 0 ? formatCurrency(ob) : "—"}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* One row per upload month */}
              {sortedMonths.map(([mk, meta], idx) => (
                <tr key={mk} className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 z-10 bg-card">
                    {meta.label}
                  </td>
                  {activeCols.map(({ key }) => {
                    const amt = lookup[mk]?.[key] ?? 0;
                    return (
                      <td key={key} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${amt > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>
                        {amt > 0 ? formatCurrency(amt) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Total row */}
              <tr className="border-t-2 border-border font-bold bg-muted/50">
                <td className="px-4 py-2.5 text-foreground whitespace-nowrap sticky left-0 z-10 bg-muted/50">
                  Total
                </td>
                {activeCols.map(({ key }) => (
                  <td key={key} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-foreground">
                    {formatCurrency(totals[key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          </div>
          {/* Right-edge fade — hints at horizontal scroll without obscuring data */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-card to-transparent rounded-r-xl" />
        </div>
        <p className="text-center text-[11px] text-muted-foreground py-1.5 sm:hidden select-none">
          ← Swipe to see all columns →
        </p>
      </CardContent>
    </Card>
  );
}

function BalanceTile({
  icon,
  label,
  value,
  bookValue,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bookValue?: string | null;
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
        {bookValue != null && (
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            Book: {bookValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Adjustment column options ─────────────────────────────────────────────────

const ADJ_COLUMN_OPTIONS = [
  { value: "savings",       label: "Savings" },
  { value: "christmas",     label: "Christmas Savings" },
  { value: "shares",        label: "Share Capital" },
  { value: "fire",          label: "Fire Fund" },
  { value: "provident",     label: "Provident Loan" },
  { value: "realLoan",      label: "Real Loan" },
  { value: "emergencyLoan", label: "Emergency Loan" },
  { value: "fuelVenture",   label: "Fuel & Venture" },
  { value: "landLoan",      label: "Land Loan" },
  { value: "electronics",   label: "Electronics" },
  { value: "sElectronics",  label: "Land/Electronics" },
  { value: "furniture",     label: "Furniture" },
  { value: "commodity",     label: "Commodity" },
  { value: "ghlForm",       label: "GHL Form" },
];

// ── Mini product tile ─────────────────────────────────────────────────────────

function MiniProductTile({
  label,
  value,
  ob,
  tone,
}: {
  label: string;
  value: string | number;
  ob?: string | number | null;
  tone: "success" | "warning" | "info";
}) {
  const borderClass = {
    success: "border-emerald-200/70 dark:border-emerald-800/60",
    warning: "border-amber-200/70 dark:border-amber-800/60",
    info: "border-sky-200/70 dark:border-sky-800/60",
  }[tone];

  return (
    <div className={`rounded-xl border bg-card px-3 py-2.5 ${borderClass}`}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums mt-0.5 truncate">
        {formatCurrency(Number(value))}
      </p>
      {ob != null && parseFloat(String(ob)) > 0 && (
        <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">
          OB: {formatCurrency(Number(ob))}
        </p>
      )}
    </div>
  );
}

// ── Per-product balance overview ──────────────────────────────────────────────

function PerProductBalances({
  member,
  memberId,
  canAdjust,
}: {
  member: any;
  memberId: number;
  canAdjust: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const savingsItems = [
    { label: "Savings",          value: member.savingsBalance,    ob: member.obSavingsBalance },
    { label: "Christmas Savings",value: member.christmasBalance,  ob: member.obChristmasBalance },
    { label: "Share Capital",    value: member.sharesBalance,     ob: member.obSharesBalance },
  ].filter((i) => parseFloat(String(i.value ?? "0")) > 0 || parseFloat(String(i.ob ?? "0")) > 0);

  // Fire fund is a loan repayment, not savings — kept in the loan section.
  // Electronics, S/Electronics, Furniture, Commodity and GHL Form are also
  // loan repayments recorded via monthly uploads; they are NOT store debts.
  // Actual store debt (items purchased from the cooperative store on credit)
  // is tracked separately in the Store Purchases card below.
  const loanItems = [
    { label: "Real Loan",          value: member.realLoanBalance,      ob: member.obRealLoanBalance },
    { label: "Provision Loan",     value: member.providentBalance,     ob: member.obProvidentBalance },
    { label: "Emergency Loan",     value: member.emergencyLoanBalance, ob: member.obEmergencyLoanBalance },
    { label: "Fuel & Venture",     value: member.fuelVentureBalance,   ob: member.obFuelVentureBalance },
    { label: "Land Loan",          value: member.landLoanBalance,      ob: member.obLandLoanBalance },
    { label: "Fire Fund Loan",     value: member.fireFundBalance,      ob: member.obFireFundBalance },
    { label: "Electronics",        value: member.electronicsDebt,      ob: member.obElectronicsDebt },
    { label: "S/Electronics",      value: member.sElectronicsDebt,     ob: member.obSElectronicsDebt },
    { label: "Furniture",          value: member.furnitureDebt,        ob: member.obFurnitureDebt },
    { label: "Commodity",          value: member.commodityDebt,        ob: member.obCommodityDebt },
    { label: "GHL Form",           value: member.ghlFormDebt,          ob: member.obGhlFormDebt },
  ].filter((i) => parseFloat(String(i.value ?? "0")) > 0 || parseFloat(String(i.ob ?? "0")) > 0);

  const hasAny = savingsItems.length > 0 || loanItems.length > 0;

  return (
    <Card className="rounded-2xl shadow-sm border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Balance Overview
          </CardTitle>
          {canAdjust && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full text-xs gap-1"
              onClick={() => setDialogOpen(true)}
            >
              <Wrench className="w-3 h-3" />
              Adjust
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!hasAny && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No balance data recorded yet.
          </p>
        )}

        {savingsItems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Landmark className="w-3 h-3" /> Savings & Capital
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {savingsItems.map((i) => (
                <MiniProductTile key={i.label} {...i} tone="success" />
              ))}
            </div>
          </div>
        )}

        {loanItems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3 h-3" /> Loan Repayments
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {loanItems.map((i) => (
                <MiniProductTile key={i.label} {...i} tone="warning" />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {canAdjust && (
        <AdjustmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          memberId={memberId}
          memberName={member.fullName}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: getGetMemberQueryKey(memberId) });
            void queryClient.invalidateQueries({
              queryKey: getGetMemberBalanceTimelineQueryKey(memberId),
            });
            toast({
              title: "Balance adjusted",
              description: "The correction has been saved and the timeline refreshed.",
            });
          }}
        />
      )}
    </Card>
  );
}

// ── Adjustment dialog ─────────────────────────────────────────────────────────

function AdjustmentDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: number;
  memberName: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [column, setColumn] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${memberId}/adjustments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column, amount: parseFloat(amount), direction, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        if (res.status === 428) {
          throw new Error("Identity verification required — please re-authenticate and try again.");
        }
        throw new Error(err.error ?? "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setColumn(""); setAmount(""); setDirection("credit"); setReason("");
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Adjustment failed", description: err.message, variant: "destructive" });
    },
  });

  const parsedAmount = parseFloat(amount);
  const canSubmit =
    column && !isNaN(parsedAmount) && parsedAmount > 0 && reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
          <DialogDescription>
            Manual correction for <strong>{memberName}</strong>. Requires treasurer OTP
            step-up. The adjustment is recorded as a transaction for full audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Balance Column</Label>
            <Select value={column} onValueChange={setColumn}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {ADJ_COLUMN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as "credit" | "debit")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (add +)</SelectItem>
                  <SelectItem value="debit">Debit (subtract −)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Reason{" "}
              <span className="text-muted-foreground font-normal">(min 5 characters)</span>
            </Label>
            <Textarea
              placeholder="e.g. Correcting data-entry error from August upload"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Apply Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
