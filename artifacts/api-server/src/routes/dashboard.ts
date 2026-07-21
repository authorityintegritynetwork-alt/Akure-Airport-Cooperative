import { Router, type IRouter } from "express";
import { db, membersTable, loansTable, storePurchasesTable, transactionsTable, auditLogsTable, storeItemsTable, notificationsTable, systemSettingsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/admin-summary", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const [allMembers, allLoans, allPurchases, storeItems] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(loansTable),
    db.select().from(storePurchasesTable),
    db.select().from(storeItemsTable),
  ]);

  const totalMembers = allMembers.length;
  const activeMembers = allMembers.filter((m) => m.status === "active").length;
  const pendingMembers = allMembers.filter((m) => m.status === "pending").length;

  // Savings balance only (christmas is tracked separately, not included here)
  const totalSavings = allMembers.reduce((sum, m) => sum + parseFloat(m.savingsBalance), 0);

  // Real loan paid = cumulative real loan repayments recorded against all members
  const totalRealLoanPaid = allMembers.reduce((sum, m) => sum + parseFloat(m.realLoanBalance), 0);

  // Store debt = outstanding balance on actual store purchases only (not loan columns)
  const totalStoreDebt = allPurchases
    .filter((p) => p.status !== "settled")
    .reduce((sum, p) => sum + parseFloat(p.outstandingBalance), 0);

  const loansAwaitingAdminApproval = allLoans.filter((l) => l.status === "pending").length;
  const loansAwaitingAuditorApproval = allLoans.filter((l) => l.status === "admin_approved").length;
  const loansAwaitingSuperAdminApproval = allLoans.filter((l) => l.status === "auditor_approved").length;
  const loansAwaitingDisbursement = allLoans.filter((l) => l.status === "super_admin_approved").length;

  res.json({
    totalMembers,
    activeMembers,
    pendingMembers,
    totalSavings,
    totalRealLoanPaid,
    totalStoreDebt,
    loansAwaitingAdminApproval,
    loansAwaitingAuditorApproval,
    loansAwaitingSuperAdminApproval,
    loansAwaitingDisbursement,
    storeItemsCount: storeItems.length,
  });
});

router.get("/dashboard/member-summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [[member], [settings]] = await Promise.all([
    db.select().from(membersTable).where(eq(membersTable.id, req.memberId!)),
    db.select({ balancesHidden: systemSettingsTable.balancesHidden }).from(systemSettingsTable),
  ]);

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  // Mask all financial data for regular members when balance hiding is active.
  const isMember = !["admin", "financial_auditor", "treasurer", "super_admin"].includes(member.role);
  if (isMember && settings?.balancesHidden) {
    res.json({
      savingsBalance: 0,
      christmasBalance: 0,
      providentBalance: 0,
      fuelVentureBalance: 0,
      activeLoanCount: 0,
      storeDebt: 0,
      recentTransactions: [],
    });
    return;
  }

  const [activeLoans, recentTx, memberPurchases] = await Promise.all([
    db.select().from(loansTable).where(and(eq(loansTable.memberId, req.memberId!), eq(loansTable.status, "disbursed"))),
    db.select().from(transactionsTable).where(eq(transactionsTable.memberId, req.memberId!)).orderBy(transactionsTable.createdAt).limit(5),
    db.select().from(storePurchasesTable).where(eq(storePurchasesTable.memberId, req.memberId!)),
  ]);

  // Store debt = outstanding balance on actual store purchases only
  const storeDebt = memberPurchases
    .filter((p) => p.status !== "settled")
    .reduce((sum, p) => sum + parseFloat(p.outstandingBalance), 0);

  res.json({
    savingsBalance: parseFloat(member.savingsBalance),
    christmasBalance: parseFloat(member.christmasBalance),
    providentBalance: parseFloat(member.providentBalance),
    fuelVentureBalance: parseFloat(member.fuelVentureBalance),
    activeLoanCount: activeLoans.length,
    storeDebt,
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
