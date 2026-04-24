import { Router, type IRouter } from "express";
import { db, loansTable, membersTable, transactionsTable, systemSettingsTable, notificationsTable, loanProductsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireAuditor, requireMember, requireReverification, requireSuperAdmin, requireTreasurer, AuthRequest } from "../middlewares/auth";
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

function formatLoan(loan: any, memberName: string, loanProductName: string | null = null) {
  return {
    ...loan,
    memberName,
    loanProductName,
    amount: parseFloat(loan.amount),
    interestRate: parseFloat(loan.interestRate),
    interestAmount: parseFloat(loan.interestAmount),
    totalRepayable: parseFloat(loan.totalRepayable),
    monthlyRepayment: parseFloat(loan.monthlyRepayment),
    outstandingBalance: parseFloat(loan.outstandingBalance),
  };
}

async function getLoanProductMap(): Promise<Record<number, string>> {
  const rows = await db
    .select({ id: loanProductsTable.id, name: loanProductsTable.name })
    .from(loanProductsTable);
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function getLoanWithMember(loanId: number) {
  const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, loanId));
  if (!loan) return null;
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, loan.memberId));
  let productName: string | null = null;
  if (loan.loanProductId) {
    const [p] = await db
      .select({ name: loanProductsTable.name })
      .from(loanProductsTable)
      .where(eq(loanProductsTable.id, loan.loanProductId));
    productName = p?.name ?? null;
  }
  return { loan, memberName: member?.fullName || "Unknown", productName };
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
  const productMap = await getLoanProductMap();

  res.json(
    loans.map((l) =>
      formatLoan(
        l,
        memberMap[l.memberId] || "Unknown",
        l.loanProductId ? productMap[l.loanProductId] ?? null : null,
      ),
    ),
  );
});

async function resolveProductForApply(
  loanProductId: number,
  tenureMonths: number,
): Promise<
  | { ok: true; product: typeof loanProductsTable.$inferSelect; rate: number }
  | { ok: false; status: number; error: string }
> {
  if (!Number.isInteger(tenureMonths) || tenureMonths < 1) {
    return { ok: false, status: 400, error: "Tenure must be at least 1 month" };
  }
  const [product] = await db
    .select()
    .from(loanProductsTable)
    .where(eq(loanProductsTable.id, loanProductId));
  if (!product) {
    return { ok: false, status: 404, error: "Loan product not found" };
  }
  if (!product.isActive) {
    return { ok: false, status: 400, error: "This loan product is not currently available" };
  }
  if (tenureMonths > product.maxTenureMonths) {
    return {
      ok: false,
      status: 400,
      error: `Tenure cannot exceed ${product.maxTenureMonths} month(s) for ${product.name}`,
    };
  }
  return { ok: true, product, rate: parseFloat(product.interestRate) };
}

router.post("/loans", requireAuth, requireMember, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const resolved = await resolveProductForApply(
    parsed.data.loanProductId,
    parsed.data.tenureMonths,
  );
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { product, rate } = resolved;
  const principal = parsed.data.amount;
  const interestAmount = (principal * rate) / 100;
  const totalRepayable = principal + interestAmount;
  const monthlyRepayment = totalRepayable / parsed.data.tenureMonths;

  const [loan] = await db
    .insert(loansTable)
    .values({
      memberId: req.memberId!,
      loanProductId: product.id,
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
    details: `${product ? product.name + " — " : ""}Loan application of ₦${principal.toLocaleString()} for ${parsed.data.tenureMonths} months`,
  });

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));
  res.status(201).json(formatLoan(loan, member?.fullName || "Unknown", product?.name ?? null));
});

router.get("/loans/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const loans = await db.select().from(loansTable).where(eq(loansTable.memberId, req.memberId!));
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));
  const productMap = await getLoanProductMap();
  res.json(
    loans.map((l) =>
      formatLoan(
        l,
        member?.fullName || "Unknown",
        l.loanProductId ? productMap[l.loanProductId] ?? null : null,
      ),
    ),
  );
});

