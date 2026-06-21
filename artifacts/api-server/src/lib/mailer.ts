/**
 * Consolidated email utility.
 *
 * Behaviour:
 *  - Retries up to MAX_RETRIES times with exponential back-off.
 *  - On final failure, persists the failure to the `email_failures` table so
 *    an admin can review and resend manually.
 *  - Never throws — callers should not crash because of an email problem.
 */
import nodemailer from "nodemailer";
import { db, emailFailuresTable } from "@workspace/db";
import { logger } from "./logger";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_APP_PASSWORD must be set");
  }
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return _transporter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email with automatic retry (up to MAX_RETRIES attempts).
 * Failures after all retries are persisted to `email_failures` for admin review.
 * This function never rejects.
 */
export async function sendMail(opts: MailOptions): Promise<void> {
  const from =
    process.env.SMTP_FROM ??
    `Akure Airport Co-op <${process.env.SMTP_USER}>`;

  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
    logger.warn({ to: opts.to }, "Email not configured — skipping send");
    return;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await getTransporter().sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return; // success
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, attempt, to: opts.to, subject: opts.subject },
        `Email send failed (attempt ${attempt}/${MAX_RETRIES})`,
      );
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  // All retries exhausted — persist for admin review.
  const errMsg =
    lastError instanceof Error ? lastError.message : String(lastError);
  logger.error(
    { err: lastError, to: opts.to, subject: opts.subject },
    "Email permanently failed after retries — persisting to email_failures",
  );
  try {
    await db.insert(emailFailuresTable).values({
      to: opts.to,
      subject: opts.subject,
      bodyText: opts.text,
      error: errMsg,
      attempts: MAX_RETRIES,
    });
  } catch (dbErr) {
    logger.error({ dbErr }, "Failed to persist email failure to DB");
  }
}
