import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membersTable = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").unique(),
    fullName: text("full_name").notNull(),
    email: text("email").unique(),
    phone: text("phone"),
    staffId: text("staff_id"),
    pendingClerkUserId: text("pending_clerk_user_id").unique(),
    pendingEmail: text("pending_email"),
    pendingName: text("pending_name"),
    role: text("role", {
      enum: ["member", "admin", "financial_auditor", "treasurer", "super_admin"],
    })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["pending", "active", "inactive"] })
      .notNull()
      .default("pending"),
    organization: text("organization").notNull().default("FAAN"),
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
    fuelVentureBalance: numeric("fuel_venture_balance", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    landLoanBalance: numeric("land_loan_balance", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalStoreDebt: numeric("total_store_debt", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    failedStepUpAttempts: integer("failed_step_up_attempts").notNull().default(0),
    stepUpLockedUntil: timestamp("step_up_locked_until", { withTimezone: true }),
    obSavingsBalance: numeric("ob_savings_balance", { precision: 15, scale: 2 }),
    obProvidentBalance: numeric("ob_provident_balance", { precision: 15, scale: 2 }),
    obChristmasBalance: numeric("ob_christmas_balance", { precision: 15, scale: 2 }),
    obRealLoanBalance: numeric("ob_real_loan_balance", { precision: 15, scale: 2 }),
    obEmergencyLoanBalance: numeric("ob_emergency_loan_balance", { precision: 15, scale: 2 }),
    obTotalLoanBalance: numeric("ob_total_loan_balance", { precision: 15, scale: 2 }),
    obElectronicsDebt: numeric("ob_electronics_debt", { precision: 15, scale: 2 }),
    obSElectronicsDebt: numeric("ob_s_electronics_debt", { precision: 15, scale: 2 }),
    obFurnitureDebt: numeric("ob_furniture_debt", { precision: 15, scale: 2 }),
    obCommodityDebt: numeric("ob_commodity_debt", { precision: 15, scale: 2 }),
    obGhlFormDebt: numeric("ob_ghl_form_debt", { precision: 15, scale: 2 }),
    obFireFundBalance: numeric("ob_fire_fund_balance", { precision: 15, scale: 2 }),
    obFuelVentureBalance: numeric("ob_fuel_venture_balance", { precision: 15, scale: 2 }),
    obLandLoanBalance: numeric("ob_land_loan_balance", { precision: 15, scale: 2 }),
    obTotalStoreDebt: numeric("ob_total_store_debt", { precision: 15, scale: 2 }),
    obUploadedAt: timestamp("ob_uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    savingsNonNeg: check("members_savings_non_neg", sql`${t.savingsBalance} >= 0`),
    providentNonNeg: check("members_provident_non_neg", sql`${t.providentBalance} >= 0`),
    christmasNonNeg: check("members_christmas_non_neg", sql`${t.christmasBalance} >= 0`),
    realLoanNonNeg: check("members_real_loan_non_neg", sql`${t.realLoanBalance} >= 0`),
    emergencyLoanNonNeg: check(
      "members_emergency_loan_non_neg",
      sql`${t.emergencyLoanBalance} >= 0`,
    ),
    totalLoanNonNeg: check("members_total_loan_non_neg", sql`${t.totalLoanBalance} >= 0`),
    electronicsDebtNonNeg: check(
      "members_electronics_debt_non_neg",
      sql`${t.electronicsDebt} >= 0`,
    ),
    sElectronicsDebtNonNeg: check(
      "members_s_electronics_debt_non_neg",
      sql`${t.sElectronicsDebt} >= 0`,
    ),
    furnitureDebtNonNeg: check(
      "members_furniture_debt_non_neg",
      sql`${t.furnitureDebt} >= 0`,
    ),
    commodityDebtNonNeg: check(
      "members_commodity_debt_non_neg",
      sql`${t.commodityDebt} >= 0`,
    ),
    ghlFormDebtNonNeg: check("members_ghl_form_debt_non_neg", sql`${t.ghlFormDebt} >= 0`),
    fireFundNonNeg: check("members_fire_fund_non_neg", sql`${t.fireFundBalance} >= 0`),
    fuelVentureNonNeg: check(
      "members_fuel_venture_non_neg",
      sql`${t.fuelVentureBalance} >= 0`,
    ),
    landLoanNonNeg: check("members_land_loan_non_neg", sql`${t.landLoanBalance} >= 0`),
    storeDebtNonNeg: check("members_store_debt_non_neg", sql`${t.totalStoreDebt} >= 0`),
    failedStepUpsNonNeg: check(
      "members_failed_step_ups_non_neg",
      sql`${t.failedStepUpAttempts} >= 0`,
    ),
  }),
);

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
