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
      {isAdmin ? <AdminDashboard /> : <MemberDashboard />}
    </div>
  );
}

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

function MemberDashboard() {
  const { data: summary, isLoading } = useGetMemberDashboardSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(summary.savingsBalance)}</div>
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
