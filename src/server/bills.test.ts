import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  createBill,
  getBill,
  listBills,
  setShareSettled,
  settleAllForUser,
  voidBill,
} from "./bills";

let db: Db;
let alice: string;
let bob: string;
let charlie: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  alice = newId();
  bob = newId();
  charlie = newId();

  db.insert(users)
    .values([
      { id: alice, email: "alice@example.com", name: "Alice", passwordHash: "x", role: "admin" },
      { id: bob, email: "bob@example.com", name: "Bob", passwordHash: "x" },
      { id: charlie, email: "charlie@example.com", name: "Charlie", passwordHash: "x" },
    ])
    .run();
});

function newBill(totalCents: number, userIds: string[] = [alice, bob], paidBy = alice) {
  return createBill(db, {
    createdBy: alice,
    paidBy,
    description: "Electricity",
    totalCents,
    issuedOn: "2026-09-19",
    dueOn: "2026-10-03",
    split: { mode: "even", userIds },
  });
}

describe("createBill", () => {
  it("stores shares that reconcile against the total", () => {
    const id = newBill(24_755, [alice, bob, charlie]);
    const bill = getBill(db, id)!;

    expect(bill.shares).toHaveLength(3);
    expect(bill.shares.reduce((a, s) => a + s.amountCents, 0)).toBe(24_755);
    expect(bill.isSettled).toBe(false);
  });

  it("leaves only the non-payers owing anything", () => {
    const id = newBill(24_755, [alice, bob, charlie]);
    const bill = getBill(db, id)!;

    // Alice paid, so her own share is settled on creation and the amount
    // still owed is the bill less her share.
    const alicesShare = bill.shares.find((s) => s.name === "Alice")!;
    expect(alicesShare.settledAt).not.toBeNull();
    expect(bill.outstandingCents).toBe(24_755 - alicesShare.amountCents);
  });

  it("writes nothing when the split does not reconcile", () => {
    expect(() =>
      createBill(db, {
        createdBy: alice,
        description: "Broken",
        totalCents: 10_000,
        issuedOn: "2026-09-19",
        split: {
          mode: "amount",
          entries: [
            { userId: alice, amountCents: 2500 },
            { userId: bob, amountCents: 7000 },
          ],
        },
      }),
    ).toThrow(/short of/);

    expect(listBills(db)).toHaveLength(0);
  });

  it("refuses somebody who is not in the household", () => {
    expect(() =>
      createBill(db, {
        createdBy: alice,
        description: "Ghost",
        totalCents: 1000,
        issuedOn: "2026-09-19",
        split: { mode: "even", userIds: [alice, "not-a-real-person"] },
      }),
    ).toThrow(/not in the household/);

    expect(listBills(db)).toHaveLength(0);
  });

  it("keeps the calendar dates exactly as given", () => {
    const bill = getBill(db, newBill(1000))!;
    expect(bill.issuedOn).toBe("2026-09-19");
    expect(bill.dueOn).toBe("2026-10-03");
  });
});

