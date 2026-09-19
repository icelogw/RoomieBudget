"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth/current-user";
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
  revalidatePath("/household/settings");
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
