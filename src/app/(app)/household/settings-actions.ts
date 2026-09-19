"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { APP_NAME } from "@/lib/app";
import { requireAdmin } from "@/lib/auth/current-user";
import { formatTimestamp } from "@/lib/dates";
import { getEnv, isMailEnabled } from "@/lib/env";
import { layout, plain } from "@/server/mail-templates";
import { sendMail } from "@/server/mail";
import type { FormState } from "@/lib/forms";
import {
  HOUSEHOLD_NAME_KEY,
  addCategory,
  moveCategory,
  removeCategory,
  renameCategory,
  setSetting,
} from "@/server/household";

export type SettingsState = FormState & { notice?: string };

/** Settings change what everyone sees, so they are an admin's to change. */
function refresh() {
  revalidatePath("/household");
  // The dropdown on the bill form comes from this list.
  revalidatePath("/bills/new");
}

export async function createCategory(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const result = addCategory(getDb(), {
    name: String(formData.get("name") ?? ""),
    actorId: admin.id,
  });

  if (!result.ok) return { fieldErrors: { name: result.reason } };

  refresh();
  return { notice: "Category added." };
}

export async function editCategory(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const result = renameCategory(getDb(), {
    categoryId: String(formData.get("categoryId") ?? ""),
    name: String(formData.get("name") ?? ""),
    actorId: admin.id,
  });

  if (!result.ok) return { message: result.reason };

  refresh();
  return { notice: "Renamed. Bills already filed under the old name keep it." };
}

export async function deleteCategory(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const result = removeCategory(getDb(), {
    categoryId: String(formData.get("categoryId") ?? ""),
    actorId: admin.id,
  });

  if (!result.ok) return { message: result.reason };

  refresh();
  return { notice: "Removed from the dropdown. Past bills are unchanged." };
}

export async function reorderCategory(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const direction = formData.get("direction") === "up" ? "up" : "down";
  const result = moveCategory(getDb(), {
    categoryId: String(formData.get("categoryId") ?? ""),
    direction,
  });

  if (!result.ok) return { message: result.reason };

  refresh();
  return {};
}

export async function renameHousehold(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const name = String(formData.get("householdName") ?? "").trim();
  if (!name) return { fieldErrors: { householdName: "Give the household a name" } };
  if (name.length > 60) return { fieldErrors: { householdName: "Keep it under 60 characters" } };

  setSetting(getDb(), HOUSEHOLD_NAME_KEY, name);

  revalidatePath("/", "layout");
  return { notice: "Household name saved." };
}

/**
 * Send a test message to whoever clicked the button.
 *
 * Self-hosted mail configuration is guesswork until something actually goes
 * out, and a relay that silently drops mail looks identical to one that works.
 * This reports the relay's own error rather than a generic failure, because
 * "authentication failed" and "connection refused" need different fixes.
 */
export async function sendTestEmail(
  _previous: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  if (!isMailEnabled()) {
    return {
      message: "No SMTP server is configured, so nothing can be sent. Set SMTP_HOST.",
    };
  }

  const db = getDb();
  const sentAt = formatTimestamp(new Date());

  const content = {
    heading: "Email is working",
    intro:
      `This is a test from ${APP_NAME}, sent at ${sentAt}. If you are reading it, ` +
      "bill notifications and reminders will reach you here too.",
    rows: [
      { label: "Sent to", value: admin.email },
      { label: "From", value: getEnv().MAIL_FROM },
      { label: "Relay", value: `${getEnv().SMTP_HOST}:${getEnv().SMTP_PORT}` },
    ],
    footnote: "Nothing else was sent to anyone.",
  };

  // A fresh key every time, so the test can be repeated while fixing settings.
  const dedupeKey = `test:${admin.id}:${Date.now()}`;

  const result = await sendMail(db, {
    kind: "bill_created",
    to: admin.email,
    subject: `${APP_NAME}: test email`,
    html: layout(content),
    text: plain(content),
    dedupeKey,
  });

  if (result === "sent") {
    return { notice: `Sent to ${admin.email}. Check that it arrives.` };
  }

  if (result === "failed") {
    // The send recorded why it failed; surfacing that beats a generic message.
    const logged = db.select().from(emailLog).where(eq(emailLog.dedupeKey, dedupeKey)).get();
    return {
      message: `The mail server rejected it: ${logged?.error ?? "no reason given"}`,
    };
  }

  return { message: "Nothing was sent." };
}
