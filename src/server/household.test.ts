import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { listBills } from "./bills";
import { createBill } from "./bills";
import {
  HOUSEHOLD_NAME_KEY,
  addCategory,
  getSetting,
  householdName,
  listCategories,
  moveCategory,
  removeCategory,
  renameCategory,
  setSetting,
} from "./household";

let db: Db;
let alice: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  alice = newId();
  db.insert(users)
    .values({ id: alice, email: "a@example.com", name: "Alice", passwordHash: "x", role: "admin" })
    .run();
});

function names() {
  return listCategories(db).map((c) => c.name);
}

describe("seeded list", () => {
  it("ships a usable set so the dropdown is not empty on day one", () => {
    expect(names()).toContain("Rent");
    expect(names()).toContain("Utilities");
    expect(names().length).toBeGreaterThanOrEqual(5);
  });

  it("keeps them in the order they were seeded", () => {
    expect(names()[0]).toBe("Rent");
  });
});

describe("addCategory", () => {
  it("adds to the end rather than disturbing the order", () => {
    addCategory(db, { name: "Firewood", actorId: alice });
    expect(names().at(-1)).toBe("Firewood");
  });

  it("trims surrounding whitespace", () => {
    addCategory(db, { name: "  Pet food  ", actorId: alice });
    expect(names()).toContain("Pet food");
  });

  it("refuses a duplicate, naming it", () => {
    const result = addCategory(db, { name: "Rent", actorId: alice });
    expect(result).toEqual({ ok: false, reason: '"Rent" is already on the list.' });
  });

  it("refuses an empty name", () => {
    expect(addCategory(db, { name: "   ", actorId: alice }).ok).toBe(false);
  });

  it("refuses an absurdly long name", () => {
    expect(addCategory(db, { name: "x".repeat(41), actorId: alice }).ok).toBe(false);
  });
});

describe("renameCategory", () => {
  it("renames in place", () => {
    const [first] = listCategories(db);
    expect(renameCategory(db, { categoryId: first.id, name: "Board", actorId: alice }).ok).toBe(
      true,
    );
    expect(names()).toContain("Board");
    expect(names()).not.toContain("Rent");
  });

  it("refuses to collide with another category", () => {
    const [first] = listCategories(db);
    const result = renameCategory(db, {
      categoryId: first.id,
      name: "Utilities",
      actorId: alice,
    });
    expect(result.ok).toBe(false);
  });

  it("leaves the category on past bills alone", () => {
    createBill(db, {
      createdBy: alice,
      paidBy: alice,
      description: "Power",
      category: "Utilities",
      totalCents: 5000,
      issuedOn: "2026-09-19",
      split: { mode: "single", userId: alice },
    });

    const utilities = listCategories(db).find((c) => c.name === "Utilities")!;
    renameCategory(db, { categoryId: utilities.id, name: "Electricity", actorId: alice });

    // The bill records what was chosen at the time. Renaming a category must
    // not rewrite history.
    expect(listBills(db)[0].category).toBe("Utilities");
  });
});

describe("removeCategory", () => {
  it("takes it out of the list", () => {
    const [first] = listCategories(db);
    expect(removeCategory(db, { categoryId: first.id, actorId: alice }).ok).toBe(true);
    expect(names()).not.toContain("Rent");
  });

  it("leaves bills that used it untouched", () => {
    createBill(db, {
      createdBy: alice,
      paidBy: alice,
      description: "Power",
      category: "Utilities",
      totalCents: 5000,
      issuedOn: "2026-09-19",
      split: { mode: "single", userId: alice },
    });

    const utilities = listCategories(db).find((c) => c.name === "Utilities")!;
    removeCategory(db, { categoryId: utilities.id, actorId: alice });

    expect(listBills(db)[0].category).toBe("Utilities");
  });

  it("reports a category that has already gone", () => {
    expect(removeCategory(db, { categoryId: "nope", actorId: alice }).ok).toBe(false);
  });
});

describe("moveCategory", () => {
  it("moves one up", () => {
    const before = names();
    const second = listCategories(db)[1];

    moveCategory(db, { categoryId: second.id, direction: "up" });

    expect(names()[0]).toBe(before[1]);
    expect(names()[1]).toBe(before[0]);
  });

  it("moves one down", () => {
    const before = names();
    const first = listCategories(db)[0];

    moveCategory(db, { categoryId: first.id, direction: "down" });

    expect(names()[0]).toBe(before[1]);
    expect(names()[1]).toBe(before[0]);
  });

  it("does nothing at the ends of the list", () => {
    const before = names();
    const first = listCategories(db)[0];
    const last = listCategories(db).at(-1)!;

    moveCategory(db, { categoryId: first.id, direction: "up" });
    moveCategory(db, { categoryId: last.id, direction: "down" });

    expect(names()).toEqual(before);
  });

  it("keeps every category present however much it is shuffled", () => {
    const before = [...names()].sort();
    const list = listCategories(db);

    moveCategory(db, { categoryId: list[2].id, direction: "up" });
    moveCategory(db, { categoryId: list[0].id, direction: "down" });
    moveCategory(db, { categoryId: list[4].id, direction: "up" });

    expect([...names()].sort()).toEqual(before);
  });
});

describe("household name", () => {
  it("falls back to the app name until one is set", () => {
    expect(householdName(db)).toBe("RoomieBudget");
  });

  it("stores and reads back a name", () => {
    setSetting(db, HOUSEHOLD_NAME_KEY, "12 Marion Street");
    expect(householdName(db)).toBe("12 Marion Street");
    expect(getSetting(db, HOUSEHOLD_NAME_KEY)).toBe("12 Marion Street");
  });

  it("overwrites rather than duplicating", () => {
    setSetting(db, HOUSEHOLD_NAME_KEY, "First");
    setSetting(db, HOUSEHOLD_NAME_KEY, "Second");
    expect(householdName(db)).toBe("Second");
  });
});