describe("settling", () => {
  it("clears one share and leaves the rest outstanding", () => {
    const id = newBill(10_000);
    const before = getBill(db, id)!;

    expect(setShareSettled(db, { shareId: before.shares[0].id, actorId: bob, settled: true })).toBe(true);

    const after = getBill(db, id)!;
    expect(after.outstandingCents).toBe(5000);
    expect(after.isSettled).toBe(false);
  });

  it("records who settled it, since either party may", () => {
    const id = newBill(10_000);
    const share = getBill(db, id)!.shares.find((s) => s.name === "Alice")!;

    setShareSettled(db, { shareId: share.id, actorId: bob, settled: true });

    const settled = getBill(db, id)!.shares.find((s) => s.name === "Alice")!;
    expect(settled.settledByName).toBe("Bob");
    expect(settled.settledAt).toBeInstanceOf(Date);
  });

  it("marks the bill settled once every share is", () => {
    const id = newBill(10_000);
    for (const share of getBill(db, id)!.shares) {
      setShareSettled(db, { shareId: share.id, actorId: alice, settled: true });
    }

    const bill = getBill(db, id)!;
    expect(bill.isSettled).toBe(true);
    expect(bill.outstandingCents).toBe(0);
  });

  it("can be undone, because one tap is easy to misfire", () => {
    const id = newBill(10_000);
    const share = getBill(db, id)!.shares[0];

    setShareSettled(db, { shareId: share.id, actorId: bob, settled: true });
    setShareSettled(db, { shareId: share.id, actorId: bob, settled: false });

    const after = getBill(db, id)!.shares.find((s) => s.id === share.id)!;
    expect(after.settledAt).toBeNull();
    expect(after.settledByName).toBeNull();
    expect(getBill(db, id)!.outstandingCents).toBe(10_000);
  });

  it("will not settle a share on a voided bill", () => {
    const id = newBill(10_000);
    const share = getBill(db, id)!.shares[0];
    voidBill(db, { billId: id, actorId: alice, reason: "Entered twice" });

    expect(setShareSettled(db, { shareId: share.id, actorId: bob, settled: true })).toBe(false);
  });
});

describe("settleAllForUser", () => {
  it("clears everything one person owes, across bills", () => {
    newBill(10_000);
    newBill(6000);

    expect(settleAllForUser(db, { userId: bob, actorId: alice })).toBe(2);

    const stillOwed = listBills(db)
      .flatMap((b) => b.shares)
      .filter((s) => s.name === "Bob" && s.settledAt === null);
    expect(stillOwed).toHaveLength(0);
  });

  it("leaves other people alone", () => {
    // Charlie paid, so both Alice and Bob owe a share; settling Bob's must
    // not touch Alice's.
    newBill(9000, [alice, bob, charlie], charlie);
    settleAllForUser(db, { userId: bob, actorId: charlie });

    const aliceShare = listBills(db)[0].shares.find((s) => s.name === "Alice")!;
    expect(aliceShare.settledAt).toBeNull();
  });

  it("ignores shares on voided bills", () => {
    const voided = newBill(10_000);
    voidBill(db, { billId: voided, actorId: alice, reason: "Duplicate" });
    newBill(4000);

    expect(settleAllForUser(db, { userId: bob, actorId: alice })).toBe(1);
  });

  it("reports nothing to do when there is nothing outstanding", () => {
    expect(settleAllForUser(db, { userId: bob, actorId: alice })).toBe(0);
  });
});

describe("voiding", () => {
  it("hides the bill from the list but keeps the record", () => {
    const id = newBill(10_000);
    voidBill(db, { billId: id, actorId: alice, reason: "Entered twice" });

    expect(listBills(db)).toHaveLength(0);

    const bill = getBill(db, id)!;
    expect(bill.voidedAt).toBeInstanceOf(Date);
    expect(bill.voidReason).toBe("Entered twice");
  });

  it("cannot be done twice", () => {
    const id = newBill(10_000);
    expect(voidBill(db, { billId: id, actorId: alice, reason: "First" })).toBe(true);
    expect(voidBill(db, { billId: id, actorId: alice, reason: "Second" })).toBe(false);
  });
});

describe("listBills", () => {
  it("returns newest issue date first", () => {
    createBill(db, {
      createdBy: alice,
      description: "Older",
      totalCents: 1000,
      issuedOn: "2026-08-01",
      split: { mode: "single", userId: bob },
    });
    createBill(db, {
      createdBy: alice,
      description: "Newer",
      totalCents: 1000,
      issuedOn: "2026-09-19",
      split: { mode: "single", userId: bob },
    });

    expect(listBills(db).map((b) => b.description)).toEqual(["Newer", "Older"]);
  });

  it("names who entered each bill", () => {
    newBill(1000);
    expect(listBills(db)[0].createdByName).toBe("Alice");
  });
});
