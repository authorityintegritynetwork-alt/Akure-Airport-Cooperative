import { Router, type IRouter } from "express";
import { db, auditLogsTable, membersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAuditor, AuthRequest } from "../middlewares/auth";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/audit-logs", requireAuth, requireAuditor, async (req: AuthRequest, res): Promise<void> => {
  const params = ListAuditLogsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(auditLogsTable.createdAt)
    .limit(params.data.limit ?? 50)
    .offset(params.data.offset ?? 0);

  res.json(logs);
});

export default router;
