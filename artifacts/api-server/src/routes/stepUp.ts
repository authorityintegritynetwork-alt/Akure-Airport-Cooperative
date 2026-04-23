import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { AuthRequest, requireAuth } from "../middlewares/auth";
import { requestStepUpCode, verifyStepUpCode, hasActiveStepUpGrant } from "../lib/stepUp";

const router: IRouter = Router();

const requestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `m:${(req as AuthRequest).memberId ?? "anon"}`,
  message: { error: "Too many requests. Please wait a minute and try again." },
});

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `m:${(req as AuthRequest).memberId ?? "anon"}`,
  message: { error: "Too many attempts. Please wait a minute." },
});

router.post(
  "/auth/step-up/request",
  requireAuth,
  requestLimiter,
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.memberId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const result = await requestStepUpCode(req.memberId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to send verification code" });
    }
  },
);

router.post(
  "/auth/step-up/verify",
  requireAuth,
  verifyLimiter,
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.memberId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Invalid code format" });
      return;
    }
    const ok = await verifyStepUpCode(req.memberId, code, req.clerkSessionId);
    if (!ok) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }
    res.json({ ok: true });
  },
);

router.get(
  "/auth/step-up/status",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.memberId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const active = await hasActiveStepUpGrant(req.memberId, req.clerkSessionId);
    res.json({ active });
  },
);

export default router;
