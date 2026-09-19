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
    setSeriesActive(db, { seriesId: id, actorId: alice, active: false });

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

describe("pausing and resuming", () => {
  it("does not backfill the gap when resumed", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });
    setSeriesActive(db, { seriesId: id, actorId: alice, active: false });

    // Long gap while paused, then resumed. The missed fortnights are gone for
    // good rather than arriving all at once.
    setSeriesActive(db, { seriesId: id, actorId: alice, active: true });
    const next = listSeries(db)[0].nextIssueOn;

    expect(next > "2026-09-01").toBe(true);
    expect(listBills(db)).toHaveLength(1);
  });
});

describe("deleteSeries", () => {
  it("removes the series but keeps the bills it already issued", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });

    expect(deleteSeries(db, { seriesId: id, actorId: alice })).toBe(true);
    expect(listSeries(db)).toHaveLength(0);

    const remaining = listBills(db);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].description).toBe("Rent");
  });

  it("detaches those bills from the deleted series", () => {
    const id = series();
    generateDueBills(db, { today: "2026-09-01" });
    deleteSeries(db, { seriesId: id, actorId: alice });

    const orphaned = db.select().from(recurringSeries).where(eq(recurringSeries.id, id)).all();
    expect(orphaned).toHaveLength(0);
  });
});
