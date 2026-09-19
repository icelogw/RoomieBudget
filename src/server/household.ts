import { asc, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { auditLog, categories, settings } from "@/db/schema";
import { APP_NAME } from "@/lib/app";
import { newId } from "@/lib/ids";

/**
 * Household-level configuration: the category list behind the dropdowns, and
 * the household's own name.
 *
 * Categories are reference data, not a foreign key. A bill stores the text it
 * was given, so renaming "Power" to "Electricity" leaves past bills reading
 * "Power" — which is what actually happened, and what a ledger should say.
 */

export const HOUSEHOLD_NAME_KEY = "household.name";

export type CategorySummary = { id: string; name: string; sortOrder: number };

export function listCategories(db: Db): CategorySummary[] {
  return db
    .select({ id: categories.id, name: categories.name, sortOrder: categories.sortOrder })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
}

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function householdName(db: Db): string {
  return getSetting(db, HOUSEHOLD_NAME_KEY) || APP_NAME;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run();
}

export type CategoryResult = { ok: true } | { ok: false; reason: string };

export function addCategory(
  db: Db,
  input: { name: string; actorId: string },
): CategoryResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "Give the category a name." };
  if (name.length > 40) return { ok: false, reason: "Keep it under 40 characters." };

  // Sit new categories at the end rather than the top, so adding one does not
  // rearrange a list somebody has already put in order.
  const highest = db
    .select({ value: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
    .from(categories)
    .get();

  try {
    db.insert(categories)
      .values({ id: newId(), name, sortOrder: (highest?.value ?? 0) + 10 })
      .run();
  } catch (error) {
    if (/UNIQUE/i.test(error instanceof Error ? error.message : "")) {
      return { ok: false, reason: `"${name}" is already on the list.` };
    }
    throw error;
  }

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: "category.added",
      entityType: "category",
      detail: JSON.stringify({ name }),
    })
    .run();

  return { ok: true };
}

export function renameCategory(
  db: Db,
  input: { categoryId: string; name: string; actorId: string },
): CategoryResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "Give the category a name." };
  if (name.length > 40) return { ok: false, reason: "Keep it under 40 characters." };

  const existing = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
  if (!existing) return { ok: false, reason: "That category no longer exists." };

  try {
    db.update(categories).set({ name }).where(eq(categories.id, input.categoryId)).run();
  } catch (error) {
    if (/UNIQUE/i.test(error instanceof Error ? error.message : "")) {
      return { ok: false, reason: `"${name}" is already on the list.` };
    }
    throw error;
  }

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: "category.renamed",
      entityType: "category",
      entityId: input.categoryId,
      detail: JSON.stringify({ from: existing.name, to: name }),
    })
    .run();

  return { ok: true };
}

export function removeCategory(
  db: Db,
  input: { categoryId: string; actorId: string },
): CategoryResult {
  const existing = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
  if (!existing) return { ok: false, reason: "That category no longer exists." };

  // Bills keep the text they were given, so removing a category only takes it
  // out of the dropdown. Nothing in the history changes.
  db.delete(categories).where(eq(categories.id, input.categoryId)).run();

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: "category.removed",
      entityType: "category",
      entityId: input.categoryId,
      detail: JSON.stringify({ name: existing.name }),
    })
    .run();

  return { ok: true };
}

/** Swap a category with its neighbour, to nudge it up or down the list. */
export function moveCategory(
  db: Db,
  input: { categoryId: string; direction: "up" | "down" },
): CategoryResult {
  const ordered = listCategories(db);
  const index = ordered.findIndex((c) => c.id === input.categoryId);

  if (index === -1) return { ok: false, reason: "That category no longer exists." };

  const target = index + (input.direction === "up" ? -1 : 1);
  if (target < 0 || target >= ordered.length) return { ok: true };

  // Rewrite the whole list rather than swapping two values: seeded rows can
  // share a sort order, and swapping equal numbers would do nothing.
  const reordered = [...ordered];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  db.transaction((tx) => {
    reordered.forEach((category, position) => {
      tx.update(categories)
        .set({ sortOrder: position * 10 })
        .where(eq(categories.id, category.id))
        .run();
    });
  });

  return { ok: true };
}
