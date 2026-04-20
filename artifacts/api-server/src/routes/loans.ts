import { Router, type IRouter } from "express";
import { db, loansTable, membersTable, transactionsTable, systemSettingsTable, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, requireAuditor, requireSuperAdmin, requireTreasurer, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import {
  CreateLoanBody,
  CalculateLoanBody,
  GetLoanParams,
  ApproveLoanParams,
  ApproveLoanBody,
  RejectLoanParams,
  RejectLoanBody,
  DisburseLoanParams,
  DisburseLoanBody,
  ListLoansQueryParams,
  GetLoanRepaymentsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatLoan(loan: any, memberName: string) {
  return {
    ...loan,
    memberName,
    amount: parseFloat(loan.amount),
    interestRate: parseFloat(loan.interestRate),
    interestAmount: parseFloat(loan.interestAmount),
    totalRepayable: parseFloat(loan.totalRepayable),
    monthlyRepayment: parseFloat(loan.monthlyRepayment),
    outstandingBalance: parseFloat(loan.outstandingBalance),
  };
}

async function getLoanWithMember(loanId: number) {
  const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, loanId));
  if (!loan) return null;
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, loan.memberId));
  return { loan, memberName: member?.fullName || "Unknown" };
}

async function getSettings() {
  const [settings] = await db.select().from(systemSettingsTable);
  return settings;
}

router.get("/loans", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const params = ListLoansQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.status) conditions.push(eq(loansTable.status, params.data.status as any));
  if (params.data.memberId) conditions.push(eq(loansTable.memberId, params.data.memberId));

  const loans = conditions.length
    ? await db.select().from(loansTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await db.select().from(loansTable);

  const members = await db.select({ id: membersTable.id, fullName: membersTable.fullName }).from(membersTable);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

  res.json(loans.map((l) => formatLoan(l, memberMap[l.memberId] || "Unknown")));
});

router.post("/loans", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getSettings();
  const rate = settings ? parseFloat(settings.loanInterestRate) : 10;
  const principal = parsed.data.amount;
  const interestAmount = (principal * rate) / 100;
  const totalRepayable = principal + interestAmount;
  const monthlyRepayment = totalRepayable / parsed.data.tenureMonths;

  const [loan] = await db
    .insert(loansTable)
    .values({
      memberId: req.memberId!,
      amount: principal.toString(),
      interestRate: rate.toString(),
      interestAmount: interestAmount.toString(),
      totalRepayable: totalRepayable.toString(),
      monthlyRepayment: monthlyRepayment.toString(),
      tenureMonths: parsed.data.tenureMonths,
      purpose: parsed.data.purpose ?? undefined,
      outstandingBalance: totalRepayable.toString(),
    })
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "APPLY_LOAN",
    entity: "loan",
    entityId: loan.id,
    details: `Loan application of ₦${principal.toLocaleString()} for ${parsed.data.tenureMonths} months`,
  });

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));
  res.status(201).json(formatLoan(loan, member?.fullName || "Unknown"));
});

router.get("/loans/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const loans = await db.select().from(loansTable).where(eq(loansTable.memberId, req.memberId!));
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));
  res.json(loans.map((l) => formatLoan(l, member?.fullName || "Unknown")));
});

router.post("/loans/calculate", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CalculateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getSettings();
  const rate = settings ? parseFloat(settings.loanInterestRate) : 10;
  const principal = parsed.data.amount;
  const interestAmount = (principal * rate) / 100;
  const totalRepayable = principal + interestAmount;
  const monthlyRepayment = totalRepayable / parsed.data.tenureMonths;

  res.json({
    principal,
    interestRate: rate,
    interestAmount,
    totalRepayable,
    monthlyRepayment,
    tenureMonths: parsed.data.tenureMonths,
  });
});

router.get("/loans/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  if (req.memberRole === "member" && result.loan.memberId !== req.memberId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(formatLoan(result.loan, result.memberName));
});

