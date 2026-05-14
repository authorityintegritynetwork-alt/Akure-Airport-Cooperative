import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";
import { loanProductsTable } from "./loanProducts";

export const loansTable = pgTable(
  "loans",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    loanProductId: integer("loan_product_id").references(() => loanProductsTable.id),
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
  },
  (t) => ({
    memberIdx: index("loans_member_idx").on(t.memberId),
    statusIdx: index("loans_status_idx").on(t.status),
    productIdx: index("loans_product_idx").on(t.loanProductId),
    createdIdx: index("loans_created_idx").on(t.createdAt),
    amountPositive: check("loans_amount_positive", sql`${t.amount} > 0`),
    interestRateNonNeg: check(
      "loans_interest_rate_non_neg",
      sql`${t.interestRate} >= 0`,
    ),
    interestAmountNonNeg: check(
      "loans_interest_amount_non_neg",
      sql`${t.interestAmount} >= 0`,
    ),
    totalRepayablePositive: check(
      "loans_total_repayable_positive",
      sql`${t.totalRepayable} > 0`,
    ),
    monthlyRepaymentNonNeg: check(
      "loans_monthly_repayment_non_neg",
      sql`${t.monthlyRepayment} >= 0`,
    ),
    outstandingNonNeg: check(
      "loans_outstanding_non_neg",
      sql`${t.outstandingBalance} >= 0`,
    ),
    tenurePositive: check("loans_tenure_positive", sql`${t.tenureMonths} > 0`),
  }),
);

export const insertLoanSchema = createInsertSchema(loansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loansTable.$inferSelect;
