import {
  useGetProfile,
  useGetAdminDashboardSummary,
  useGetMemberDashboardSummary,
  useListMembers,
  useActivateMember,
  useGetRecentActivity,
  getListMembersQueryKey,
  getGetAdminDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  CreditCard,
  ShoppingBag,
  Users,
  UserPlus,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Banknote,
  ArrowUpRight,
  Activity,
  AlertCircle,
  ShoppingCart,
  Bell,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { Link, Redirect } from "wouter";
import { useStepUpAction } from "@/lib/step-up";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useGetProfile();

  if (profileLoading) return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full"/><Skeleton className="h-64 w-full"/></div>;
  if (!profile) return null;

  if (profile.status === "pending") {
    return <Redirect to="/pending-approval" />;
  }

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";

  // Members get the new fintech-style dashboard (no page heading — the hero card greets them).
  if (!isAdmin) {
    return <MemberDashboard profile={profile} />;
  }

  return <AdminDashboard />;
}

type BalanceCard = { key: string; label: string; direction: "credit" | "debit" };

const BALANCE_CARDS_BY_ORG: Record<"faan" | "nama", BalanceCard[]> = {
  faan: [
    { key: "savingsBalance", label: "Savings", direction: "credit" },
    { key: "providentBalance", label: "Provision", direction: "credit" },
    { key: "christmasBalance", label: "Christmas", direction: "credit" },
    { key: "realLoanBalance", label: "Real Loan", direction: "debit" },
    { key: "emergencyLoanBalance", label: "Emergency Loan", direction: "debit" },
    { key: "electronicsDebt", label: "Electronics", direction: "debit" },
    { key: "sElectronicsDebt", label: "S/Electronics", direction: "debit" },
    { key: "furnitureDebt", label: "Furniture", direction: "debit" },
    { key: "commodityDebt", label: "Commodity", direction: "debit" },
    { key: "ghlFormDebt", label: "Loan Form Cost", direction: "debit" },
    { key: "fireFundBalance", label: "Fire Fund", direction: "credit" },
  ],
  nama: [
    { key: "savingsBalance", label: "Savings", direction: "credit" },
    { key: "providentBalance", label: "Provision", direction: "credit" },
    { key: "realLoanBalance", label: "Real Loan", direction: "debit" },
    { key: "emergencyLoanBalance", label: "Emergency Loan", direction: "debit" },
    { key: "electronicsDebt", label: "Electronics (S/Elect)", direction: "debit" },
    { key: "fuelVentureBalance", label: "Fuel Venture Loan", direction: "debit" },
    { key: "landLoanBalance", label: "Land Loan", direction: "debit" },
    { key: "commodityDebt", label: "Commodity", direction: "debit" },
    { key: "ghlFormDebt", label: "Loan Form Cost", direction: "debit" },
  ],
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "warning" | "info";
  href?: string;
}) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };
  const card = (
    <Card className="rounded-2xl hover:shadow-md transition-shadow border-border/70 shadow-sm h-full">
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${toneClasses[tone]} mb-2.5`}>
          {icon}
        </div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-base sm:text-xl font-bold tabular-nums truncate mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function PendingMembersPanel() {
  const { data: pending, isLoading } = useListMembers(
    { status: "pending" },
    { query: { queryKey: getListMembersQueryKey({ status: "pending" }) } },
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const activate = useActivateMember();
  const activateWithStepUp = useStepUpAction((id: number) => activate.mutateAsync({ id }));

  async function onActivate(m: { id: number; fullName: string }) {
    try {
      await activateWithStepUp(m.id);
      toast({ title: "Member activated", description: m.fullName });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/members' });
      queryClient.invalidateQueries({ queryKey: getGetAdminDashboardSummaryQueryKey() });
    } catch (err: any) {
      if (err?.cancelled) return;
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    }
  }

  const count = pending?.length ?? 0;
  const isUrgent = count > 0;

  return (
    <Card className={isUrgent ? "border-amber-300 dark:border-amber-700/60" : "border-border/70"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isUrgent ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Pending member registrations
              {count > 0 && <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20">{count} waiting</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Members who completed sign-up but need an admin to activate them.</p>
          </div>
        </div>
        <Link href="/members?status=pending">
          <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-all-pending">
            View all <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : count === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 px-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            All caught up — no pending registrations.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {pending!.slice(0, 5).map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 py-3" data-testid={`pending-row-${m.id}`}>
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {m.fullName?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/members/${m.id}`}>
                    <p className="font-medium truncate hover:underline cursor-pointer">{m.fullName}</p>
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{m.email}</span>
                    {m.organization && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold">
                        {m.organization}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onActivate({ id: m.id, fullName: m.fullName })}
                  disabled={activate.isPending}
                  data-testid={`button-activate-${m.id}`}
                >
                  Activate
                </Button>
              </div>
            ))}
            {count > 5 && (
              <div className="pt-3 text-center">
                <Link href="/members?status=pending">
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">+{count - 5} more pending registrations</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoanPipelinePanel({ summary }: { summary: any }) {
  const stages = [
    { label: "Admin review", count: summary.loansAwaitingAdminApproval, icon: <Clock className="w-4 h-4" />, tone: "info" as const },
    { label: "Auditor review", count: summary.loansAwaitingAuditorApproval, icon: <ShieldCheck className="w-4 h-4" />, tone: "info" as const },
    { label: "Super-admin", count: summary.loansAwaitingSuperAdminApproval, icon: <CheckCircle2 className="w-4 h-4" />, tone: "warning" as const },
    { label: "Disbursement", count: summary.loansAwaitingDisbursement, icon: <Banknote className="w-4 h-4" />, tone: "success" as const },
  ];
  const toneClasses: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
  const totalActionable = stages.reduce((s, x) => s + x.count, 0);
  return (
    <Card className="border-border/70 h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base">Loan approval pipeline</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{totalActionable} loan(s) need attention right now.</p>
            </div>
          </div>
          <Link href="/loans">
            <Button variant="ghost" size="sm" className="gap-1">Open queue <ArrowUpRight className="w-3.5 h-3.5" /></Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {stages.map((s) => (
            <Link key={s.label} href="/loans">
              <div className="border rounded-lg p-3 hover:border-primary/50 hover:bg-muted/50 transition cursor-pointer h-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneClasses[s.tone]}`}>{s.icon}</div>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</span>
                </div>
                <div className="text-2xl font-bold tabular-nums">{s.count}</div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityPanel() {
  const { data: activity, isLoading } = useGetRecentActivity(
    { limit: 8 },
    { query: { queryKey: getGetRecentActivityQueryKey({ limit: 8 }) } },
  );
  return (
    <Card className="border-border/70 h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Most recent actions across the cooperative.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !activity || activity.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No activity yet.</div>
        ) : (
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {activity.map((e: any) => (
              <div key={e.id} className="flex gap-3 text-sm" data-testid={`activity-${e.id}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="leading-snug">{e.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {e.actorName ?? "System"} · {new Date(e.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const { data: summary, isLoading } = useGetAdminDashboardSummary();
  const { data: profile } = useGetProfile();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (!summary) return null;

  const totalActionable =
    summary.loansAwaitingAdminApproval +
    summary.loansAwaitingAuditorApproval +
    summary.loansAwaitingSuperAdminApproval +
    summary.loansAwaitingDisbursement +
    summary.pendingMembers;

  const firstName = (profile?.fullName || "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const roleLabel = (profile?.role || "admin").replace("_", " ").toUpperCase();

  return (
    <div className="space-y-5">
      {/* Hero gradient card */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="admin-hero-card"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm text-white/80 font-medium">
              {greeting},
            </p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
              {firstName}
            </h1>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide bg-white/15 backdrop-blur-sm border border-white/20"
            data-testid="admin-role-badge"
          >
            <ShieldCheck className="w-3 h-3" />
            {roleLabel}
          </span>
        </div>

        <div className="relative mt-6">
          <p className="text-xs text-white/80 font-medium uppercase tracking-wider">
            Total Members
          </p>
          <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums tracking-tight">
            {summary.totalMembers}
          </p>
          <p className="text-xs text-white/80 mt-1">
            {summary.activeMembers} active
            {summary.pendingMembers
              ? ` · ${summary.pendingMembers} pending approval`
              : ""}
          </p>
        </div>

        <div className="relative mt-5">
          {totalActionable > 0 ? (
            <Link href="/loans">
              <div className="rounded-2xl bg-amber-400/20 backdrop-blur-sm border border-amber-200/40 p-3 flex items-center gap-3 cursor-pointer hover:bg-amber-400/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-amber-300/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 font-semibold uppercase tracking-wide">
                    Action needed
                  </p>
                  <p className="text-sm font-bold leading-tight mt-0.5">
                    {totalActionable} item{totalActionable === 1 ? "" : "s"} awaiting your review
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-emerald-400/20 backdrop-blur-sm border border-emerald-200/40 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-300/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-white/80 font-semibold uppercase tracking-wide">
                  All clear
                </p>
                <p className="text-sm font-bold leading-tight mt-0.5">
                  No pending approvals — everything is up to date.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Members"
          value={summary.totalMembers}
          sub={`${summary.activeMembers} active`}
          icon={<Users className="w-5 h-5" />}
          tone="primary"
          href="/members"
        />
        <KpiCard
          label="Total savings"
          value={formatCurrency(summary.totalSavings)}
          icon={<Wallet className="w-5 h-5" />}
          tone="success"
        />
        <KpiCard
          label="Loans out"
          value={formatCurrency(summary.totalLoansOutstanding)}
          icon={<CreditCard className="w-5 h-5" />}
          tone="warning"
          href="/loans"
        />
        <KpiCard
          label="Store debt"
          value={formatCurrency(summary.totalStoreDebt)}
          icon={<ShoppingBag className="w-5 h-5" />}
          tone="info"
        />
      </div>

      <PendingMembersPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <LoanPipelinePanel summary={summary} />
        <RecentActivityPanel />
      </div>
    </div>
  );
}

function MemberDashboard({ profile }: { profile: any }) {
  const { data: summary, isLoading } = useGetMemberDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (!summary) return null;

  const orgCode = (profile.organization || "faan").toString().toLowerCase();
  const org: "faan" | "nama" = orgCode === "nama" ? "nama" : "faan";
  const balanceCards = BALANCE_CARDS_BY_ORG[org];
  const orgLabel = (profile.organization || "FAAN").toString().toUpperCase();

  const firstName = (profile.fullName || "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      {/* Hero balance card with gradient */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="member-hero-card"
      >
        {/* Decorative blobs */}
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm text-white/70 font-medium">
              {greeting},
            </p>
            <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight">
              {firstName}
            </h1>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide bg-white/15 backdrop-blur-sm border border-white/20"
            data-testid="dashboard-org-badge"
          >
            <Sparkles className="w-3 h-3" />
            {orgLabel}
          </span>
        </div>

        <div className="relative mt-6">
          <p className="text-xs text-white/70 font-medium uppercase tracking-wider">
            Total Savings
          </p>
          <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums tracking-tight">
            {formatCurrency(summary.savingsBalance)}
          </p>
          <p className="text-xs text-white/70 mt-1">
            {org === "faan"
              ? "Savings + Provision + Christmas"
              : "Savings + Provision"}
          </p>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/70 font-semibold">
              <CreditCard className="w-3 h-3" /> Loan due
            </div>
            <p className="text-lg font-bold mt-1 tabular-nums">
              {formatCurrency(summary.outstandingLoanBalance)}
            </p>
            <p className="text-[10px] text-white/60 mt-0.5">
              {summary.activeLoanCount} active
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/70 font-semibold">
              <ShoppingBag className="w-3 h-3" /> Store debt
            </div>
            <p className="text-lg font-bold mt-1 tabular-nums">
              {formatCurrency(summary.storeDebt)}
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <QuickAction
          href="/my-savings"
          icon={<Wallet className="w-5 h-5" />}
          label="Savings"
          tone="emerald"
        />
        <QuickAction
          href="/my-loans"
          icon={<CreditCard className="w-5 h-5" />}
          label="Loans"
          tone="violet"
        />
        <QuickAction
          href="/store"
          icon={<ShoppingCart className="w-5 h-5" />}
          label="Store"
          tone="amber"
        />
        <QuickAction
          href="/my-notifications"
          icon={<Bell className="w-5 h-5" />}
          label="Alerts"
          tone="sky"
        />
      </div>

      {/* Balance breakdown */}
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Balance breakdown</CardTitle>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              {orgLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Your individual savings buckets and outstanding deductions.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-3">
            {balanceCards.map((b) => {
              const value = Number(profile[b.key] ?? 0);
              const isCredit = b.direction === "credit";
              const isZero = value === 0;
              return (
                <div
                  key={b.key}
                  className={`relative rounded-2xl p-3 border overflow-hidden ${
                    isZero
                      ? "bg-muted/30 border-border/50"
                      : isCredit
                      ? "bg-gradient-to-br from-emerald-50 to-emerald-50/40 border-emerald-200/70 dark:from-emerald-500/10 dark:to-emerald-500/5 dark:border-emerald-500/20"
                      : "bg-gradient-to-br from-rose-50 to-rose-50/40 border-rose-200/70 dark:from-rose-500/10 dark:to-rose-500/5 dark:border-rose-500/20"
                  }`}
                  data-testid={`balance-${b.key}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground leading-tight">
                      {b.label}
                    </span>
                    <div
                      className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
                        isZero
                          ? "bg-muted text-muted-foreground"
                          : isCredit
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isCredit ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                    </div>
                  </div>
                  <p
                    className={`mt-2 font-bold tabular-nums text-base sm:text-lg ${
                      isZero
                        ? "text-muted-foreground"
                        : isCredit
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {formatCurrency(value)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest deductions & transactions on your account.
            </p>
          </div>
          <Link href="/my-savings">
            <Button variant="ghost" size="sm" className="gap-1 -mr-2">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {summary.recentTransactions.length > 0 ? (
            <div className="divide-y divide-border/50">
              {summary.recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  data-testid={`recent-tx-${tx.id}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium capitalize text-sm truncate">
                      {tx.type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-sm text-emerald-700 dark:text-emerald-300">
                    +{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No transactions yet — your monthly deduction will appear here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone: "emerald" | "violet" | "amber" | "sky";
}) {
  const tones: Record<string, string> = {
    emerald:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/15",
    violet:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 group-hover:bg-violet-500/15",
    amber:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500/15",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:bg-sky-500/15",
  };
  return (
    <Link href={href} data-testid={`quick-action-${label.toLowerCase()}`}>
      <div className="group rounded-2xl bg-card border border-border/60 p-3 flex flex-col items-center gap-2 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer active:scale-95">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${tones[tone]}`}
        >
          {icon}
        </div>
        <span className="text-[11px] sm:text-xs font-semibold text-foreground">
          {label}
        </span>
      </div>
    </Link>
  );
}
