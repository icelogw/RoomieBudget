import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { sessions, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  SESSION_TTL_MS,
  createSession,
  deleteExpiredSessions,
  generateSessionToken,
  invalidateAllSessionsForUser,
  invalidateSession,
  safeEquals,
  tokenToId,
  validateSessionToken,
} from "./session";

let db: Db;
let userId: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  userId = newId();
  db.insert(users)
    .values({ id: userId, email: "alice@example.com", name: "Alice", passwordHash: "x" })
    .run();
});

describe("tokens", () => {
  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 500 }, generateSessionToken));
    expect(seen.size).toBe(500);
  });

  it("stores only the hash, never the token itself", () => {
    const { token } = createSession(db, userId);
    const [row] = db.select().from(sessions).all();

    expect(row.id).not.toBe(token);
    expect(row.id).toBe(tokenToId(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("validateSessionToken", () => {
  it("resolves a fresh token to its user", () => {
    const { token } = createSession(db, userId);
    expect(validateSessionToken(db, token)?.user.email).toBe("alice@example.com");
  });

  it("rejects a token that was never issued", () => {
    expect(validateSessionToken(db, generateSessionToken())).toBeNull();
  });

  it("rejects an expired session and clears the row", () => {
    const { token } = createSession(db, userId);
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, tokenToId(token)))
      .run();

    expect(validateSessionToken(db, token)).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("locks out a deactivated housemate immediately", () => {
    const { token } = createSession(db, userId);
    db.update(users).set({ isActive: false }).where(eq(users.id, userId)).run();

    expect(validateSessionToken(db, token)).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("never extends the expiry, however much the session is used", () => {
    /**
     * A session lasts a fixed thirty days from signing in. Extending it in the
     * database alone would be theatre: nothing can rewrite the cookie during a
     * server render, so the browser drops it on the original date and the
     * longer row is never consulted again.
     */
    const { token } = createSession(db, userId);
    const issued = db.select().from(sessions).all()[0].expiresAt.getTime();

    for (let i = 0; i < 5; i++) validateSessionToken(db, token);

    expect(db.select().from(sessions).all()[0].expiresAt.getTime()).toBe(issued);
  });

  it("does not revive a session that is nearly spent", () => {
    const { token } = createSession(db, userId);
    const nearlyExpired = new Date(Date.now() + SESSION_TTL_MS / 4);
    db.update(sessions)
      .set({ expiresAt: nearlyExpired })
      .where(eq(sessions.id, tokenToId(token)))
      .run();

    validateSessionToken(db, token);

    expect(db.select().from(sessions).all()[0].expiresAt.getTime()).toBe(
      nearlyExpired.getTime(),
    );
  });
});

describe("invalidation", () => {
  it("logs out one device", () => {
    const a = createSession(db, userId);
    const b = createSession(db, userId);

    invalidateSession(db, a.token);

    expect(validateSessionToken(db, a.token)).toBeNull();
    expect(validateSessionToken(db, b.token)).not.toBeNull();
  });

  it("logs out every device, for a password change", () => {
    const a = createSession(db, userId);
    const b = createSession(db, userId);

    invalidateAllSessionsForUser(db, userId);

    expect(validateSessionToken(db, a.token)).toBeNull();
    expect(validateSessionToken(db, b.token)).toBeNull();
  });

  it("sweeps expired rows without touching live ones", () => {
    const live = createSession(db, userId);
    const dead = createSession(db, userId);
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(sessions.id, tokenToId(dead.token)))
      .run();

    expect(deleteExpiredSessions(db)).toBe(1);
    expect(validateSessionToken(db, live.token)).not.toBeNull();
  });

  it("removes sessions when the user row goes", () => {
    createSession(db, userId);
    db.delete(users).where(eq(users.id, userId)).run();

    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});

describe("safeEquals", () => {
  it("matches identical strings and rejects everything else", () => {
    expect(safeEquals("abc123", "abc123")).toBe(true);
    expect(safeEquals("abc123", "abc124")).toBe(false);
    expect(safeEquals("abc", "abcdef")).toBe(false);
    expect(safeEquals("", "")).toBe(true);
  });
});
