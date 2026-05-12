import { Router, type IRouter } from "express";
import { db, organizationsTable, membersTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import {
  requireAuth,
  requireClerkUser,
  requireAdmin,
  requireReverification,
  AuthRequest,
} from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import {
  CreateOrganizationBody,
  UpdateOrganizationBody,
  UpdateOrganizationParams,
  ActivateOrganizationParams,
  DeactivateOrganizationParams,
  ListOrganizationsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

// Listing active orgs is available to any signed-in Clerk user (including
// pre-members on the complete-profile page). Listing inactive orgs is admin-only
// because it surfaces deactivated employer codes that should not be shown to
// regular members during sign-up.
router.get(
  "/organizations",
  requireClerkUser,
  async (req: AuthRequest, res): Promise<void> => {
    const params = ListOrganizationsQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const includeInactive = params.data.includeInactive === true;
    if (includeInactive) {
      const adminRoles = ["admin", "financial_auditor", "treasurer", "super_admin"];
      if (!req.memberRole || !adminRoles.includes(req.memberRole)) {
        res.status(403).json({ error: "Forbidden: insufficient permissions" });
        return;
      }
      const rows = await db
        .select()
        .from(organizationsTable)
        .orderBy(organizationsTable.code);
      res.json(rows);
      return;
    }
    const rows = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.isActive, true))
      .orderBy(organizationsTable.code);
    res.json(rows);
  },
);

router.post(
  "/organizations",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = CreateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const code = normaliseCode(parsed.data.code);
    if (!/^[A-Z][A-Z0-9_]{1,15}$/.test(code)) {
      res
        .status(400)
        .json({
          error:
            "Code must be 2-16 characters: uppercase letters, digits or underscores, starting with a letter.",
        });
      return;
    }

    const [existing] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.code, code));
    if (existing) {
      res.status(409).json({ error: `An organization with code "${code}" already exists.` });
      return;
    }

    const [org] = await db
      .insert(organizationsTable)
      .values({
        code,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        isActive: true,
      })
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "CREATE_ORGANIZATION",
      entity: "organization",
      entityId: org.id,
      details: `Created organization ${org.code} (${org.name})`,
    });

    res.status(201).json(org);
  },
);

router.patch(
  "/organizations/:id",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const idParse = UpdateOrganizationParams.safeParse(req.params);
    if (!idParse.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const id = parseInt(String(idParse.data.id), 10);
    const parsed = UpdateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [current] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const update: any = {};
    if (parsed.data.name != null) update.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined)
      update.description = parsed.data.description?.trim() || null;

    if (Object.keys(update).length === 0) {
      res.json(current);
      return;
    }

    const [org] = await db
      .update(organizationsTable)
      .set(update)
      .where(eq(organizationsTable.id, id))
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "UPDATE_ORGANIZATION",
      entity: "organization",
      entityId: id,
      details: `Updated organization ${org.code}: ${Object.keys(update).join(", ")}`,
    });

    res.json(org);
  },
);

router.post(
  "/organizations/:id/deactivate",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const idParse = DeactivateOrganizationParams.safeParse(req.params);
    if (!idParse.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const id = parseInt(String(idParse.data.id), 10);

    const [current] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Refuse to deactivate the last active organization (we always need at
    // least one for new sign-ups).
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.isActive, true), ne(organizationsTable.id, id)));
    if (current.isActive && count === 0) {
      res.status(409).json({
        error:
          "You can't deactivate the only active organization. Create another one first.",
      });
      return;
    }

    const [org] = await db
      .update(organizationsTable)
      .set({ isActive: false })
      .where(eq(organizationsTable.id, id))
      .returning();

    // Count members on this org just for audit context.
    const [{ memberCount }] = await db
      .select({ memberCount: sql<number>`count(*)::int` })
      .from(membersTable)
      .where(eq(membersTable.organization, org.code));

    await logAudit({
      actorId: req.memberId,
      action: "DEACTIVATE_ORGANIZATION",
      entity: "organization",
      entityId: id,
      details: `Deactivated organization ${org.code} (${memberCount} member(s) currently assigned remain unchanged)`,
    });

    res.json(org);
  },
);

router.post(
  "/organizations/:id/activate",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const idParse = ActivateOrganizationParams.safeParse(req.params);
    if (!idParse.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const id = parseInt(String(idParse.data.id), 10);

    const [org] = await db
      .update(organizationsTable)
      .set({ isActive: true })
      .where(eq(organizationsTable.id, id))
      .returning();
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    await logAudit({
      actorId: req.memberId,
      action: "ACTIVATE_ORGANIZATION",
      entity: "organization",
      entityId: id,
      details: `Activated organization ${org.code}`,
    });

    res.json(org);
  },
);

export default router;
