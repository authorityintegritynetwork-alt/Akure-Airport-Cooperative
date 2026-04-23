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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {isAdmin ? <AdminDashboard /> : <MemberDashboard profile={profile} />}
    </div>
  );
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
    { key: "providentBalance", label: "Provident", direction: "credit" },
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
    <Card className="hover:shadow-md transition-shadow border-border/70">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold tabular-nums truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${toneClasses[tone]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
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

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary) return null;

  const totalActionable =
    summary.loansAwaitingAdminApproval +
    summary.loansAwaitingAuditorApproval +
    summary.loansAwaitingSuperAdminApproval +
    summary.loansAwaitingDisbursement +
    summary.pendingMembers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h2 className="text-2xl font-bold tracking-tight">{profile?.fullName ?? "Administrator"}</h2>
        </div>
        <div className="flex items-center gap-2">
          {totalActionable > 0 ? (
            <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {totalActionable} item{totalActionable === 1 ? "" : "s"} need attention
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All caught up
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Members"
          value={summary.totalMembers}
          sub={`${summary.activeMembers} active${summary.pendingMembers ? ` · ${summary.pendingMembers} pending` : ""}`}
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
          label="Loans outstanding"
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

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary) return null;

  const org: "faan" | "nama" = profile.organization === "nama" ? "nama" : "faan";
  const balanceCards = BALANCE_CARDS_BY_ORG[org];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Organization:</span>
        <span
          className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase bg-primary/10 text-primary border-primary/30"
          data-testid="dashboard-org-badge"
        >
          {org}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(summary.savingsBalance)}</div>
            <p className="text-xs text-muted-foreground">
              {org === "faan" ? "Savings + Provision + Christmas" : "Savings + Provident"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Loans</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.outstandingLoanBalance)}</div>
            <p className="text-xs text-muted-foreground">{summary.activeLoanCount} active loans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Store Debt</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.storeDebt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balance Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">All individual savings and outstanding deductions.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balanceCards.map((b) => {
              const value = Number(profile[b.key] ?? 0);
              return (
                <div
                  key={b.key}
                  className="border rounded-md p-3 flex flex-col gap-1"
                  data-testid={`balance-${b.key}`}
                >
                  <span className="text-xs text-muted-foreground font-medium">{b.label}</span>
                  <span
                    className={
                      "text-lg font-semibold tabular-nums " +
                      (value === 0
                        ? "text-muted-foreground"
                        : b.direction === "credit"
                        ? "text-primary"
                        : "text-destructive")
                    }
                  >
                    {formatCurrency(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.recentTransactions.length > 0 ? (
            <div className="space-y-4">
              {summary.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <p className="font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                    <p className="text-sm text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="font-semibold">{formatCurrency(tx.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">No recent activity</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
