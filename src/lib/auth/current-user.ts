import { cache } from "react";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { readSessionCookie } from "./cookies";
import { validateSessionToken, type AuthenticatedUser } from "./session";

/**
 * The current user, or null.
 *
 * `cache` scopes the lookup to a single request, so a layout and three nested
 * components asking who is signed in costs one query rather than four.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return validateSessionToken(getDb(), token)?.user ?? null;
});

/**
 * Authorisation lives here rather than in middleware.
 *
 * Middleware authorises by URL pattern, so a route added without a matching
 * entry is exposed by default and nothing complains. Every page and action
 * calls this instead, which fails closed: forget it and the page has no user
 * to render, rather than quietly serving someone else's bills.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
