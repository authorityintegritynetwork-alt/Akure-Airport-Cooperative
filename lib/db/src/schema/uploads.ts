import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const uploadRecordsTable = pgTable("upload_records", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploaded_by")
    .notNull()
    .references(() => membersTable.id),
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
});

export const insertUploadRecordSchema = createInsertSchema(uploadRecordsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUploadRecord = z.infer<typeof insertUploadRecordSchema>;
export type UploadRecord = typeof uploadRecordsTable.$inferSelect;
