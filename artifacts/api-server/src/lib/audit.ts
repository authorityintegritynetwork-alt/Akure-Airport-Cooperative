import { db, auditLogsTable, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function logAudit(params: {
  actorId?: number;
  actorName?: string;
  action: string;
  entity?: string;
  entityId?: number;
  details?: string;
}) {
  let actorName = params.actorName;
  if (!actorName && params.actorId) {
    const [m] = await db
      .select({ fullName: membersTable.fullName })
      .from(membersTable)
      .where(eq(membersTable.id, params.actorId))
      .limit(1);
    if (m?.fullName) actorName = m.fullName;
  }
  await db.insert(auditLogsTable).values({ ...params, actorName: actorName ?? null });
}
