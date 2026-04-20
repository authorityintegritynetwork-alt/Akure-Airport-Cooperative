import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const storeItemsTable = pgTable("store_items", {
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
});

export const storePurchasesTable = pgTable("store_purchases", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => membersTable.id),
  storeItemId: integer("store_item_id")
    .notNull()
    .references(() => storeItemsTable.id),
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
});

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
