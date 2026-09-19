"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { auditLog, invites, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { invalidateAllSessionsForUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { newId } from "@/lib/ids";

/** Long enough to be unguessable, short enough to paste into a message. */
const INVITE_TTL_DAYS = 7;

export type HouseholdState = FormState & {
  /**
   * Shown once, immediately after the link is created or regenerated. The
   * database holds only the hash, so there is no way to display it again
   * later — which is the point: a leaked backup contains no usable invite.
   */
  inviteLink?: string;
  notice?: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildLink(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/invite/${token}`;
}

function expiryDate(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name").max(80, "That name is too long"),
  email: z.email("Enter a valid email address").max(200),
  role: z.enum(["admin", "member"]),
});

export async function inviteHousemate(
  _previous: HouseholdState,
  formData: FormData,
): Promise<HouseholdState> {
  const admin = await requireAdmin();

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "member",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const email = parsed.data.email.toLowerCase();
  const db = getDb();

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return { fieldErrors: { email: "Someone with that email is already in the household" } };
  }

  const token = randomBytes(32).toString("base64url");
  const inviteId = newId();

  db.transaction((tx) => {
    // Drop any outstanding invite for this address, so an older link cannot be
    // used alongside the new one. Deleted rather than marked, because a
    // superseded invite that still reads as "pending" only confuses the list.
    tx.delete(invites)
      .where(and(eq(invites.email, email), isNull(invites.acceptedAt)))
      .run();

    tx.insert(invites)
      .values({
        id: inviteId,
        email,
        name: parsed.data.name,
        role: parsed.data.role,
        tokenHash: hashToken(token),
        invitedBy: admin.id,
        expiresAt: expiryDate(),
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: admin.id,
        action: "invite.created",
        entityType: "invite",
        entityId: inviteId,
        detail: JSON.stringify({ email, role: parsed.data.role }),
      })
      .run();
  });

  revalidatePath("/household");

  return {
    inviteLink: buildLink(token),
    notice: `Invite ready for ${parsed.data.name}.`,
  };
}

export async function regenerateInvite(
  _previous: HouseholdState,
  formData: FormData,
): Promise<HouseholdState> {
  const admin = await requireAdmin();

  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return { message: "That invite no longer exists." };

  const db = getDb();
  const invite = db.select().from(invites).where(eq(invites.id, inviteId)).get();

  if (!invite || invite.acceptedAt) {
    return { message: "That invite no longer exists." };
  }

  const token = randomBytes(32).toString("base64url");

  db.update(invites)
    .set({ tokenHash: hashToken(token), expiresAt: expiryDate() })
    .where(eq(invites.id, inviteId))
    .run();

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: admin.id,
      action: "invite.regenerated",
      entityType: "invite",
      entityId: inviteId,
    })
    .run();

  revalidatePath("/household");

  return {
    inviteLink: buildLink(token),
    notice: `New link for ${invite.name}. The previous one no longer works.`,
  };
}

export async function revokeInvite(
  _previous: HouseholdState,
  formData: FormData,
): Promise<HouseholdState> {
  const admin = await requireAdmin();

  const inviteId = String(formData.get("inviteId") ?? "");
  const db = getDb();
  const invite = db.select().from(invites).where(eq(invites.id, inviteId)).get();

  if (!invite) return { message: "That invite no longer exists." };

  db.delete(invites).where(eq(invites.id, inviteId)).run();

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: admin.id,
      action: "invite.revoked",
      entityType: "invite",
      entityId: inviteId,
      detail: JSON.stringify({ email: invite.email }),
    })
    .run();

  revalidatePath("/household");
  return { notice: `Invite for ${invite.name} revoked.` };
}

export async function setMemberActive(
  _previous: HouseholdState,
  formData: FormData,
): Promise<HouseholdState> {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const makeActive = formData.get("active") === "true";

  if (userId === admin.id) {
    return { message: "You cannot deactivate your own account." };
  }

  const db = getDb();
  const member = db.select().from(users).where(eq(users.id, userId)).get();
  if (!member) return { message: "That housemate no longer exists." };

  db.update(users).set({ isActive: makeActive }).where(eq(users.id, userId)).run();

  // Deactivating must take effect now, not whenever their session lapses.
  if (!makeActive) invalidateAllSessionsForUser(db, userId);

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: admin.id,
      action: makeActive ? "member.reactivated" : "member.deactivated",
      entityType: "user",
      entityId: userId,
    })
    .run();

  revalidatePath("/household");
  return {
    notice: makeActive
      ? `${member.name} can sign in again.`
      : `${member.name} has been deactivated. Their share of past bills is unchanged.`,
  };
}
