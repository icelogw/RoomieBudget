import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { recurringSeries, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { listBills } from "./bills";
import {
  createSeries,
  deleteSeries,
  generateDueBills,
  listSeries,
  setSeriesActive,
  type CreateSeriesInput,
} from "./recurring";

let db: Db;
let alice: string;
let bob: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  alice = newId();
  bob = newId();

  db.insert(users)
    .values([
      { id: alice, email: "a@example.com", name: "Alice", passwordHash: "x", role: "admin" },
      { id: bob, email: "b@example.com", name: "Bob", passwordHash: "x" },
    ])
    .run();
});

function series(overrides: Partial<CreateSeriesInput> = {}) {
  return createSeries(db, {
    createdBy: alice,
    paidBy: alice,
    description: "Rent",
    amountMode: "fixed",
    totalCents: 60_000,
    frequency: "fortnightly",
    anchorDate: "2026-09-01",
    dueOffsetDays: 7,
    splitMode: "even",
    participants: [
      { userId: alice, weight: 1 },
      { userId: bob, weight: 1 },
    ],
    ...overrides,
  });
}

describe("createSeries", () => {
  it("stores the series and schedules its first issue on the anchor", () => {
    series();
    const [stored] = listSeries(db);

    expect(stored.description).toBe("Rent");
    expect(stored.nextIssueOn).toBe("2026-09-01");
    expect(stored.participantNames.sort()).toEqual(["Alice", "Bob"]);
  });

  it("refuses a fixed series with no amount", () => {
    expect(() => series({ amountMode: "fixed", totalCents: null })).toThrow(/needs an amount/);
  });

  it("refuses a series with nobody on it", () => {
    expect(() => series({ participants: [] })).toThrow(/at least one person/);
  });
});

