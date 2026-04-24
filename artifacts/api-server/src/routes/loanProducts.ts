import { Router, type IRouter } from "express";
import { db, loanProductsTable, loansTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireReverification,
  AuthRequest,
} from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import {
  CreateLoanProductBody,
  UpdateLoanProductBody,
  ListLoanProductsQueryParams,
  UpdateLoanProductParams,
  DeleteLoanProductParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function format(p: typeof loanProductsTable.$inferSelect) {
  return {
    ...p,
    interestRate: parseFloat(p.interestRate),
  };
}

router.get("/loan-products", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = ListLoanProductsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const includeInactive = params.data.includeInactive === true;

  const adminRoles = ["admin", "financial_auditor", "treasurer", "super_admin"];
  const isAdmin = !!req.memberRole && adminRoles.includes(req.memberRole);

  const rows = await db
    .select()
    .from(loanProductsTable)
    .orderBy(asc(loanProductsTable.sortOrder), asc(loanProductsTable.id));

  const visible = includeInactive && isAdmin ? rows : rows.filter((r) => r.isActive);
  res.json(visible.map(format));
});

router.post(
  "/loan-products",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = CreateLoanProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const code = parsed.data.code.trim().toLowerCase().replace(/\s+/g, "_");

    const [existing] = await db
      .select()
      .from(loanProductsTable)
      .where(eq(loanProductsTable.code, code));
    if (existing) {
      res.status(409).json({ error: "A loan product with this code already exists" });
      return;
    }

    if (parsed.data.defaultTenureMonths > parsed.data.maxTenureMonths) {
      res.status(400).json({ error: "Default tenure cannot exceed max tenure" });
      return;
    }

    const [product] = await db
      .insert(loanProductsTable)
      .values({
        code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        interestRate: parsed.data.interestRate.toString(),
        defaultTenureMonths: parsed.data.defaultTenureMonths,
        maxTenureMonths: parsed.data.maxTenureMonths,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "CREATE_LOAN_PRODUCT",
      entity: "loan_product",
      entityId: product.id,
      details: `Created loan product ${product.name} (${product.code})`,
    });

    res.status(201).json(format(product));
  },
);

router.patch(
  "/loan-products/:id",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const params = UpdateLoanProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateLoanProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = params.data.id;

    const [existing] = await db
      .select()
      .from(loanProductsTable)
      .where(eq(loanProductsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Loan product not found" });
      return;
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
    if (parsed.data.description !== undefined) update["description"] = parsed.data.description;
    if (parsed.data.interestRate !== undefined) update["interestRate"] = parsed.data.interestRate.toString();
    if (parsed.data.defaultTenureMonths !== undefined) update["defaultTenureMonths"] = parsed.data.defaultTenureMonths;
    if (parsed.data.maxTenureMonths !== undefined) update["maxTenureMonths"] = parsed.data.maxTenureMonths;
    if (parsed.data.isActive !== undefined) update["isActive"] = parsed.data.isActive;
    if (parsed.data.sortOrder !== undefined) update["sortOrder"] = parsed.data.sortOrder;

    const nextDefault = (update["defaultTenureMonths"] as number) ?? existing.defaultTenureMonths;
    const nextMax = (update["maxTenureMonths"] as number) ?? existing.maxTenureMonths;
    if (nextDefault > nextMax) {
      res.status(400).json({ error: "Default tenure cannot exceed max tenure" });
      return;
    }

    const [updated] = await db
      .update(loanProductsTable)
      .set(update)
      .where(eq(loanProductsTable.id, id))
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "UPDATE_LOAN_PRODUCT",
      entity: "loan_product",
      entityId: id,
      details: `Updated loan product ${updated.name}`,
    });

    res.json(format(updated));
  },
);

router.delete(
  "/loan-products/:id",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const params = DeleteLoanProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const id = params.data.id;

    const [existing] = await db
      .select()
      .from(loanProductsTable)
      .where(eq(loanProductsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Loan product not found" });
      return;
    }

    const [used] = await db
      .select({ id: loansTable.id })
      .from(loansTable)
      .where(eq(loansTable.loanProductId, id))
      .limit(1);
    if (used) {
      res.status(409).json({
        error: "This product has loans referencing it. Deactivate it instead.",
      });
      return;
    }

    try {
      await db.delete(loanProductsTable).where(eq(loanProductsTable.id, id));
    } catch (err: any) {
      // Race: a loan may have been inserted referencing this product between
      // the check above and the delete. Postgres FK violation = 23503.
      if (err?.code === "23503") {
        res.status(409).json({
          error:
            "This product has loans referencing it. Deactivate it instead.",
        });
        return;
      }
      throw err;
    }
    await logAudit({
      actorId: req.memberId,
      action: "DELETE_LOAN_PRODUCT",
      entity: "loan_product",
      entityId: id,
      details: `Deleted loan product ${existing.name}`,
    });
    res.status(204).end();
  },
);

export default router;
