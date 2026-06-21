import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

export const emailFailuresTable = pgTable(
  "email_failures",
  {
    id: serial("id").primaryKey(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    error: text("error").notNull(),
    attempts: integer("attempts").notNull().default(1),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unresolvedIdx: index("email_failures_unresolved_idx").on(t.resolvedAt),
    createdIdx: index("email_failures_created_idx").on(t.createdAt),
  }),
);

export type EmailFailure = typeof emailFailuresTable.$inferSelect;
