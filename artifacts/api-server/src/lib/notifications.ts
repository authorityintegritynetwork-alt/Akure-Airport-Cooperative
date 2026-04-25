import { db, notificationsTable } from "@workspace/db";

export type NotificationType =
  | "loan_update"
  | "transaction"
  | "store_purchase"
  | "system"
  | "announcement"
  | "support";

export async function sendNotification(params: {
  memberId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}) {
  await db.insert(notificationsTable).values(params);
}

export async function sendNotifications(
  rows: Array<{
    memberId: number;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
  }>,
) {
  if (rows.length === 0) return;
  await db.insert(notificationsTable).values(rows);
}
