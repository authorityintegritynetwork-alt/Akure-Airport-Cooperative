import { randomInt, createHash, timingSafeEqual } from "node:crypto";
import { db, otpCodesTable, stepUpGrantsTable, membersTable } from "@workspace/db";
import { and, eq, gt, isNull, desc, sql } from "drizzle-orm";
import { sendMail } from "./mailer";

const CODE_TTL_MIN = 15;
const GRANT_TTL_MIN = 10;
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MIN = 15;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export class StepUpLockedError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      `Too many failed verification attempts. Try again in ${Math.ceil(
        retryAfterSeconds / 60,
      )} minute(s).`,
    );
    this.name = "StepUpLockedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function assertNotLockedOut(memberId: number): Promise<void> {
  const [member] = await db
    .select({ stepUpLockedUntil: membersTable.stepUpLockedUntil })
    .from(membersTable)
    .where(eq(membersTable.id, memberId))
    .limit(1);
  if (!member?.stepUpLockedUntil) return;
  const remainingMs = member.stepUpLockedUntil.getTime() - Date.now();
  if (remainingMs > 0) {
    throw new StepUpLockedError(Math.ceil(remainingMs / 1000));
  }
  // Lockout expired — clear the flag and reset counter.
  await db
    .update(membersTable)
    .set({ stepUpLockedUntil: null, failedStepUpAttempts: 0 })
    .where(eq(membersTable.id, memberId));
}

export async function requestStepUpCode(memberId: number): Promise<{ sentTo: string }> {
  await assertNotLockedOut(memberId);

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, memberId))
    .limit(1);
  if (!member) throw new Error("Member not found");
  if (!member.email) throw new Error("Member has no email on file");

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

  await db.insert(otpCodesTable).values({
    memberId,
    purpose: "step_up",
    codeHash: hashCode(code),
    expiresAt,
  });

  await sendMail({
    to: member.email,
    subject: "Your Akure Airport Co-op verification code",
    text:
      `Your verification code is: ${code}\n\n` +
      `This code expires in ${CODE_TTL_MIN} minutes. ` +
      `If you did not request it, please change your account password and contact an administrator immediately.`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;">` +
      `<h2 style="margin-bottom:8px;">Verification code</h2>` +
      `<p>Use this code to confirm a sensitive action on Akure Airport Co-op:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f5f5f5;padding:16px;text-align:center;border-radius:8px;">${code}</p>` +
      `<p style="color:#666;font-size:13px;">This code expires in ${CODE_TTL_MIN} minutes. ` +
      `If you didn't request it, please change your password and contact an administrator.</p>` +
      `</div>`,
  });

  // Mask email for response (e.g. j***@gmail.com)
  const [user, domain] = member.email.split("@");
  const masked = user.length <= 2 ? user[0] + "***" : user.slice(0, 2) + "***";
  return { sentTo: `${masked}@${domain}` };
}

export async function verifyStepUpCode(
  memberId: number,
  code: string,
  clerkSessionId?: string,
): Promise<boolean> {
  await assertNotLockedOut(memberId);

  const now = new Date();
  const [latest] = await db
    .select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.memberId, memberId),
        eq(otpCodesTable.purpose, "step_up"),
        isNull(otpCodesTable.usedAt),
        gt(otpCodesTable.expiresAt, now),
      ),
    )
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (!latest) {
    await registerFailure(memberId);
    return false;
  }
  if (latest.attempts >= MAX_OTP_ATTEMPTS) {
    await registerFailure(memberId);
    return false;
  }

  const expected = Buffer.from(latest.codeHash, "hex");
  const provided = Buffer.from(hashCode(code), "hex");
  const ok =
    expected.length === provided.length && timingSafeEqual(expected, provided);

  await db
    .update(otpCodesTable)
    .set({ attempts: latest.attempts + 1, ...(ok ? { usedAt: now } : {}) })
    .where(eq(otpCodesTable.id, latest.id));

  if (!ok) {
    await registerFailure(memberId);
    return false;
  }

  // Success — reset failure counter and any stale lockout.
  await db
    .update(membersTable)
    .set({ failedStepUpAttempts: 0, stepUpLockedUntil: null })
    .where(eq(membersTable.id, memberId));

  const grantExpiresAt = new Date(Date.now() + GRANT_TTL_MIN * 60_000);
  await db.insert(stepUpGrantsTable).values({
    memberId,
    clerkSessionId: clerkSessionId ?? null,
    expiresAt: grantExpiresAt,
  });
  return true;
}

async function registerFailure(memberId: number): Promise<void> {
  // Atomic increment-or-trip in a single statement so concurrent failed
  // verifies can't race-undercount the threshold.
  await db
    .update(membersTable)
    .set({
      failedStepUpAttempts: sql`CASE WHEN ${membersTable.failedStepUpAttempts} + 1 >= ${LOCKOUT_THRESHOLD} THEN 0 ELSE ${membersTable.failedStepUpAttempts} + 1 END`,
      stepUpLockedUntil: sql`CASE WHEN ${membersTable.failedStepUpAttempts} + 1 >= ${LOCKOUT_THRESHOLD} THEN now() + (${LOCKOUT_MIN} || ' minutes')::interval ELSE ${membersTable.stepUpLockedUntil} END`,
    })
    .where(eq(membersTable.id, memberId));
}

export async function hasActiveStepUpGrant(
  memberId: number,
  clerkSessionId?: string,
): Promise<boolean> {
  const now = new Date();
  const conds = [
    eq(stepUpGrantsTable.memberId, memberId),
    gt(stepUpGrantsTable.expiresAt, now),
  ];
  if (clerkSessionId) {
    conds.push(eq(stepUpGrantsTable.clerkSessionId, clerkSessionId));
  }
  const [grant] = await db
    .select({ id: stepUpGrantsTable.id })
    .from(stepUpGrantsTable)
    .where(and(...conds))
    .orderBy(desc(stepUpGrantsTable.createdAt))
    .limit(1);
  return !!grant;
}
