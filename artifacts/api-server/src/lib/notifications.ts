import { db, notificationsTable } from "@workspace/db";

export async function sendNotification(params: {
  memberId: number;
  type: "loan_update" | "transaction" | "store_purchase" | "system";
  title: string;
  message: string;
}) {
  await db.insert(notificationsTable).values(params);
}
