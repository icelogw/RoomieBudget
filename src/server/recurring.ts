import { and, asc, eq, lte } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { auditLog, billShares, bills, recurringSeries, users } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import type { Cents } from "@/lib/money";
import { nextOccurrenceAfter, occurrencesBetween, type Frequency } from "@/lib/recurrence";
import { computeShares, type Split } from "@/lib/split";
import { createBill } from "./bills";

/**
 * Recurring bills.
 *
 * A series stores how a bill repeats and how it is divided; the generator
 * turns that into real bills. Nothing is generated ahead of time — a bill
 * appears on the day it is due to be issued, not before.
 */

/** JSON shape of recurring_series.splitConfig. */
export type SeriesParticipant = { userId: string; weight: number };

export type SeriesSummary = {
  id: string;
  description: string;
  category: string | null;
  amountMode: "fixed" | "prompt";
  totalCents: Cents | null;
  frequency: Frequency;
  anchorDate: string;
  nextIssueOn: string;
  dueOffsetDays: number;
  splitMode: "even" | "weights" | "single";
  participants: SeriesParticipant[];
  participantNames: string[];
  isActive: boolean;
  paidBy: string;
  paidByName: string;
};

function parseParticipants(json: string): SeriesParticipant[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Turn a stored series split into the split the bill engine understands. */
export function seriesSplit(
  splitMode: "even" | "weights" | "single",
  participants: SeriesParticipant[],
): Split {
  if (splitMode === "single") {
    return { mode: "single", userId: participants[0]?.userId ?? "" };
  }
  if (splitMode === "even") {
    return { mode: "even", userIds: participants.map((p) => p.userId) };
  }
  return {
    mode: "weights",
    entries: participants.map((p) => ({ userId: p.userId, weight: p.weight })),
  };
}

export type CreateSeriesInput = {
  createdBy: string;
  paidBy: string;
  description: string;
  category?: string | null;
  amountMode: "fixed" | "prompt";
  totalCents?: Cents | null;
  frequency: Frequency;
  anchorDate: string;
  dueOffsetDays: number;
  splitMode: "even" | "weights" | "single";
  participants: SeriesParticipant[];
};

export function createSeries(db: Db, input: CreateSeriesInput): string {
  if (input.participants.length === 0) {
    throw new Error("A recurring bill needs at least one person on it");
  }
  if (input.amountMode === "fixed" && (!input.totalCents || input.totalCents <= 0)) {
    throw new Error("A fixed recurring bill needs an amount");
  }

  const id = newId();

  db.transaction((tx) => {
    tx.insert(recurringSeries)
      .values({
        id,
        description: input.description,
        category: input.category ?? null,
        amountMode: input.amountMode,
        totalCents: input.amountMode === "fixed" ? (input.totalCents ?? null) : null,
        frequency: input.frequency,
        anchorDate: input.anchorDate,
        // The anchor is itself the first occurrence, so a series created with
        // a past anchor catches up on the next run rather than skipping it.
        nextIssueOn: input.anchorDate,
        dueOffsetDays: input.dueOffsetDays,
        splitMode: input.splitMode,
        splitConfig: JSON.stringify(input.participants),
        createdBy: input.createdBy,
        paidBy: input.paidBy,
      })
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.createdBy,
        action: "series.created",
        entityType: "recurring_series",
        entityId: id,
        detail: JSON.stringify({
          frequency: input.frequency,
          amountMode: input.amountMode,
        }),
      })
      .run();
  });

  return id;
}

