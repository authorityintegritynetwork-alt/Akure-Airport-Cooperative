import { Router, type IRouter } from "express";
import { db, transactionsTable, membersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";
import { ListTransactionsQueryParams, ListMyTransactionsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichTransactions(txs: any[]) {
  if (txs.length === 0) return [];
  const memberIds = [...new Set(txs.map((t) => t.memberId))];
  const members = await db
    .select({ id: membersTable.id, fullName: membersTable.fullName })
    .from(membersTable);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));
  return txs.map((t) => ({
    ...t,
    amount: parseFloat(t.amount),
    memberName: memberMap[t.memberId] || "Unknown",
  }));
}

router.get("/transactions", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const params = ListTransactionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.memberId) conditions.push(eq(transactionsTable.memberId, params.data.memberId));
  if (params.data.type) conditions.push(eq(transactionsTable.type, params.data.type as any));
  if (params.data.month) conditions.push(eq(transactionsTable.month, params.data.month));
  if (params.data.year) conditions.push(eq(transactionsTable.year, params.data.year));

  const txs = conditions.length
    ? await db
        .select()
        .from(transactionsTable)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await db.select().from(transactionsTable);

  res.json(await enrichTransactions(txs));
});

router.get("/transactions/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = ListMyTransactionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [eq(transactionsTable.memberId, req.memberId!)];
  if (params.data.type) conditions.push(eq(transactionsTable.type, params.data.type as any));
  if (params.data.year) conditions.push(eq(transactionsTable.year, params.data.year));

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(...conditions));

  res.json(await enrichTransactions(txs));
});

export default router;
