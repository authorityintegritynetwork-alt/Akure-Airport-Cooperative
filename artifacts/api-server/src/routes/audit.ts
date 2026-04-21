import { Router, type IRouter } from "express";
import { db, auditLogsTable, membersTable } from "@workspace/db";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { requireAuth, requireAuditor, AuthRequest } from "../middlewares/auth";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function csvEscape(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Defend against CSV formula injection in spreadsheet apps
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/audit-logs", requireAuth, requireAuditor, async (req: AuthRequest, res): Promise<void> => {
  // Coerce ISO date strings → Date before zod validation (query params arrive as strings)
  const rawQuery: Record<string, unknown> = { ...req.query };
  for (const k of ["dateFrom", "dateTo"] as const) {
    const v = rawQuery[k];
    if (typeof v === "string" && v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) rawQuery[k] = d;
    }
  }
  const params = ListAuditLogsQueryParams.safeParse(rawQuery);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const p = params.data as any;

  const conditions: any[] = [];
  if (p.action) conditions.push(ilike(auditLogsTable.action, `%${p.action}%`));
  if (p.entity) conditions.push(eq(auditLogsTable.entity, p.entity));
  if (p.actorId) conditions.push(eq(auditLogsTable.actorId, p.actorId));
  if (p.search) {
    conditions.push(
      or(
        ilike(auditLogsTable.actorName, `%${p.search}%`),
        ilike(auditLogsTable.details, `%${p.search}%`),
      )!,
    );
  }
  if (p.dateFrom) {
    const d = new Date(p.dateFrom);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLogsTable.createdAt, d));
  }
  if (p.dateTo) {
    const d = new Date(p.dateTo);
    if (!isNaN(d.getTime())) conditions.push(lte(auditLogsTable.createdAt, d));
  }

  const whereClause = conditions.length
    ? conditions.length === 1 ? conditions[0] : and(...conditions)
    : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLogsTable)
    .where(whereClause as any);

  const isCsv = (req.query.format as string)?.toLowerCase() === "csv";
  const limit = isCsv ? Math.min(p.limit ?? 5000, 10000) : (p.limit ?? 50);
  const offset = isCsv ? 0 : (p.offset ?? 0);

  const baseQuery = db.select().from(auditLogsTable);
  const logs = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.setHeader("X-Total-Count", String(total));

  if (isCsv) {
    const header = ["id", "createdAt", "actorId", "actorName", "action", "entity", "entityId", "details"];
    const rows = logs.map((l) =>
      [l.id, l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt, l.actorId, l.actorName, l.action, l.entity, l.entityId, l.details]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
    return;
  }

  res.json(logs);
});

export default router;
