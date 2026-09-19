import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { balanceFor, outstandingDebts, settleBetween } from "./balances";
import { createBill, getBill, setShareSettled, voidBill } from "./bills";

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
      { id: alice, email: "a@example.com", name: "Alice", passwordHash: "x", role: "admin" },
      { id: bob, email: "b@example.com", name: "Bob", passwordHash: "x" },
      { id: charlie, email: "c@example.com", name: "Charlie", passwordHash: "x" },
    ])
    .run();
});

/** `payer` fronted `totalCents`, split evenly between everyone listed. */
function bill(payer: string, totalCents: number, between: string[], description = "Bill") {
  return createBill(db, {
    createdBy: payer,
    paidBy: payer,
    description,
    totalCents,
    issuedOn: "2026-09-19",
    split: { mode: "even", userIds: between },
  });
}

describe("the payer never owes themselves", () => {
  it("settles the payer's own share when the bill is created", () => {
    const id = bill(alice, 10_000, [alice, bob]);
    const aliceShare = getBill(db, id)!.shares.find((s) => s.name === "Alice")!;

    expect(aliceShare.settledAt).not.toBeNull();
  });

  it("leaves only the other person outstanding", () => {
    const id = bill(alice, 10_000, [alice, bob]);
    expect(getBill(db, id)!.outstandingCents).toBe(5000);
  });

  it("produces one debt, in the right direction", () => {
    bill(alice, 10_000, [alice, bob]);

    const debts = outstandingDebts(db);
    expect(debts).toHaveLength(1);
    expect(debts[0].debtorName).toBe("Bob");
    expect(debts[0].creditorName).toBe("Alice");
    expect(debts[0].amountCents).toBe(5000);
  });
});

describe("netting", () => {
  it("cancels debts that run both ways", () => {
    bill(alice, 12_000, [alice, bob]); // Bob owes Alice $60
    bill(bob, 5000, [alice, bob]); // Alice owes Bob $25

    const debts = outstandingDebts(db);
    expect(debts).toHaveLength(1);
    expect(debts[0].debtorName).toBe("Bob");
    expect(debts[0].amountCents).toBe(3500); // $60 - $25
  });

  it("reports nothing when two people are square", () => {
    bill(alice, 10_000, [alice, bob]); // Bob owes Alice $50
    bill(bob, 10_000, [alice, bob]); // Alice owes Bob $50

    expect(outstandingDebts(db)).toHaveLength(0);
  });

  it("keeps separate pairs separate", () => {
    bill(alice, 10_000, [alice, bob]); // Bob owes Alice $50
    bill(alice, 10_000, [alice, charlie]); // Charlie owes Alice $50

    const debts = outstandingDebts(db);
    expect(debts).toHaveLength(2);
    expect(debts.every((d) => d.creditorName === "Alice")).toBe(true);
  });

  it("ignores voided bills", () => {
    const id = bill(alice, 10_000, [alice, bob]);
    voidBill(db, { billId: id, actorId: alice, reason: "Entered twice" });

    expect(outstandingDebts(db)).toHaveLength(0);
  });

  it("drops a debt once its share is settled", () => {
    const id = bill(alice, 10_000, [alice, bob]);
    const bobShare = getBill(db, id)!.shares.find((s) => s.name === "Bob")!;

    setShareSettled(db, { shareId: bobShare.id, actorId: bob, settled: true });
    expect(outstandingDebts(db)).toHaveLength(0);
  });
});

describe("balanceFor", () => {
  it("frames the same numbers from one person's side", () => {
    bill(alice, 12_000, [alice, bob]); // Bob owes Alice $60
    bill(bob, 4000, [bob, charlie]); // Charlie owes Bob $20

    const forBob = balanceFor(db, bob);
    expect(forBob.youOweCents).toBe(6000);
    expect(forBob.owedToYouCents).toBe(2000);
    expect(forBob.netCents).toBe(-4000);
  });

  it("excludes debts between other people", () => {
    bill(alice, 10_000, [alice, charlie]);
    expect(balanceFor(db, bob).debts).toHaveLength(0);
  });

  it("reads as zero when nothing is outstanding", () => {
    const balance = balanceFor(db, alice);
    expect(balance.youOweCents).toBe(0);
    expect(balance.owedToYouCents).toBe(0);
    expect(balance.netCents).toBe(0);
  });
});

describe("settleBetween", () => {
  it("clears everything owed to that one person", () => {
    bill(alice, 10_000, [alice, bob]);
    bill(alice, 6000, [alice, bob]);

    const result = settleBetween(db, { debtorId: bob, creditorId: alice, actorId: bob });
    expect(result.count).toBe(2);
    expect(result.totalCents).toBe(8000);
    expect(outstandingDebts(db)).toHaveLength(0);
  });

  it("does not touch what the same person owes someone else", () => {
    bill(alice, 10_000, [alice, bob]); // Bob owes Alice $50
    bill(charlie, 8000, [charlie, bob]); // Bob owes Charlie $40

    settleBetween(db, { debtorId: bob, creditorId: alice, actorId: bob });

    const remaining = outstandingDebts(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].creditorName).toBe("Charlie");
    expect(remaining[0].amountCents).toBe(4000);
  });

  it("does nothing when there is nothing owed", () => {
    expect(settleBetween(db, { debtorId: bob, creditorId: alice, actorId: bob })).toEqual({
      count: 0,
      totalCents: 0,
    });
  });

  it("ignores shares on voided bills", () => {
    const voided = bill(alice, 10_000, [alice, bob]);
    voidBill(db, { billId: voided, actorId: alice, reason: "Duplicate" });
    bill(alice, 4000, [alice, bob]);

    expect(settleBetween(db, { debtorId: bob, creditorId: alice, actorId: bob }).count).toBe(1);
  });
});

describe("odd amounts still reconcile", () => {
  it("nets to the cent across an uneven three-way split", () => {
    // $100.01 three ways leaves two cents over, so the split is
    // 3334 / 3334 / 3333. Alice paid, so her own 3334 is settled and the
    // other two owe 3334 and 3333.
    bill(alice, 10_001, [alice, bob, charlie]);

    const owedToAlice = outstandingDebts(db)
      .filter((d) => d.creditorName === "Alice")
      .reduce((acc, d) => acc + d.amountCents, 0);

    expect(owedToAlice).toBe(6667);
    // Whatever Alice is owed, plus her own share, must be the whole bill.
    expect(owedToAlice + 3334).toBe(10_001);
  });

  it("leaves nobody out of pocket once everyone settles", () => {
    bill(alice, 10_001, [alice, bob, charlie]);

    settleBetween(db, { debtorId: bob, creditorId: alice, actorId: bob });
    settleBetween(db, { debtorId: charlie, creditorId: alice, actorId: charlie });

    expect(outstandingDebts(db)).toHaveLength(0);
    expect(balanceFor(db, alice).netCents).toBe(0);
  });
});