router.post("/loans/calculate", requireAuth, requireMember, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CalculateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const resolved = await resolveProductForApply(
    parsed.data.loanProductId,
    parsed.data.tenureMonths,
  );
  if (!resolved.ok) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { rate } = resolved;
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

router.post("/loans/:id/approve", requireAuth, requireReverification, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const { loan } = result;
  const role = req.memberRole!;
  const actorId = req.memberId!;

  // Strict state machine: each stage requires a specific role and the prior stage must be complete.
  // Separation of duties: the same actor cannot approve more than one stage of the same loan.
  let updateData: Record<string, any>;
  let newStatus: string;

  if (loan.status === "pending") {
    if (role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Only an Admin can perform the first approval" });
      return;
    }
    newStatus = "admin_approved";
    updateData = { status: newStatus, adminApprovedAt: new Date(), adminApprovedBy: actorId };
  } else if (loan.status === "admin_approved") {
    if (role !== "financial_auditor" && role !== "super_admin") {
      res.status(403).json({ error: "Only the Financial Auditor can perform the second approval" });
      return;
    }
    if (loan.adminApprovedBy === actorId) {
      res.status(403).json({ error: "Separation of duties: you already approved a previous stage of this loan" });
      return;
    }
    newStatus = "auditor_approved";
    updateData = { status: newStatus, auditorApprovedAt: new Date(), auditorApprovedBy: actorId };
  } else if (loan.status === "auditor_approved") {
    if (role !== "super_admin") {
      res.status(403).json({ error: "Only a Super Admin can perform the final approval" });
      return;
    }
    if (loan.adminApprovedBy === actorId || loan.auditorApprovedBy === actorId) {
      res.status(403).json({ error: "Separation of duties: you already approved a previous stage of this loan" });
      return;
    }
    newStatus = "super_admin_approved";
    updateData = { status: newStatus, superAdminApprovedAt: new Date(), superAdminApprovedBy: actorId };
  } else {
    res.status(400).json({ error: `Loan cannot be approved from current status: ${loan.status}` });
    return;
  }

  // Compare-and-set: include the expected prior status so concurrent approvals
  // cannot both succeed against the same row.
  const [updated] = await db
    .update(loansTable)
    .set(updateData)
    .where(and(eq(loansTable.id, id), eq(loansTable.status, loan.status)))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Loan status changed since you loaded it. Please refresh and try again." });
    return;
  }

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

router.post("/loans/:id/fast-track-approve", requireAuth, requireReverification, async (req: AuthRequest, res): Promise<void> => {
  const role = req.memberRole!;
  if (role !== "super_admin") {
    res.status(403).json({ error: "Only a Super Admin can fast-track approve a loan" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const result = await getLoanWithMember(id);
  if (!result) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }

  const { loan } = result;
  const actorId = req.memberId!;

  const eligible = ["pending", "admin_approved", "auditor_approved"];
  if (!eligible.includes(loan.status)) {
    res.status(400).json({
      error: `Fast-track approval is only available from pending, admin_approved, or auditor_approved (current status: ${loan.status}).`,
    });
    return;
  }

  const skipped: string[] = [];
  if (!loan.adminApprovedAt) skipped.push("admin");
  if (!loan.auditorApprovedAt) skipped.push("auditor");

  // Compare-and-set on the prior status to prevent racing with a regular approval.
  const [updated] = await db
    .update(loansTable)
    .set({
      status: "super_admin_approved",
      superAdminApprovedAt: new Date(),
      superAdminApprovedBy: actorId,
    })
    .where(and(eq(loansTable.id, id), eq(loansTable.status, loan.status)))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Loan status changed since you loaded it. Please refresh and try again." });
    return;
  }

  await logAudit({
    actorId: req.memberId,
    action: "FAST_TRACK_APPROVE_LOAN",
    entity: "loan",
    entityId: id,
    details:
      skipped.length > 0
        ? `Super-admin override: bypassed ${skipped.join(" and ")} stage${skipped.length === 1 ? "" : "s"}; status set to super_admin_approved.`
        : "Super-admin override: status set to super_admin_approved.",
  });

  await sendNotification({
    memberId: loan.memberId,
    type: "loan_update",
    title: "Loan Application Update",
    message: "Your loan application has been approved by the Super Admin and is awaiting disbursement.",
  });

  res.json(formatLoan(updated, result.memberName, result.productName ?? null));
});

router.post("/loans/:id/reject", requireAuth, requireReverification, async (req: AuthRequest, res): Promise<void> => {
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

  // Reject is only valid from a non-terminal status. Compare-and-set protects against
  // racing with an approve/disburse in flight.
  if (["disbursed", "rejected"].includes(result.loan.status)) {
    res.status(400).json({ error: `Loan in status "${result.loan.status}" cannot be rejected` });
    return;
  }

  const [updated] = await db
    .update(loansTable)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: req.memberId,
      rejectionReason: notes ?? null,
    })
    .where(and(eq(loansTable.id, id), eq(loansTable.status, result.loan.status)))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Loan status changed since you loaded it. Please refresh and try again." });
    return;
  }

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

router.post("/loans/:id/disburse", requireAuth, requireTreasurer, requireReverification, async (req: AuthRequest, res): Promise<void> => {
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

  // Step-up confirmation: treasurer must type the exact phrase to authorize money movement.
  // This is an auditable, deliberate friction step in addition to role/auth checks.
  const expectedPhrase = `DISBURSE-${id}`;
  const provided = (req.body?.confirmationPhrase ?? "").toString().trim();
  if (provided !== expectedPhrase) {
    res.status(403).json({
      error: `Disbursement requires confirmation. Type "${expectedPhrase}" in the confirmationPhrase field to authorize.`,
    });
    return;
  }

  // Separation of duties: the disbursing treasurer must not have approved any prior stage of this loan.
  const actorId = req.memberId!;
  if (
    result.loan.adminApprovedBy === actorId ||
    result.loan.auditorApprovedBy === actorId ||
    result.loan.superAdminApprovedBy === actorId
  ) {
    res.status(403).json({ error: "Separation of duties: you cannot disburse a loan you previously approved" });
    return;
  }

  // Run inside a transaction with row lock and compare-and-set to fully prevent
  // double-disbursement under concurrent requests.
  const txResult = await db.transaction(async (tx) => {
    // Lock the loan row for the duration of the transaction.
    const locked = await tx.execute(
      sql`SELECT id, status, outstanding_balance FROM loans WHERE id = ${id} FOR UPDATE`,
    );
    const lockedRow = (locked as any).rows?.[0];
    if (!lockedRow) return { ok: false as const, code: 404, error: "Loan not found" };
    if (lockedRow.status !== "super_admin_approved") {
      return { ok: false as const, code: 409, error: `Loan is in status "${lockedRow.status}" and cannot be disbursed` };
    }

    const outstanding = parseFloat(lockedRow.outstanding_balance);

    const [u] = await tx
      .update(loansTable)
      .set({ status: "disbursed", disbursedAt: new Date(), disbursedBy: actorId })
      .where(and(eq(loansTable.id, id), eq(loansTable.status, "super_admin_approved")))
      .returning();

    if (!u) return { ok: false as const, code: 409, error: "Loan was modified concurrently. Please refresh." };

    await tx
      .update(membersTable)
      .set({
        totalLoanBalance: sql`${membersTable.totalLoanBalance} + ${outstanding}`,
      })
      .where(eq(membersTable.id, result.loan.memberId));

    return { ok: true as const, loan: u };
  });

  if (!txResult.ok) {
    res.status(txResult.code).json({ error: txResult.error });
    return;
  }
  const updated = txResult.loan;

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
