import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const loansTable = pgTable("loans", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => membersTable.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
  interestAmount: numeric("interest_amount", { precision: 15, scale: 2 }).notNull(),
  totalRepayable: numeric("total_repayable", { precision: 15, scale: 2 }).notNull(),
  monthlyRepayment: numeric("monthly_repayment", { precision: 15, scale: 2 }).notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  purpose: text("purpose"),
  status: text("status", {
    enum: [
      "pending",
      "admin_approved",
      "auditor_approved",
      "super_admin_approved",
      "disbursed",
      "rejected",
    ],
  })
    .notNull()
    .default("pending"),
  outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 }).notNull(),
  adminApprovedAt: timestamp("admin_approved_at", { withTimezone: true }),
  adminApprovedBy: integer("admin_approved_by"),
  auditorApprovedAt: timestamp("auditor_approved_at", { withTimezone: true }),
  auditorApprovedBy: integer("auditor_approved_by"),
  superAdminApprovedAt: timestamp("super_admin_approved_at", { withTimezone: true }),
  superAdminApprovedBy: integer("super_admin_approved_by"),
  disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
  disbursedBy: integer("disbursed_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: integer("rejected_by"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLoanSchema = createInsertSchema(loansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loansTable.$inferSelect;