export function listSeries(db: Db): SeriesSummary[] {
  const rows = db
    .select({ series: recurringSeries, creatorName: users.name })
    .from(recurringSeries)
    .innerJoin(users, eq(recurringSeries.createdBy, users.id))
    .orderBy(asc(recurringSeries.nextIssueOn))
    .all();

  const names = new Map(
    db.select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]),
  );

  return rows.map(({ series, creatorName }) => {
    const participants = parseParticipants(series.splitConfig);
    return {
      id: series.id,
      description: series.description,
      category: series.category,
      amountMode: series.amountMode,
      totalCents: series.totalCents,
      frequency: series.frequency,
      anchorDate: series.anchorDate,
      nextIssueOn: series.nextIssueOn,
      dueOffsetDays: series.dueOffsetDays,
      splitMode: series.splitMode,
      participants,
      participantNames: participants.map((p) => names.get(p.userId) ?? "Unknown"),
      isActive: series.isActive,
      paidBy: series.paidBy ?? series.createdBy,
      paidByName: names.get(series.paidBy ?? series.createdBy) ?? creatorName,
    };
  });
}

export function setSeriesActive(
  db: Db,
  input: { seriesId: string; actorId: string; active: boolean },
): boolean {
  const series = db
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.id, input.seriesId))
    .get();
  if (!series) return false;

  db.update(recurringSeries)
    .set({
      isActive: input.active,
      // Resuming a paused series should not issue every bill it missed while
      // paused. Restart from the next occurrence after today.
      nextIssueOn: input.active
        ? nextOccurrenceAfter(series.anchorDate, series.frequency, todayIso())
        : series.nextIssueOn,
    })
    .where(eq(recurringSeries.id, input.seriesId))
    .run();

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: input.active ? "series.resumed" : "series.paused",
      entityType: "recurring_series",
      entityId: input.seriesId,
    })
    .run();

  return true;
}

export function deleteSeries(
  db: Db,
  input: { seriesId: string; actorId: string },
): boolean {
  const series = db
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.id, input.seriesId))
    .get();
  if (!series) return false;

  // Bills already generated keep their history; the schema sets their
  // series_id to null rather than removing them.
  db.delete(recurringSeries).where(eq(recurringSeries.id, input.seriesId)).run();

  db.insert(auditLog)
    .values({
      id: newId(),
      actorId: input.actorId,
      action: "series.deleted",
      entityType: "recurring_series",
      entityId: input.seriesId,
      detail: JSON.stringify({ description: series.description }),
    })
    .run();

  return true;
}

export type GenerationResult = {
  billsCreated: number;
  seriesProcessed: number;
  skipped: number;
};

/**
 * Issue every bill that is due, including any missed while the app was down.
 *
 * Safe to call repeatedly: the unique index on (series_id, issued_on) means a
 * second run for the same date is rejected by the database rather than relying
 * on this function to remember.
 *
 * `catchUpLimit` bounds how much history a long-dormant series can produce, so
 * a container switched off for a year does not wake up and issue fifty-two
 * bills at once.
 */
