import { Router, type IRouter } from "express";
import { db, membersTable, loansTable, storePurchasesTable, transactionsTable, auditLogsTable, storeItemsTable, notificationsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/admin-summary", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const allMembers = await db.select().from(membersTable);
  const totalMembers = allMembers.length;
  const activeMembers = allMembers.filter((m) => m.status === "active").length;
  const pendingMembers = allMembers.filter((m) => m.status === "pending").length;
  const totalSavings = allMembers.reduce((sum, m) => sum + parseFloat(m.savingsBalance), 0);
  const totalLoansOutstanding = allMembers.reduce((sum, m) => sum + parseFloat(m.totalLoanBalance), 0);
  const totalStoreDebt = allMembers.reduce((sum, m) => sum + parseFloat(m.totalStoreDebt), 0);

  const allLoans = await db.select().from(loansTable);
  const loansAwaitingAdminApproval = allLoans.filter((l) => l.status === "pending").length;
  const loansAwaitingAuditorApproval = allLoans.filter((l) => l.status === "admin_approved").length;
  const loansAwaitingSuperAdminApproval = allLoans.filter((l) => l.status === "auditor_approved").length;
  const loansAwaitingDisbursement = allLoans.filter((l) => l.status === "super_admin_approved").length;

  const storeItems = await db.select().from(storeItemsTable);

  res.json({
    totalMembers,
    activeMembers,
    pendingMembers,
    totalSavings,
    totalLoansOutstanding,
    totalStoreDebt,
    loansAwaitingAdminApproval,
    loansAwaitingAuditorApproval,
    loansAwaitingSuperAdminApproval,
    loansAwaitingDisbursement,
    storeItemsCount: storeItems.length,
  });
});

router.get("/dashboard/member-summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const activeLoans = await db
    .select()
    .from(loansTable)
    .where(and(eq(loansTable.memberId, req.memberId!), eq(loansTable.status, "disbursed")));

  const recentTx = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.memberId, req.memberId!))
    .orderBy(transactionsTable.createdAt)
    .limit(5);

  res.json({
    savingsBalance: parseFloat(member.savingsBalance),
    activeLoanCount: activeLoans.length,
    outstandingLoanBalance: parseFloat(member.totalLoanBalance),
    storeDebt: parseFloat(member.totalStoreDebt),
    recentTransactions: recentTx.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      memberName: member.fullName,
    })),
  });
});

router.get("/dashboard/loan-pipeline", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const loans = await db.select().from(loansTable);
  const statuses = ["pending", "admin_approved", "auditor_approved", "super_admin_approved", "disbursed", "rejected"];
  const pipeline = statuses.map((status) => {
    const matching = loans.filter((l) => l.status === status);
    return {
      status,
      count: matching.length,
      totalAmount: matching.reduce((sum, l) => sum + parseFloat(l.amount), 0),
    };
  });
  res.json(pipeline);
});

router.get("/dashboard/recent-activity", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const limitParam = req.query.limit;
  const limit = limitParam ? parseInt(String(limitParam), 10) : 20;

  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(auditLogsTable.createdAt)
    .limit(limit);

  res.json(
    logs.map((l) => ({
      id: l.id,
      type: l.action,
      description: l.details || l.action,
      actorName: l.actorName ?? null,
      createdAt: l.createdAt,
    })),
  );
});

export default router;
