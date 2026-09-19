import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { formatAud, splitEvenly } from "@/lib/money";
import { newId } from "@/lib/ids";
import { openDatabase, type Db } from "./connection";
import { billShares, bills, users } from "./schema";

let db: Db;
let alice: string;
let bob: string;

beforeEach(() => {
  db = openDatabase(":memory:");

  alice = newId();
  bob = newId();
  db.insert(users)
    .values([
      { id: alice, email: "alice@example.com", name: "Alice", passwordHash: "x", role: "admin" },
      { id: bob, email: "bob@example.com", name: "Bob", passwordHash: "x" },
    ])
    .run();
});

function insertBill(totalCents: number) {
  const id = newId();
  db.insert(bills)
    .values({
      id,
      description: "Electricity",
      totalCents,
      issuedOn: "2026-09-19",
      dueOn: "2026-10-03",
      createdBy: alice,
    })
    .run();
  return id;
}

describe("migrations", () => {
  it("brings an empty database up to a usable schema", () => {
    expect(db.select().from(users).all()).toHaveLength(2);
  });
});

describe("constraints", () => {
  it("enforces foreign keys", () => {
    expect(() =>
      db
        .insert(billShares)
        .values({ id: newId(), billId: "nonexistent", userId: alice, amountCents: 1 })
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it("refuses to bill the same person twice on one bill", () => {
    const billId = insertBill(1000);
    db.insert(billShares).values({ id: newId(), billId, userId: alice, amountCents: 500 }).run();

    expect(() =>
      db.insert(billShares).values({ id: newId(), billId, userId: alice, amountCents: 500 }).run(),
    ).toThrow(/UNIQUE/i);
  });

  it("refuses two accounts on one email address", () => {
    expect(() =>
      db
        .insert(users)
        .values({ id: newId(), email: "alice@example.com", name: "Impostor", passwordHash: "x" })
        .run(),
    ).toThrow(/UNIQUE/i);
  });

  it("removes shares along with the bill they belong to", () => {
    const billId = insertBill(1000);
    db.insert(billShares).values({ id: newId(), billId, userId: alice, amountCents: 1000 }).run();

    db.delete(bills).where(eq(bills.id, billId)).run();
    expect(db.select().from(billShares).all()).toHaveLength(0);
  });

  it("will not delete a housemate who still appears on a bill", () => {
    const billId = insertBill(1000);
    db.insert(billShares).values({ id: newId(), billId, userId: bob, amountCents: 1000 }).run();

    expect(() => db.delete(users).where(eq(users.id, bob)).run()).toThrow(/FOREIGN KEY/i);
  });
});

describe("storing a split bill", () => {
  it("round-trips shares that reconcile against the total", () => {
    const total = 24755; // $247.55 across two people does not divide evenly
    const billId = insertBill(total);
    const shares = splitEvenly(total, 2);

    db.insert(billShares)
      .values([
        { id: newId(), billId, userId: alice, amountCents: shares[0] },
        { id: newId(), billId, userId: bob, amountCents: shares[1] },
      ])
      .run();

    const stored = db.select().from(billShares).where(eq(billShares.billId, billId)).all();
    const sum = stored.reduce((acc, row) => acc + row.amountCents, 0);

    expect(formatAud(sum)).toBe("$247.55");
    expect(sum).toBe(total);
  });

  it("keeps calendar dates as written, with no timezone drift", () => {
    const billId = insertBill(1000);
    const [row] = db.select().from(bills).where(eq(bills.id, billId)).all();

    expect(row.issuedOn).toBe("2026-09-19");
    expect(row.dueOn).toBe("2026-10-03");
  });

  it("defaults a new share to unsettled", () => {
    const billId = insertBill(1000);
    db.insert(billShares).values({ id: newId(), billId, userId: bob, amountCents: 1000 }).run();

    const [share] = db.select().from(billShares).all();
    expect(share.settledAt).toBeNull();
    expect(share.settledBy).toBeNull();
  });
});
