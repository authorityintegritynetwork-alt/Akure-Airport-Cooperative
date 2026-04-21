import { logger } from "./logger";

const CLERK_API = "https://api.clerk.com/v1";

export async function createClerkInvitation(params: {
  emailAddress: string;
  redirectUrl?: string;
  publicMetadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — skipping member invitation email");
    return { ok: false, error: "CLERK_SECRET_KEY not configured" };
  }

  try {
    const res = await fetch(`${CLERK_API}/invitations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: params.emailAddress,
        redirect_url: params.redirectUrl,
        public_metadata: params.publicMetadata,
        notify: true,
        ignore_existing: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, email: params.emailAddress }, "Clerk invitation failed");
      return { ok: false, error: `Clerk responded ${res.status}` };
    }

    logger.info({ email: params.emailAddress }, "Clerk invitation sent");
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Failed to create Clerk invitation");
    return { ok: false, error: (err as Error).message };
  }
}
