import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loanProductsTable = pgTable(
  "loan_products",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
    defaultTenureMonths: integer("default_tenure_months").notNull(),
    maxTenureMonths: integer("max_tenure_months").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    activeIdx: index("loan_products_active_idx").on(t.isActive),
    interestRateNonNeg: check(
      "loan_products_interest_rate_non_neg",
      sql`${t.interestRate} >= 0`,
    ),
    defaultTenurePositive: check(
      "loan_products_default_tenure_positive",
      sql`${t.defaultTenureMonths} > 0`,
    ),
    maxTenurePositive: check(
      "loan_products_max_tenure_positive",
      sql`${t.maxTenureMonths} > 0`,
    ),
    tenureOrder: check(
      "loan_products_tenure_order",
      sql`${t.maxTenureMonths} >= ${t.defaultTenureMonths}`,
    ),
  }),
);

export const insertLoanProductSchema = createInsertSchema(loanProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLoanProduct = z.infer<typeof insertLoanProductSchema>;
export type LoanProduct = typeof loanProductsTable.$inferSelect;
