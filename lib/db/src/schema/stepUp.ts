import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const otpCodesTable = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull().default("step_up"),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("otp_codes_member_idx").on(t.memberId),
  }),
);

export type OtpCode = typeof otpCodesTable.$inferSelect;

export const stepUpGrantsTable = pgTable(
  "step_up_grants",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    clerkSessionId: text("clerk_session_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("step_up_grants_member_idx").on(t.memberId),
  }),
);

export type StepUpGrant = typeof stepUpGrantsTable.$inferSelect;
