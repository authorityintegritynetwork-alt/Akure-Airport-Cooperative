import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

/** Member entry stored in roster_data for a payroll_summary upload. */
export interface RosterMember {
  memberId: number;
  employeeNo: string | null;
  amount: number;
}

export const uploadRecordsTable = pgTable(
  "upload_records",
  {
    id: serial("id").primaryKey(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    month: text("month").notNull(),
    year: integer("year").notNull(),
    organization: text("organization").notNull(),
    fileObjectPath: text("file_object_path").notNull(),
    rowsProcessed: integer("rows_processed").notNull().default(0),
    rowsSkipped: integer("rows_skipped").notNull().default(0),
    status: text("status", { enum: ["pending", "processed", "failed"] })
      .notNull()
      .default("pending"),
    /**
     * Upload mode:
     *   standalone         – legacy single-upload path (default); creates
     *                        transactions immediately from whatever format is
     *                        detected (multi-column or payroll).
     *   payroll_summary    – head-office payroll doc (Emp No | Name | Total).
     *                        Establishes the active-member roster for the
     *                        month; NO transactions are created. Breakdown
     *                        upload must follow.
     *   category_breakdown – cooperative archive (per-category columns).
     *                        Linked to a payroll_summary via linkedUploadId;
     *                        only roster members are processed.
     */
    uploadType: text("upload_type", {
      enum: ["standalone", "payroll_summary", "category_breakdown", "balance_snapshot"],
    })
      .notNull()
      .default("standalone"),
    /**
     * For category_breakdown uploads: the id of the payroll_summary upload
     * that provides the active-member roster gate.
     */
    linkedUploadId: integer("linked_upload_id").references(
      (): AnyPgColumn => uploadRecordsTable.id,
      { onDelete: "set null" },
    ),
    /**
     * Populated for payroll_summary uploads. Stores the active roster so
     * a subsequent category_breakdown upload can gate on it without re-
     * parsing the original file.
     * Shape: { members: RosterMember[] }
     */
    rosterData: jsonb("roster_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uploaderIdx: index("upload_records_uploader_idx").on(t.uploadedBy),
    periodOrgIdx: index("upload_records_period_org_idx").on(
      t.year,
      t.month,
      t.organization,
    ),
    linkedIdx: index("upload_records_linked_idx").on(t.linkedUploadId),
  }),
);

export const insertUploadRecordSchema = createInsertSchema(uploadRecordsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUploadRecord = z.infer<typeof insertUploadRecordSchema>;
export type UploadRecord = typeof uploadRecordsTable.$inferSelect;