export function generateDueBills(
  db: Db,
  options: { today?: string; catchUpLimit?: number } = {},
): GenerationResult {
  const today = options.today ?? todayIso();
  const catchUpLimit = options.catchUpLimit ?? 12;

  const due = db
    .select()
    .from(recurringSeries)
    .where(and(eq(recurringSeries.isActive, true), lte(recurringSeries.nextIssueOn, today)))
    .all();

  let billsCreated = 0;
  let skipped = 0;

  for (const series of due) {
    const participants = parseParticipants(series.splitConfig);
    if (participants.length === 0) {
      skipped += 1;
      continue;
    }

    const dates = occurrencesBetween(
      series.anchorDate,
      series.frequency,
      series.nextIssueOn,
      today,
      catchUpLimit,
    );

    let lastIssued: string | null = null;

    for (const issuedOn of dates) {
      // A series with a variable amount cannot generate a real bill on its
      // own — a power bill is never the same twice, and guessing would be
      // worse than asking. Those are handled separately as drafts.
      if (series.amountMode === "prompt") {
        const existing = db
          .select({ id: bills.id })
          .from(bills)
          .where(and(eq(bills.seriesId, series.id), eq(bills.issuedOn, issuedOn)))
          .get();

        if (!existing) {
          db.insert(bills)
            .values({
              id: newId(),
              description: series.description,
              category: series.category,
              totalCents: 0,
              issuedOn,
              dueOn: addDays(issuedOn, series.dueOffsetDays),
              isDraft: true,
              seriesId: series.id,
              createdBy: series.createdBy,
              paidBy: series.paidBy ?? series.createdBy,
            })
            .run();
          billsCreated += 1;
        } else {
          skipped += 1;
        }

        lastIssued = issuedOn;
        continue;
      }

      try {
        createBill(db, {
          createdBy: series.createdBy,
          paidBy: series.paidBy ?? series.createdBy,
          description: series.description,
          category: series.category,
          totalCents: series.totalCents!,
          issuedOn,
          dueOn: addDays(issuedOn, series.dueOffsetDays),
          seriesId: series.id,
          split: seriesSplit(series.splitMode, participants),
        });
        billsCreated += 1;
      } catch (error) {
        // A duplicate is the unique index doing its job on a repeated run,
        // and is not a failure. Anything else is, and must not stop the
        // remaining series from being processed.
        const message = error instanceof Error ? error.message : "";
        if (!/UNIQUE/i.test(message)) {
          console.error(`Recurring series ${series.id} failed on ${issuedOn}:`, error);
        }
        skipped += 1;
      }

      lastIssued = issuedOn;
    }

    if (lastIssued) {
      db.update(recurringSeries)
        .set({
          nextIssueOn: nextOccurrenceAfter(series.anchorDate, series.frequency, lastIssued),
        })
        .where(eq(recurringSeries.id, series.id))
        .run();
    }
  }

  return { billsCreated, seriesProcessed: due.length, skipped };
}

/**
 * Put an amount on a draft bill and split it.
 *
 * Series with a varying amount issue a bill with no figure on it — a power
 * bill is never the same twice, and guessing would be worse than asking. This
 * completes one, using the split the series was set up with.
 */
export function finaliseDraftBill(
  db: Db,
  input: { billId: string; totalCents: Cents; actorId: string },
): { ok: true } | { ok: false; reason: string } {
  const bill = db.select().from(bills).where(eq(bills.id, input.billId)).get();

  if (!bill) return { ok: false, reason: "That bill no longer exists." };
  if (!bill.isDraft) return { ok: false, reason: "That bill already has an amount." };
  if (bill.voidedAt) return { ok: false, reason: "That bill has been voided." };
  if (input.totalCents <= 0) return { ok: false, reason: "Enter an amount above zero." };

  const series = bill.seriesId
    ? db.select().from(recurringSeries).where(eq(recurringSeries.id, bill.seriesId)).get()
    : null;

  // A draft whose series has since been deleted still needs splitting. Falling
  // back to an even split between everyone active is better than stranding it.
  const participants = series
    ? parseParticipants(series.splitConfig)
    : db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.isActive, true))
        .all()
        .map((u) => ({ userId: u.id, weight: 1 }));

  if (participants.length === 0) {
    return { ok: false, reason: "There is nobody to split this between." };
  }

  const split = seriesSplit(series?.splitMode ?? "even", participants);
  const shares = computeShares(input.totalCents, split);
  const payer = bill.paidBy ?? bill.createdBy;
  const now = new Date();

  db.transaction((tx) => {
    tx.update(bills)
      .set({ totalCents: input.totalCents, isDraft: false })
      .where(eq(bills.id, input.billId))
      .run();

    tx.insert(billShares)
      .values(
        shares.map((share) => ({
          id: newId(),
          billId: input.billId,
          userId: share.userId,
          amountCents: share.amountCents,
          settledAt: share.userId === payer ? now : null,
          settledBy: share.userId === payer ? payer : null,
        })),
      )
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: "bill.finalised",
        entityType: "bill",
        entityId: input.billId,
        detail: JSON.stringify({ totalCents: input.totalCents }),
      })
      .run();
  });

  return { ok: true };
}
