import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { sessions, users } from "@/db/schema";

/**
 * Thirty days from signing in, and it does not move.
 *
 * Sliding it would mean writing a new cookie, and the only place that reads a
 * session is a server component, which cannot set one during render. A
 * database-side extension on its own achieves nothing: the browser would still
 * drop the cookie on the original date and the longer row would never be
 * consulted again.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Avoid a database write on every single page view. */
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000;

/**
 * The cookie holds a random token. The database holds only its SHA-256.
 *
 * That asymmetry is the point: a leaked database backup contains no value that
 * can be replayed as a login. SHA-256 is the right hash here rather than
 * argon2 — the token already has 256 bits of entropy, so there is nothing to
 * brute force and no reason to pay a slow hash on every request.
 */
function tokenToId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createSession(db: Db, userId: string, userAgent?: string) {
  const token = generateSessionToken();
  const now = new Date();

  db.insert(sessions)
    .values({
      id: tokenToId(token),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastSeenAt: now,
      userAgent: userAgent?.slice(0, 512) ?? null,
    })
    .run();

  return { token, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

export type AuthenticatedUser = typeof users.$inferSelect;

/**
 * Resolve a cookie token to the user it belongs to, or null.
 *
 * Expired sessions are deleted on sight rather than merely rejected, so the
 * table does not grow forever on a long-running install. The expiry itself is
 * never extended; see SESSION_TTL_MS.
 */
export function validateSessionToken(
  db: Db,
  token: string,
): { user: AuthenticatedUser; sessionId: string } | null {
  const sessionId = tokenToId(token);

  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;

  const now = Date.now();

  if (row.session.expiresAt.getTime() <= now) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  // A deactivated housemate keeps their history but loses access immediately,
  // without waiting for their session to lapse.
  if (!row.user.isActive) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  const staleSince = now - row.session.lastSeenAt.getTime();

  if (staleSince > LAST_SEEN_THROTTLE_MS) {
    db.update(sessions)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  return { user: row.user, sessionId };
}

export function invalidateSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.id, tokenToId(token))).run();
}

/** Used when a password changes: every other device is logged out. */
export function invalidateAllSessionsForUser(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function deleteExpiredSessions(db: Db): number {
  const result = db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  return result.changes;
}

/**
 * Constant-time comparison for short secrets such as invite tokens, where the
 * value being compared is low enough entropy that response timing could
 * otherwise leak a prefix.
 */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export { tokenToId, SESSION_TTL_MS };
