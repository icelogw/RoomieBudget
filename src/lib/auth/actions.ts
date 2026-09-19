"use server";

import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { clearSessionCookie, readSessionCookie } from "./cookies";
import { invalidateSession } from "./session";

/**
 * Signing out deletes the session row as well as the cookie. Clearing only the
 * cookie would leave a token that still works if it were ever captured.
 */
export async function signOut(): Promise<void> {
  const token = await readSessionCookie();
  if (token) invalidateSession(getDb(), token);

  await clearSessionCookie();
  redirect("/login");
}
