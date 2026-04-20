import { db, auditLogsTable } from "@workspace/db";

export async function logAudit(params: {
  actorId?: number;
  actorName?: string;
  action: string;
  entity?: string;
  entityId?: number;
  details?: string;
}) {
  await db.insert(auditLogsTable).values(params);
}
