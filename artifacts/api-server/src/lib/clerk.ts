import { logger } from "./logger";

const CLERK_API = "https://api.clerk.com/v1";

export async function getClerkUser(userId: string): Promise<{
  emailAddress: string | null;
  firstName: string | null;
  lastName: string | null;
} | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — cannot fetch Clerk user");
    return null;
  }
  try {
    const res = await fetch(`${CLERK_API}/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) {
      logger.error({ status: res.status, userId }, "Clerk getUser failed");
      return null;
    }
    const data: any = await res.json();
    const primaryId = data.primary_email_address_id;
    const primary = (data.email_addresses || []).find(
      (e: any) => e.id === primaryId,
    );
    return {
      emailAddress: primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? null,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
    };
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch Clerk user");
    return null;
  }
}

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