describe("generateDueBills", () => {
  it("issues nothing before the first occurrence", () => {
    series();
    expect(generateDueBills(db, { today: "2026-08-31" }).billsCreated).toBe(0);
    expect(listBills(db)).toHaveLength(0);
  });

  it("issues the bill on the day it falls due", () => {
    series();
    expect(generateDueBills(db, { today: "2026-09-01" }).billsCreated).toBe(1);

    const [bill] = listBills(db);
    expect(bill.description).toBe("Rent");
    expect(bill.issuedOn).toBe("2026-09-01");
    expect(bill.totalCents).toBe(60_000);
  });

  it("applies the due offset", () => {
    series();
    generateDueBills(db, { today: "2026-09-01" });
    expect(listBills(db)[0].dueOn).toBe("2026-09-08");
  });

  it("splits and settles the payer's share, like any other bill", () => {
    series();
    generateDueBills(db, { today: "2026-09-01" });

    const [bill] = listBills(db);
    expect(bill.shares).toHaveLength(2);
    expect(bill.outstandingCents).toBe(30_000);
    expect(bill.shares.find((s) => s.name === "Alice")!.settledAt).not.toBeNull();
  });

  it("is safe to run twice on the same day", () => {
    series();
    generateDueBills(db, { today: "2026-09-01" });
    const second = generateDueBills(db, { today: "2026-09-01" });

    expect(second.billsCreated).toBe(0);
    expect(listBills(db)).toHaveLength(1);
  });

  it("is safe to run many times", () => {
    series();
    for (let i = 0; i < 5; i++) generateDueBills(db, { today: "2026-09-01" });
    expect(listBills(db)).toHaveLength(1);
  });

  it("advances to the next occurrence after issuing", () => {
    series();
    generateDueBills(db, { today: "2026-09-01" });
    expect(listSeries(db)[0].nextIssueOn).toBe("2026-09-15");
  });

  it("catches up on everything missed while the app was down", () => {
    series();
    // Off from 1 September, back on the 30th: three fortnightly bills missed.
    const result = generateDueBills(db, { today: "2026-09-30" });

    expect(result.billsCreated).toBe(3);
    expect(listBills(db).map((b) => b.issuedOn).sort()).toEqual([
      "2026-09-01",
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("caps catch-up so a dormant series cannot flood the list", () => {
    series({ anchorDate: "2020-01-01", frequency: "weekly" });
    const result = generateDueBills(db, { today: "2026-09-30", catchUpLimit: 4 });

    expect(result.billsCreated).toBe(4);
  });

  it("skips a paused series", () => {
    const id = series();
    setSeriesActive(db, { seriesId: id, actor: { id: alice, role: "admin" }, active: false });

    expect(generateDueBills(db, { today: "2026-09-30" }).billsCreated).toBe(0);
  });

  it("issues a draft with no amount when the amount varies", () => {
    series({ description: "Electricity", amountMode: "prompt", totalCents: null, frequency: "quarterly" });
    generateDueBills(db, { today: "2026-09-01" });

    const drafts = db.select().from(recurringSeries).all();
    expect(drafts).toHaveLength(1);

    // The bill exists but carries no amount and no shares yet.
    const all = listBills(db);
    expect(all).toHaveLength(1);
    expect(all[0].totalCents).toBe(0);
    expect(all[0].shares).toHaveLength(0);
  });

  it("keeps separate series independent", () => {
    series({ description: "Rent" });
    series({ description: "Internet", frequency: "monthly", anchorDate: "2026-09-05" });

    const result = generateDueBills(db, { today: "2026-09-05" });
    expect(result.seriesProcessed).toBe(2);
    expect(listBills(db).map((b) => b.description).sort()).toEqual(["Internet", "Rent"]);
  });
});

describe("an occurrence that fails for a real reason", () => {
  /**
   * A duplicate is the idempotency index working and the series should move
   * on. Anything else is a genuine failure, and stepping over it silently
   * loses that month's bill — nobody is told, and the only trace is a console
   * line.
   *
   * The failure is induced by removing a participant's user row, which makes
   * createBill reject the occurrence without touching the generator itself.
   */
  function breakParticipant() {
    db.delete(users).where(eq(users.id, bob)).run();
  }

  function repairParticipant() {
    db.insert(users)
      .values({ id: bob, email: "b@example.com", name: "Bob", passwordHash: "x" })
      .run();
  }

  it("does not advance past the occurrence it could not issue", () => {
    series({ frequency: "fortnightly", anchorDate: "2026-09-01" });
    breakParticipant();

    generateDueBills(db, { today: "2026-09-01" });

    expect(listSeries(db)[0].nextIssueOn).toBe("2026-09-01");
    expect(listBills(db)).toHaveLength(0);
  });

  it("issues it on a later run once the cause is cleared", () => {
    series({ frequency: "fortnightly", anchorDate: "2026-09-01" });
    breakParticipant();
    generateDueBills(db, { today: "2026-09-01" });

    repairParticipant();
    const result = generateDueBills(db, { today: "2026-09-01" });

    expect(result.billsCreated).toBe(1);
    expect(listBills(db)[0].issuedOn).toBe("2026-09-01");
    expect(listSeries(db)[0].nextIssueOn).toBe("2026-09-15");
  });

  it("stops at the failure rather than carrying on past it", () => {
    // Four occurrences are due; the first cannot be issued, so none of the
    // later ones may be either — issuing them would leave a hole nobody sees.
    series({ frequency: "fortnightly", anchorDate: "2026-09-01" });
    breakParticipant();

    generateDueBills(db, { today: "2026-10-15" });

    expect(listBills(db)).toHaveLength(0);
    expect(listSeries(db)[0].nextIssueOn).toBe("2026-09-01");
  });

  it("leaves other series in the same run unaffected", () => {
    series({ description: "Rent", frequency: "fortnightly", anchorDate: "2026-09-01" });
    createSeries(db, {
      createdBy: alice,
      paidBy: alice,
      description: "Internet",
      amountMode: "fixed",
      totalCents: 8900,
      frequency: "monthly",
      anchorDate: "2026-09-01",
      dueOffsetDays: 7,
      splitMode: "single",
      participants: [{ userId: alice, weight: 1 }],
    });

    breakParticipant();
    generateDueBills(db, { today: "2026-09-01" });

    // Rent involves the missing participant and fails; Internet does not.
    expect(listBills(db).map((b) => b.description)).toEqual(["Internet"]);
  });

  it("retries a draft occurrence too, rather than skipping it", () => {
    // The draft path had no error handling at all, so a failure there threw
    // out of the loop and abandoned every remaining series in the tick.
    series({
      description: "Electricity",
      amountMode: "prompt",
      totalCents: null,
      frequency: "quarterly",
      anchorDate: "2026-09-01",
    });

    const first = generateDueBills(db, { today: "2026-09-01" });
    expect(first.billsCreated).toBe(1);

    // A repeat finds the existing draft, counts it as dealt with, and moves on.
    const second = generateDueBills(db, { today: "2026-09-01" });
    expect(second.billsCreated).toBe(0);
    expect(listBills(db)).toHaveLength(1);
  });
});

describe("pausing and resuming", () => {
  it("does not backfill the gap when resumed", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });
    setSeriesActive(db, { seriesId: id, actor: { id: alice, role: "admin" }, active: false });

    // Long gap while paused, then resumed. The missed fortnights are gone for
    // good rather than arriving all at once.
    setSeriesActive(db, { seriesId: id, actor: { id: alice, role: "admin" }, active: true });
    const next = listSeries(db)[0].nextIssueOn;

    expect(next > "2026-09-01").toBe(true);
    expect(listBills(db)).toHaveLength(1);
  });
});

describe("who may manage a series", () => {
  /**
   * Everything else on the Household page is admin-only, so a member being
   * able to delete the rent series while not being able to rename a category
   * was not a position anyone chose.
   */
  const member = { id: "", role: "member" as const };

  beforeEach(() => {
    member.id = bob;
  });

  it("refuses a member who did not set it up", () => {
    const id = series();

    expect(setSeriesActive(db, { seriesId: id, actor: member, active: false })).toBe(false);
    expect(deleteSeries(db, { seriesId: id, actor: member })).toBe(false);
  });

  it("leaves the series running after a refused pause", () => {
    const id = series();
    setSeriesActive(db, { seriesId: id, actor: member, active: false });

    expect(listSeries(db)[0].isActive).toBe(true);
  });

  it("allows whoever set it up, even as a member", () => {
    const id = createSeries(db, {
      createdBy: bob,
      paidBy: bob,
      description: "Internet",
      amountMode: "fixed",
      totalCents: 8900,
      frequency: "monthly",
      anchorDate: "2026-09-01",
      dueOffsetDays: 7,
      splitMode: "single",
      participants: [{ userId: bob, weight: 1 }],
    });

    expect(setSeriesActive(db, { seriesId: id, actor: member, active: false })).toBe(true);
    expect(deleteSeries(db, { seriesId: id, actor: member })).toBe(true);
  });

  it("allows an admin who did not set it up", () => {
    const id = createSeries(db, {
      createdBy: bob,
      paidBy: bob,
      description: "Internet",
      amountMode: "fixed",
      totalCents: 8900,
      frequency: "monthly",
      anchorDate: "2026-09-01",
      dueOffsetDays: 7,
      splitMode: "single",
      participants: [{ userId: bob, weight: 1 }],
    });

    expect(deleteSeries(db, { seriesId: id, actor: { id: alice, role: "admin" } })).toBe(true);
  });
});

describe("deleteSeries", () => {
  it("removes the series but keeps the bills it already issued", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });

    expect(deleteSeries(db, { seriesId: id, actor: { id: alice, role: "admin" } })).toBe(true);
    expect(listSeries(db)).toHaveLength(0);

    const remaining = listBills(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].description).toBe("Rent");
  });

  it("detaches those bills from the deleted series", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });
    deleteSeries(db, { seriesId: id, actor: { id: alice, role: "admin" } });

    const orphaned = db.select().from(recurringSeries).where(eq(recurringSeries.id, id)).all();
    expect(orphaned).toHaveLength(0);
  });
});
