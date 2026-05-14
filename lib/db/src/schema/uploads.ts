import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uploaderIdx: index("upload_records_uploader_idx").on(t.uploadedBy),
    periodOrgIdx: index("upload_records_period_org_idx").on(
      t.year,
      t.month,
      t.organization,
    ),
  }),
);

export const insertUploadRecordSchema = createInsertSchema(uploadRecordsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUploadRecord = z.infer<typeof insertUploadRecordSchema>;
export type UploadRecord = typeof uploadRecordsTable.$inferSelect;
