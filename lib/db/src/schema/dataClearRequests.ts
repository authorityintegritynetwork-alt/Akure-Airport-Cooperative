import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Tracks admin-initiated requests to wipe all balance data.
 * Only super_admins can approve or reject. The request persists until
 * explicitly actioned — there is no auto-expiry.
 */
export const dataClearRequestsTable = pgTable("data_clear_requests", {
  id: serial("id").primaryKey(),
  /** The member ID of the admin who raised this request. */
  requestedById: integer("requested_by_id").notNull(),
  /** Optional reason supplied by the requesting admin. */
  reason: text("reason"),
  /** pending | approved | rejected */
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  /** Set when a super admin approves or rejects. */
  reviewedById: integer("reviewed_by_id"),
  reviewedAt: timestamp("reviewed_at"),
  /** Stored so the email can address the requester by name / email. */
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
