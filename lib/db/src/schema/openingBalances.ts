import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

/**
 * Holding table for pre-existing member balances loaded once from a
 * spreadsheet, before those members have registered. Rows stay `unclaimed`
 * and continue to receive monthly deductions (by name match) until an admin
 * confirms a match to a registering member during the approval gate, at which
 * point the balance is applied to the member and the row becomes `claimed`.
 *
 * `needs_reconcile` flags a row whose name also matched an already-registered
 * member during a monthly upload — an admin must resolve the duplicate.
 */
export const openingBalancesTable = pgTable(
  "opening_balances",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    organization: text("organization"),
    status: text("status", {
      enum: ["unclaimed", "claimed", "needs_reconcile"],
    })
      .notNull()
      .default("unclaimed"),
    linkedMemberId: integer("linked_member_id").references(() => membersTable.id, {
      onDelete: "set null",
    }),
    reconcileNote: text("reconcile_note"),
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
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    statusIdx: index("opening_balances_status_idx").on(t.status),
    nameIdx: index("opening_balances_name_idx").on(t.fullName),
    linkedMemberIdx: index("opening_balances_linked_member_idx").on(t.linkedMemberId),
    savingsNonNeg: check("ob_savings_non_neg", sql`${t.savingsBalance} >= 0`),
    providentNonNeg: check("ob_provident_non_neg", sql`${t.providentBalance} >= 0`),
    christmasNonNeg: check("ob_christmas_non_neg", sql`${t.christmasBalance} >= 0`),
    realLoanNonNeg: check("ob_real_loan_non_neg", sql`${t.realLoanBalance} >= 0`),
    emergencyLoanNonNeg: check("ob_emergency_loan_non_neg", sql`${t.emergencyLoanBalance} >= 0`),
    totalLoanNonNeg: check("ob_total_loan_non_neg", sql`${t.totalLoanBalance} >= 0`),
    electronicsDebtNonNeg: check("ob_electronics_debt_non_neg", sql`${t.electronicsDebt} >= 0`),
    sElectronicsDebtNonNeg: check("ob_s_electronics_debt_non_neg", sql`${t.sElectronicsDebt} >= 0`),
    furnitureDebtNonNeg: check("ob_furniture_debt_non_neg", sql`${t.furnitureDebt} >= 0`),
    commodityDebtNonNeg: check("ob_commodity_debt_non_neg", sql`${t.commodityDebt} >= 0`),
    ghlFormDebtNonNeg: check("ob_ghl_form_debt_non_neg", sql`${t.ghlFormDebt} >= 0`),
    fireFundNonNeg: check("ob_fire_fund_non_neg", sql`${t.fireFundBalance} >= 0`),
    fuelVentureNonNeg: check("ob_fuel_venture_non_neg", sql`${t.fuelVentureBalance} >= 0`),
    landLoanNonNeg: check("ob_land_loan_non_neg", sql`${t.landLoanBalance} >= 0`),
    storeDebtNonNeg: check("ob_store_debt_non_neg", sql`${t.totalStoreDebt} >= 0`),
  }),
);

export const insertOpeningBalanceSchema = createInsertSchema(openingBalancesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOpeningBalance = z.infer<typeof insertOpeningBalanceSchema>;
export type OpeningBalance = typeof openingBalancesTable.$inferSelect;

/** A single skipped/failed row from an opening-balance import. */
export type ObImportSkippedRow = {
  row: number;
  name: string;
  reason: string;
};

/**
 * Persistent summary of each opening-balance import run, so an admin can later
 * confirm every member from the sheet was loaded (total rows vs inserted) and
 * inspect exactly which rows were skipped and why.
 */
export const openingBalanceImportsTable = pgTable(
  "opening_balance_imports",
  {
    id: serial("id").primaryKey(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    organization: text("organization"),
    sheetName: text("sheet_name").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    membersSynced: integer("members_synced").notNull().default(0),
    skippedDetails: jsonb("skipped_details")
      .$type<ObImportSkippedRow[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("opening_balance_imports_created_idx").on(t.createdAt),
    orgIdx: index("opening_balance_imports_org_idx").on(t.organization),
  }),
);

export type OpeningBalanceImport = typeof openingBalanceImportsTable.$inferSelect;