router.post("/loans/:id/approve", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const { loan } = result;
  const role = req.memberRole!;
  let updateData: any = {};
  let newStatus: string;

  if (role === "admin" || role === "super_admin") {
    if (loan.status !== "pending") {
      res.status(400).json({ error: "Loan must be in pending status for admin approval" });
      return;
    }
    newStatus = "admin_approved";
    updateData = { status: newStatus, adminApprovedAt: new Date(), adminApprovedBy: req.memberId };
  } else if (role === "financial_auditor") {
    if (loan.status !== "admin_approved") {
      res.status(400).json({ error: "Loan must be admin-approved first" });
      return;
    }
    newStatus = "auditor_approved";
    updateData = { status: newStatus, auditorApprovedAt: new Date(), auditorApprovedBy: req.memberId };
  } else if (role === "super_admin" && loan.status === "auditor_approved") {
    newStatus = "super_admin_approved";
    updateData = { status: newStatus, superAdminApprovedAt: new Date(), superAdminApprovedBy: req.memberId };
  } else {
    res.status(403).json({ error: "You cannot approve this loan at its current stage" });
    return;
  }

  if (role === "super_admin" && loan.status === "auditor_approved") {
    newStatus = "super_admin_approved";
    updateData = { status: newStatus, superAdminApprovedAt: new Date(), superAdminApprovedBy: req.memberId };
  }

  const [updated] = await db
    .update(loansTable)
    .set(updateData)
    .where(eq(loansTable.id, id))
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "APPROVE_LOAN",
    entity: "loan",
    entityId: id,
    details: `Loan status updated to ${newStatus}`,
  });

  await sendNotification({
    memberId: loan.memberId,
    type: "loan_update",
    title: "Loan Application Update",
    message: `Your loan application has been approved and is now at status: ${newStatus.replace(/_/g, " ")}`,
  });

  res.json(formatLoan(updated, result.memberName));
});

router.post("/loans/:id/reject", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const role = req.memberRole!;
  if (!["admin", "financial_auditor", "super_admin"].includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const parsed = RejectLoanBody.safeParse(req.body);
  const notes = parsed.success ? parsed.data.notes : undefined;

  const [updated] = await db
    .update(loansTable)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: req.memberId,
      rejectionReason: notes ?? null,
    })
    .where(eq(loansTable.id, id))
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "REJECT_LOAN",
    entity: "loan",
    entityId: id,
    details: `Loan rejected. Reason: ${notes || "none"}`,
  });

  await sendNotification({
    memberId: result.loan.memberId,
    type: "loan_update",
    title: "Loan Application Rejected",
    message: `Your loan application has been rejected. ${notes ? `Reason: ${notes}` : ""}`,
  });

  res.json(formatLoan(updated, result.memberName));
});

router.post("/loans/:id/disburse", requireAuth, requireTreasurer, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  if (result.loan.status !== "super_admin_approved") {
    res.status(400).json({ error: "Loan must have super admin approval before disbursement" });
    return;
  }

  const [updated] = await db
    .update(loansTable)
    .set({ status: "disbursed", disbursedAt: new Date(), disbursedBy: req.memberId })
    .where(eq(loansTable.id, id))
    .returning();

  await db
    .update(membersTable)
    .set({
      totalLoanBalance: db
        .select({ val: membersTable.totalLoanBalance })
        .from(membersTable)
        .where(eq(membersTable.id, result.loan.memberId))
        .then(() => (parseFloat(result.loan.outstandingBalance)).toString()) as any,
    })
    .where(eq(membersTable.id, result.loan.memberId));

  await logAudit({
    actorId: req.memberId,
    action: "DISBURSE_LOAN",
    entity: "loan",
    entityId: id,
    details: `Loan of ₦${parseFloat(result.loan.amount).toLocaleString()} disbursed`,
  });

  await sendNotification({
    memberId: result.loan.memberId,
    type: "loan_update",
    title: "Loan Disbursed",
    message: `Your loan of ₦${parseFloat(result.loan.amount).toLocaleString()} has been disbursed successfully.`,
  });

  res.json(formatLoan(updated, result.memberName));
});

router.get("/loans/:id/repayments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, id));
  if (!loan) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  if (req.memberRole === "member" && loan.memberId !== req.memberId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const repayments = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.memberId, loan.memberId), eq(transactionsTable.type, "loan_repayment")));

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, loan.memberId));
  res.json(
    repayments.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      memberName: member?.fullName || "Unknown",
    })),
  );
});

export default router;
