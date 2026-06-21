import { pgTable, text, serial, timestamp, numeric, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemSettingsTable = pgTable(
  "system_settings",
  {
    id: serial("id").primaryKey(),
    loanInterestRate: numeric("loan_interest_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("10"),
    maxLoanAmount: numeric("max_loan_amount", { precision: 15, scale: 2 }),
    maxLoanTenureMonths: integer("max_loan_tenure_months").notNull().default(24),
    cooperativeName: text("cooperative_name")
      .notNull()
      .default("Akure Airport Staff Cooperative Multipurpose Society"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    singletonRow: check("system_settings_singleton", sql`${t.id} = 1`),
  }),
);

export const insertSystemSettingsSchema = createInsertSchema(systemSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettingsTable.$inferSelect;
