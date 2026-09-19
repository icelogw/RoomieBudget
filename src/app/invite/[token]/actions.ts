"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLog, invites, users } from "@/db/schema";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { newId } from "@/lib/ids";
import { hashInviteToken } from "./lookup";

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

export async function acceptInvite(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const tokenHash = hashInviteToken(parsed.data.token);
  const db = getDb();

  const invite = db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).get();
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= Date.now()) {
    return { message: "This invite link is no longer valid. Ask for a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = newId();

  // Re-read the invite inside the transaction and claim it in the same step,
  // so the same link opened twice cannot create two accounts.
  const accepted = db.transaction((tx) => {
    const current = tx.select().from(invites).where(eq(invites.tokenHash, tokenHash)).get();
    if (!current || current.acceptedAt) return false;

    const alreadyRegistered = tx.select().from(users).where(eq(users.email, current.email)).get();
    if (alreadyRegistered) return false;

    tx.insert(users)
      .values({
        id: userId,
        name: current.name,
        email: current.email,
        passwordHash,
        role: current.role,
      })
      .run();

    tx.update(invites)
      .set({ acceptedAt: new Date() })
      .where(eq(invites.id, current.id))
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: userId,
        action: "invite.accepted",
        entityType: "user",
        entityId: userId,
        detail: JSON.stringify({ inviteId: current.id }),
      })
      .run();

    return true;
  });

  if (!accepted) {
    return { message: "This invite link is no longer valid. Ask for a new one." };
  }

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const session = createSession(db, userId, userAgent);
  await setSessionCookie(session.token, session.expiresAt);

  redirect("/");
}
