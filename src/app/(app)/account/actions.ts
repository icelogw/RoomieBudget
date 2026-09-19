"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { setSessionCookie } from "@/lib/auth/cookies";
import { requireUser } from "@/lib/auth/current-user";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, invalidateAllSessionsForUser } from "@/lib/auth/session";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { newId } from "@/lib/ids";
import { validatePayId, type PayIdType } from "@/lib/payid";

export type AccountState = FormState & { notice?: string };

const paymentSchema = z.object({
  payIdType: z.enum(["email", "mobile"]),
  payId: z.string().max(200),
  paymentNote: z.string().trim().max(280, "Keep the note under 280 characters"),
});

export async function savePaymentDetails(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = paymentSchema.safeParse({
    payIdType: formData.get("payIdType") ?? "email",
    payId: formData.get("payId") ?? "",
    paymentNote: formData.get("paymentNote") ?? "",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const raw = parsed.data.payId.trim();

  // Clearing the PayID is a legitimate choice, not an error.
  if (!raw) {
    getDb()
      .update(users)
      .set({
        payId: null,
        payIdType: null,
        paymentNote: parsed.data.paymentNote || null,
      })
      .where(eq(users.id, user.id))
      .run();

    revalidatePath("/account");
    return { notice: "Payment details cleared." };
  }

  const validated = validatePayId(parsed.data.payIdType as PayIdType, raw);
  if (!validated.ok) return { fieldErrors: { payId: validated.error } };

  getDb()
    .update(users)
    .set({
      payId: validated.value,
      payIdType: parsed.data.payIdType,
      paymentNote: parsed.data.paymentNote || null,
    })
    .where(eq(users.id, user.id))
    .run();

  revalidatePath("/account");
  return { notice: "Payment details saved." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

export async function changePassword(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const correct = await verifyPassword(user.passwordHash, parsed.data.current);
  if (!correct) return { fieldErrors: { current: "That is not your current password" } };

  const db = getDb();
  const passwordHash = await hashPassword(parsed.data.next);

  db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();

  // Every existing session dies, including this one — a password change should
  // remove access from any device that already had it.
  invalidateAllSessionsForUser(db, user.id);

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: user.id,
      action: "password.changed",
      entityType: "user",
      entityId: user.id,
    })
    .run();

  // Then sign this device back in, so changing a password is not the same as
  // logging yourself out.
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const session = createSession(db, user.id, userAgent);
  await setSessionCookie(session.token, session.expiresAt);

  revalidatePath("/account");
  return { notice: "Password changed. Any other device has been signed out." };
}
