import { randomInt, createHash, timingSafeEqual } from "node:crypto";
import { db, otpCodesTable, stepUpGrantsTable, membersTable } from "@workspace/db";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { sendMail } from "./mailer";

const CODE_TTL_MIN = 10;
const GRANT_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestStepUpCode(memberId: number): Promise<{ sentTo: string }> {
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

export async function verifyStepUpCode(memberId: number, code: string): Promise<boolean> {
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

  if (!latest) return false;
  if (latest.attempts >= MAX_ATTEMPTS) return false;

  const expected = Buffer.from(latest.codeHash, "hex");
  const provided = Buffer.from(hashCode(code), "hex");
  const ok = expected.length === provided.length && timingSafeEqual(expected, provided);

  await db
    .update(otpCodesTable)
    .set({ attempts: latest.attempts + 1, ...(ok ? { usedAt: now } : {}) })
    .where(eq(otpCodesTable.id, latest.id));

  if (!ok) return false;

  const grantExpiresAt = new Date(Date.now() + GRANT_TTL_MIN * 60_000);
  await db.insert(stepUpGrantsTable).values({ memberId, expiresAt: grantExpiresAt });
  return true;
}

export async function hasActiveStepUpGrant(memberId: number): Promise<boolean> {
  const now = new Date();
  const [grant] = await db
    .select({ id: stepUpGrantsTable.id })
    .from(stepUpGrantsTable)
    .where(
      and(eq(stepUpGrantsTable.memberId, memberId), gt(stepUpGrantsTable.expiresAt, now)),
    )
    .orderBy(desc(stepUpGrantsTable.createdAt))
    .limit(1);
  return !!grant;
}
