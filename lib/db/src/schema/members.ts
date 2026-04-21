import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  staffId: text("staff_id"),
  role: text("role", {
    enum: ["member", "admin", "financial_auditor", "treasurer", "super_admin"],
  })
    .notNull()
    .default("member"),
  status: text("status", { enum: ["pending", "active", "inactive"] })
    .notNull()
    .default("pending"),
  savingsBalance: numeric("savings_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  providentBalance: numeric("provident_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  christmasBalance: numeric("christmas_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  realLoanBalance: numeric("real_loan_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  emergencyLoanBalance: numeric("emergency_loan_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  totalLoanBalance: numeric("total_loan_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  electronicsDebt: numeric("electronics_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  sElectronicsDebt: numeric("s_electronics_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  furnitureDebt: numeric("furniture_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  commodityDebt: numeric("commodity_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  ghlFormDebt: numeric("ghl_form_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  fireFundBalance: numeric("fire_fund_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  totalStoreDebt: numeric("total_store_debt", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
