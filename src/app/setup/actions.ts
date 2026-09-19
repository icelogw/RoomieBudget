"use server";

import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { newId } from "@/lib/ids";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "That name is too long"),
    email: z.email("Enter a valid email address").max(200),
    // Length beats composition rules: a long passphrase is stronger than
    // "Pa55word!" and people will not write it on the fridge.
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

export async function createHousehold(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { name, email, password } = parsed.data;
  const db = getDb();

  // Hash before opening the transaction: argon2 is deliberately slow and
  // better-sqlite3 transactions are synchronous, so hashing inside one would
  // hold a write lock for no reason.
  const passwordHash = await hashPassword(password);
  const userId = newId();

  // Re-check the household is empty inside the transaction. Without it, two
  // people opening /setup at once could both become admin.
  const created = db.transaction((tx) => {
    const [{ value: existing }] = tx.select({ value: count() }).from(users).all();
    if (existing > 0) return false;

    tx.insert(users)
      .values({
        id: userId,
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: "admin",
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: userId,
        action: "household.created",
        entityType: "user",
        entityId: userId,
      })
      .run();

    return true;
  });

  if (!created) {
    return { message: "This household has already been set up. Sign in instead." };
  }

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const session = createSession(db, userId, userAgent);
  await setSessionCookie(session.token, session.expiresAt);

  // redirect throws by design, so it must sit outside any try/catch.
  redirect("/");
}
