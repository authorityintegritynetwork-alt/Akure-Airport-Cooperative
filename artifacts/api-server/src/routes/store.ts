import { Router, type IRouter } from "express";
import { db, storeItemsTable, storePurchasesTable, membersTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireMember, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import {
  CreateStoreItemBody,
  GetStoreItemParams,
  UpdateStoreItemParams,
  UpdateStoreItemBody,
  DeleteStoreItemParams,
  ListStoreItemsQueryParams,
  ListStorePurchasesQueryParams,
  CreateStorePurchaseBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatItem(item: any) {
  return {
    ...item,
    price: parseFloat(item.price),
  };
}

function formatPurchase(p: any, memberName: string, itemName: string) {
  return {
    ...p,
    memberName,
    itemName,
    unitPrice: parseFloat(p.unitPrice),
    totalPrice: parseFloat(p.totalPrice),
    outstandingBalance: parseFloat(p.outstandingBalance),
  };
}

router.get("/store/items", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = ListStoreItemsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.available != null) conditions.push(eq(storeItemsTable.isAvailable, params.data.available));
  if (params.data.search) conditions.push(ilike(storeItemsTable.name, `%${params.data.search}%`));

  const items = conditions.length
    ? await db.select().from(storeItemsTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await db.select().from(storeItemsTable);

  res.json(items.map(formatItem));
});

router.post("/store/items", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateStoreItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(storeItemsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      price: parsed.data.price.toString(),
      imageObjectPath: parsed.data.imageObjectPath ?? undefined,
      quantityAvailable: parsed.data.quantityAvailable ?? 0,
    })
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "CREATE_STORE_ITEM",
    entity: "store_item",
    entityId: item.id,
    details: `Created store item: ${item.name}`,
  });

  res.status(201).json(formatItem(item));
});

router.get("/store/items/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [item] = await db.select().from(storeItemsTable).where(eq(storeItemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(formatItem(item));
});

router.patch("/store/items/:id", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const parsed = UpdateStoreItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  if (parsed.data.price != null) updateData.price = parsed.data.price.toString();
  if (parsed.data.imageObjectPath != null) updateData.imageObjectPath = parsed.data.imageObjectPath;
  if (parsed.data.quantityAvailable != null) updateData.quantityAvailable = parsed.data.quantityAvailable;
  if (parsed.data.isAvailable != null) updateData.isAvailable = parsed.data.isAvailable;

  const [item] = await db.update(storeItemsTable).set(updateData).where(eq(storeItemsTable.id, id)).returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(formatItem(item));
});

router.delete("/store/items/:id", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(storeItemsTable).where(eq(storeItemsTable.id, id));
  res.sendStatus(204);
});

router.get("/store/purchases", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const params = ListStorePurchasesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const purchases = params.data.memberId
    ? await db.select().from(storePurchasesTable).where(eq(storePurchasesTable.memberId, params.data.memberId))
    : await db.select().from(storePurchasesTable);

  const members = await db.select({ id: membersTable.id, fullName: membersTable.fullName }).from(membersTable);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));
  const items = await db.select({ id: storeItemsTable.id, name: storeItemsTable.name }).from(storeItemsTable);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i.name]));

  res.json(purchases.map((p) => formatPurchase(p, memberMap[p.memberId] || "Unknown", itemMap[p.storeItemId] || "Unknown")));
});

router.post("/store/purchases", requireAuth, requireMember, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateStorePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  type Result =
    | { ok: true; purchase: any; itemName: string; memberName: string; totalPrice: number }
    | { ok: false; status: number; error: string };

  const result: Result = await db.transaction(async (tx) => {
    // Lock the item row to prevent oversells under concurrent purchases.
    const [item] = await tx
      .select()
      .from(storeItemsTable)
      .where(eq(storeItemsTable.id, parsed.data.storeItemId))
      .for("update");
    if (!item) return { ok: false, status: 404, error: "Store item not found" } as const;
    if (!item.isAvailable)
      return { ok: false, status: 400, error: "Item is not available" } as const;
    if (item.quantityAvailable < parsed.data.quantity)
      return {
        ok: false,
        status: 400,
        error: "Insufficient quantity available",
      } as const;

    const totalPrice = parseFloat(item.price) * parsed.data.quantity;

    // Lock the member row too — we read+write balances on it.
    const [member] = await tx
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, req.memberId!))
      .for("update");
    if (!member)
      return { ok: false, status: 404, error: "Member not found" } as const;

    let outstandingBalance = totalPrice;
    if (
      parsed.data.payFromSavings &&
      parseFloat(member.savingsBalance) >= totalPrice
    ) {
      outstandingBalance = 0;
      await tx
        .update(membersTable)
        .set({
          savingsBalance: (
            parseFloat(member.savingsBalance) - totalPrice
          ).toString(),
        })
        .where(eq(membersTable.id, req.memberId!));
    } else {
      await tx
        .update(membersTable)
        .set({
          totalStoreDebt: (
            parseFloat(member.totalStoreDebt) + totalPrice
          ).toString(),
        })
        .where(eq(membersTable.id, req.memberId!));
    }

    await tx
      .update(storeItemsTable)
      .set({ quantityAvailable: item.quantityAvailable - parsed.data.quantity })
      .where(eq(storeItemsTable.id, item.id));

    const [purchase] = await tx
      .insert(storePurchasesTable)
      .values({
        memberId: req.memberId!,
        storeItemId: item.id,
        quantity: parsed.data.quantity,
        unitPrice: item.price,
        totalPrice: totalPrice.toString(),
        outstandingBalance: outstandingBalance.toString(),
        status: outstandingBalance === 0 ? "settled" : "outstanding",
      })
      .returning();

    return {
      ok: true,
      purchase,
      itemName: item.name,
      memberName: member.fullName,
      totalPrice,
    } as const;
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await logAudit({
    actorId: req.memberId,
    action: "STORE_PURCHASE",
    entity: "store_purchase",
    entityId: result.purchase.id,
    details: `Purchased ${parsed.data.quantity}x ${result.itemName} for ₦${result.totalPrice.toLocaleString()}`,
  });

  await sendNotification({
    memberId: req.memberId!,
    type: "store_purchase",
    title: "Store Purchase Confirmed",
    message: `Your purchase of ${parsed.data.quantity}x ${result.itemName} (₦${result.totalPrice.toLocaleString()}) has been recorded.`,
  });

  res
    .status(201)
    .json(formatPurchase(result.purchase, result.memberName, result.itemName));
});

router.get("/store/purchases/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const purchases = await db.select().from(storePurchasesTable).where(eq(storePurchasesTable.memberId, req.memberId!));
  const items = await db.select({ id: storeItemsTable.id, name: storeItemsTable.name }).from(storeItemsTable);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i.name]));
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));

  res.json(purchases.map((p) => formatPurchase(p, member?.fullName || "Unknown", itemMap[p.storeItemId] || "Unknown")));
});

router.get("/store/debt/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const purchases = await db
    .select()
    .from(storePurchasesTable)
    .where(and(eq(storePurchasesTable.memberId, req.memberId!), eq(storePurchasesTable.status, "outstanding")));

  const items = await db.select({ id: storeItemsTable.id, name: storeItemsTable.name }).from(storeItemsTable);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i.name]));
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId!));

  const totalDebt = purchases.reduce((sum, p) => sum + parseFloat(p.outstandingBalance), 0);

  res.json({
    memberId: req.memberId!,
    totalDebt,
    purchases: purchases.map((p) => formatPurchase(p, member?.fullName || "Unknown", itemMap[p.storeItemId] || "Unknown")),
  });
});

export default router;
