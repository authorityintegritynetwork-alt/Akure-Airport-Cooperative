import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => membersTable.id),
  type: text("type", {
    enum: [
      "savings",
      "provident",
      "christmas",
      "real_loan_repayment",
      "emergency_loan_repayment",
      "loan_repayment",
      "electronics_repayment",
      "s_electronics_repayment",
      "furniture_repayment",
      "commodity_repayment",
      "ghl_form_repayment",
      "fire",
      "fuel_venture_repayment",
      "land_loan_repayment",
      "store_repayment",
    ],
  }).notNull(),
  category: text("category"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  uploadRecordId: integer("upload_record_id"),
  month: text("month"),
  year: integer("year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
