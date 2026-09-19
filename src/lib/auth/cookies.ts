import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";
import { SESSION_TTL_MS } from "./session";

export const SESSION_COOKIE = "roomiebudget_session";

/**
 * `secure` follows APP_URL rather than NODE_ENV. A production build served
 * over plain HTTP on the LAN would otherwise set a cookie the browser refuses
 * to send back, and the symptom — login silently doing nothing — gives no clue
 * why.
 *
 * Read per call rather than at module scope: module scope is evaluated during
 * the build, when APP_URL is not yet known.
 */
function secureCookies(): boolean {
  return getEnv().APP_URL.startsWith("https://");
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
