import { useGetProfile, useGetAdminDashboardSummary, useGetMemberDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CreditCard, ShoppingBag, Users, Activity } from "lucide-react";
import { Redirect } from "wouter";

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

const BALANCE_CARDS = [
  { key: "savingsBalance", label: "Savings", direction: "credit" },
  { key: "providentBalance", label: "Provident", direction: "credit" },
  { key: "christmasBalance", label: "Christmas", direction: "credit" },
  { key: "realLoanBalance", label: "Real Loan", direction: "debit" },
  { key: "emergencyLoanBalance", label: "Emergency Loan", direction: "debit" },
  { key: "electronicsDebt", label: "Electronics", direction: "debit" },
  { key: "sElectronicsDebt", label: "S/Electronics", direction: "debit" },
  { key: "furnitureDebt", label: "Furniture", direction: "debit" },
  { key: "commodityDebt", label: "Commodity", direction: "debit" },
  { key: "ghlFormDebt", label: "Loan Form Cost", direction: "debit" },
  { key: "fireFundBalance", label: "Fire Fund", direction: "credit" },
] as const;

function AdminDashboard() {
  const { data: summary, isLoading } = useGetAdminDashboardSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalMembers}</div>
            <p className="text-xs text-muted-foreground">{summary.activeMembers} active, {summary.pendingMembers} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalSavings)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Loans Outstanding</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalLoansOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Store Debt</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalStoreDebt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Action Required</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex justify-between border-b pb-2">
            <span className="text-sm">Loans awaiting admin approval</span>
            <span className="font-medium">{summary.loansAwaitingAdminApproval}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-sm">Loans awaiting auditor approval</span>
            <span className="font-medium">{summary.loansAwaitingAuditorApproval}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-sm">Loans awaiting super admin</span>
            <span className="font-medium">{summary.loansAwaitingSuperAdminApproval}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-sm">Loans awaiting disbursement</span>
            <span className="font-medium">{summary.loansAwaitingDisbursement}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MemberDashboard({ profile }: { profile: any }) {
  const { data: summary, isLoading } = useGetMemberDashboardSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(summary.savingsBalance)}</div>
            <p className="text-xs text-muted-foreground">Savings + Provident + Christmas</p>
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
            {BALANCE_CARDS.map((b) => {
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
