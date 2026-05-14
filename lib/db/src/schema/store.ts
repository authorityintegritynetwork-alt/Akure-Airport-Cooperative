import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const storeItemsTable = pgTable(
  "store_items",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 15, scale: 2 }).notNull(),
    imageObjectPath: text("image_object_path"),
    quantityAvailable: integer("quantity_available").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    priceNonNeg: check("store_items_price_non_neg", sql`${t.price} >= 0`),
    qtyNonNeg: check(
      "store_items_qty_non_neg",
      sql`${t.quantityAvailable} >= 0`,
    ),
  }),
);

export const storePurchasesTable = pgTable(
  "store_purchases",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    storeItemId: integer("store_item_id")
      .notNull()
      .references(() => storeItemsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
    totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull(),
    outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 }).notNull(),
    status: text("status", { enum: ["outstanding", "partial", "settled"] })
      .notNull()
      .default("outstanding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    memberIdx: index("store_purchases_member_idx").on(t.memberId),
    itemIdx: index("store_purchases_item_idx").on(t.storeItemId),
    statusIdx: index("store_purchases_status_idx").on(t.status),
    quantityPositive: check(
      "store_purchases_quantity_positive",
      sql`${t.quantity} > 0`,
    ),
    unitPriceNonNeg: check(
      "store_purchases_unit_price_non_neg",
      sql`${t.unitPrice} >= 0`,
    ),
    totalPriceNonNeg: check(
      "store_purchases_total_price_non_neg",
      sql`${t.totalPrice} >= 0`,
    ),
    outstandingNonNeg: check(
      "store_purchases_outstanding_non_neg",
      sql`${t.outstandingBalance} >= 0`,
    ),
  }),
);

export const insertStoreItemSchema = createInsertSchema(storeItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertStorePurchaseSchema = createInsertSchema(storePurchasesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStoreItem = z.infer<typeof insertStoreItemSchema>;
export type StoreItem = typeof storeItemsTable.$inferSelect;
export type InsertStorePurchase = z.infer<typeof insertStorePurchaseSchema>;
export type StorePurchase = typeof storePurchasesTable.$inferSelect;
