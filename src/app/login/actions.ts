"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { setSessionCookie } from "@/lib/auth/cookies";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import { clientSource } from "@/lib/auth/client-source";
import { checkLoginAttempt, clearAttempts, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";

/**
 * A failed sign-in hands the email back so the form can keep it.
 *
 * Retyping an address to correct a password is pure friction, and it is worse
 * when the reason for the failure is that the browser autofilled the wrong
 * account: the field clearing gives no clue that is what happened.
 */
export type LoginState = FormState & { email?: string };

const schema = z.object({
  email: z.email("Enter a valid email address").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

/**
 * One message for every failure.
 *
 * "No such account" and "wrong password" would tell an outsider who lives
 * here, and a housemate which address their flatmate signed up with.
 */
const GENERIC_FAILURE = "Email or password is incorrect.";

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const submittedEmail = String(formData.get("email") ?? "");

  const parsed = schema.safeParse({
    email: submittedEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), email: submittedEmail };
  }

  const email = parsed.data.email.toLowerCase();
  const attempt = { account: email, source: await clientSource() };

  const throttle = checkLoginAttempt(attempt);
  if (!throttle.allowed) {
    return {
      message:
        `Too many attempts. Try again in ${throttle.retryAfterMinutes} ` +
        `minute${throttle.retryAfterMinutes === 1 ? "" : "s"}.`,
      email: submittedEmail,
    };
  }

  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, email)).get();

  if (!user) {
    // Burn comparable time so a missing account does not answer faster than a
    // wrong password.
    await fakeVerify();
    recordFailedAttempt(attempt);
    return { message: GENERIC_FAILURE, email: submittedEmail };
  }

  const passwordMatches = await verifyPassword(user.passwordHash, parsed.data.password);

  // A deactivated housemate is told the same thing as a wrong password: they
  // have no route back in, and the distinction would only invite argument.
  if (!passwordMatches || !user.isActive) {
    recordFailedAttempt(attempt);
    return { message: GENERIC_FAILURE, email: submittedEmail };
  }

  clearAttempts(attempt);

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const session = createSession(db, user.id, userAgent);
  await setSessionCookie(session.token, session.expiresAt);

  redirect("/");
}
