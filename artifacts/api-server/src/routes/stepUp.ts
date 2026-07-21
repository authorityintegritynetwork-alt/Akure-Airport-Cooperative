import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AuthRequest, requireAuth } from "../middlewares/auth";
import {
  requestStepUpCode,
  verifyStepUpCode,
  hasActiveStepUpGrant,
  StepUpLockedError,
  StepUpNoEmailError,
} from "../lib/stepUp";

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

const verifyBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Code must be exactly 6 digits"),
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
      if (err instanceof StepUpLockedError) {
        res.setHeader("Retry-After", String(err.retryAfterSeconds));
        res.status(423).json({
          error: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        });
        return;
      }
      if (err instanceof StepUpNoEmailError) {
        res.status(422).json({ error: err.message });
        return;
      }
      req.log?.error({ err }, "step-up request failed");
      res.status(500).json({ error: "Failed to send verification code" });
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
    const parsed = verifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid code format" });
      return;
    }
    try {
      const ok = await verifyStepUpCode(
        req.memberId,
        parsed.data.code,
        req.clerkSessionId,
      );
      if (!ok) {
        res.status(400).json({ error: "Invalid or expired code" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof StepUpLockedError) {
        res.setHeader("Retry-After", String(err.retryAfterSeconds));
        res.status(423).json({
          error: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        });
        return;
      }
      req.log?.error({ err }, "step-up verify failed");
      res.status(500).json({ error: "Failed to verify code" });
    }
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
