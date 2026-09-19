import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { invites } from "@/db/schema";

/**
 * Deliberately not a server action.
 *
 * Anything exported from a "use server" module becomes an endpoint the browser
 * can call. A token-lookup endpoint is an oracle: it would let anyone test
 * guessed invite tokens directly. This is a plain module, so it only ever runs
 * as part of rendering the page.
 */

export type InviteLookup =
  | { ok: true; name: string; email: string; role: string }
  | { ok: false; reason: "unknown" | "expired" | "used" };

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function lookupInvite(token: string): InviteLookup {
  const invite = getDb()
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, hashInviteToken(token)))
    .get();

  if (!invite) return { ok: false, reason: "unknown" };
  if (invite.acceptedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  return { ok: true, name: invite.name, email: invite.email, role: invite.role };
}
