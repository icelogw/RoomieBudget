import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { auditLog, billShares, bills, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Cents } from "@/lib/money";
import { computeShares, type Split } from "@/lib/split";

/**
 * Bill reads and writes. A plain module, not a server action file: these are
 * called from actions and pages, and none of them should be reachable as an
 * endpoint in their own right.
 */

export type ShareWithPerson = {
  id: string;
  userId: string;
  name: string;
  amountCents: Cents;
  settledAt: Date | null;
  settledByName: string | null;
};

export type BillDetail = {
  id: string;
  description: string;
  category: string | null;
  totalCents: Cents;
  notes: string | null;
  issuedOn: string;
  dueOn: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  shares: ShareWithPerson[];
  /** Total still owed across everyone on this bill. */
  outstandingCents: Cents;
  isSettled: boolean;
};

export type CreateBillInput = {
  createdBy: string;
  description: string;
  category?: string | null;
  totalCents: Cents;
  issuedOn: string;
  dueOn?: string | null;
  notes?: string | null;
  split: Split;
};

/**
 * Create a bill and its shares in one transaction.
 *
 * Shares are computed here, on the server, from the total and the split. The
 * browser shows a preview while the bill is being entered, but that preview is
 * never trusted — it arrives as a split description, not as amounts.
 */
export function createBill(db: Db, input: CreateBillInput): string {
  // Throws before anything is written if the split does not reconcile.
  const shares = computeShares(input.totalCents, input.split);

  const billId = newId();

  db.transaction((tx) => {
    const participantIds = shares.map((s) => s.userId);
    const known = tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, participantIds))
      .all();

    if (known.length !== participantIds.length) {
      throw new Error("A person on this bill is not in the household");
    }

    tx.insert(bills)
      .values({
        id: billId,
        description: input.description,
        category: input.category ?? null,
        totalCents: input.totalCents,
        notes: input.notes ?? null,
        issuedOn: input.issuedOn,
        dueOn: input.dueOn ?? null,
        createdBy: input.createdBy,
      })
      .run();

    tx.insert(billShares)
      .values(
        shares.map((share) => ({
          id: newId(),
          billId,
          userId: share.userId,
          amountCents: share.amountCents,
        })),
      )
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.createdBy,
        action: "bill.created",
        entityType: "bill",
        entityId: billId,
        detail: JSON.stringify({
          totalCents: input.totalCents,
          mode: input.split.mode,
          people: participantIds.length,
        }),
      })
      .run();
  });

  return billId;
}

/** Shares for a set of bills, with the names needed to display them. */
function loadShares(db: Db, billIds: string[]): Map<string, ShareWithPerson[]> {
  const grouped = new Map<string, ShareWithPerson[]>();
  if (billIds.length === 0) return grouped;

  const rows = db
    .select({
      id: billShares.id,
      billId: billShares.billId,
      userId: billShares.userId,
      amountCents: billShares.amountCents,
      settledAt: billShares.settledAt,
      settledBy: billShares.settledBy,
      name: users.name,
    })
    .from(billShares)
    .innerJoin(users, eq(billShares.userId, users.id))
    .where(inArray(billShares.billId, billIds))
    .all();

  // Resolve who settled each share without a second join to users.
  const nameById = new Map(rows.map((r) => [r.userId, r.name]));

  for (const row of rows) {
    const list = grouped.get(row.billId) ?? [];
    list.push({
      id: row.id,
      userId: row.userId,
      name: row.name,
      amountCents: row.amountCents,
      settledAt: row.settledAt,
      settledByName: row.settledBy ? (nameById.get(row.settledBy) ?? null) : null,
    });
    grouped.set(row.billId, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
}

function toDetail(
  row: typeof bills.$inferSelect & { createdByName: string },
  shares: ShareWithPerson[],
): BillDetail {
  const outstandingCents = shares
    .filter((s) => s.settledAt === null)
    .reduce((acc, s) => acc + s.amountCents, 0);

  return {
    id: row.id,
    description: row.description,
    category: row.category,
    totalCents: row.totalCents,
    notes: row.notes,
    issuedOn: row.issuedOn,
    dueOn: row.dueOn,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    shares,
    outstandingCents,
    isSettled: shares.length > 0 && outstandingCents === 0,
  };
}

export function listBills(db: Db): BillDetail[] {
  const rows = db
    .select({
      bill: bills,
      createdByName: users.name,
    })
    .from(bills)
    .innerJoin(users, eq(bills.createdBy, users.id))
    .where(isNull(bills.voidedAt))
    // Newest first by issue date, then by creation so same-day bills keep a
    // stable order instead of shuffling between page loads.
    .orderBy(desc(bills.issuedOn), desc(bills.createdAt))
    .all();

  const shares = loadShares(
    db,
    rows.map((r) => r.bill.id),
  );

  return rows.map((r) =>
    toDetail({ ...r.bill, createdByName: r.createdByName }, shares.get(r.bill.id) ?? []),
  );
}

export function getBill(db: Db, billId: string): BillDetail | null {
  const row = db
    .select({ bill: bills, createdByName: users.name })
    .from(bills)
    .innerJoin(users, eq(bills.createdBy, users.id))
    .where(eq(bills.id, billId))
    .get();

  if (!row) return null;

  const shares = loadShares(db, [billId]).get(billId) ?? [];
  return toDetail({ ...row.bill, createdByName: row.createdByName }, shares);
}

/**
 * Mark one person's share settled, or undo that.
 *
 * Either party may do this — the household chose a single tap over a
 * two-sided confirmation — so the actor is always recorded. Undo exists
 * because a single tap is easy to make by accident.
 */
export function setShareSettled(
  db: Db,
  input: { shareId: string; actorId: string; settled: boolean; note?: string | null },
): boolean {
  return db.transaction((tx) => {
    const share = tx.select().from(billShares).where(eq(billShares.id, input.shareId)).get();
    if (!share) return false;

    const bill = tx.select().from(bills).where(eq(bills.id, share.billId)).get();
    if (!bill || bill.voidedAt) return false;

    tx.update(billShares)
      .set({
        settledAt: input.settled ? new Date() : null,
        settledBy: input.settled ? input.actorId : null,
        settleNote: input.settled ? (input.note ?? null) : null,
      })
      .where(eq(billShares.id, input.shareId))
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: input.settled ? "share.settled" : "share.unsettled",
        entityType: "bill_share",
        entityId: input.shareId,
        detail: JSON.stringify({
          billId: share.billId,
          forUserId: share.userId,
          amountCents: share.amountCents,
        }),
      })
      .run();

    return true;
  });
}

/** Settle every outstanding share one person owes, across all bills. */
export function settleAllForUser(
  db: Db,
  input: { userId: string; actorId: string },
): number {
  return db.transaction((tx) => {
    const outstanding = tx
      .select({ id: billShares.id, amountCents: billShares.amountCents })
      .from(billShares)
      .innerJoin(bills, eq(billShares.billId, bills.id))
      .where(
        and(
          eq(billShares.userId, input.userId),
          isNull(billShares.settledAt),
          isNull(bills.voidedAt),
        ),
      )
      .all();

    if (outstanding.length === 0) return 0;

    const now = new Date();
    for (const share of outstanding) {
      tx.update(billShares)
        .set({ settledAt: now, settledBy: input.actorId })
        .where(eq(billShares.id, share.id))
        .run();
    }

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: "shares.settled_all",
        entityType: "user",
        entityId: input.userId,
        detail: JSON.stringify({
          count: outstanding.length,
          totalCents: outstanding.reduce((acc, s) => acc + s.amountCents, 0),
        }),
      })
      .run();

    return outstanding.length;
  });
}

/**
 * Void a bill. Never a delete: the row stays, with who voided it and why, so
 * "what happened to the power bill?" has an answer.
 */
export function voidBill(
  db: Db,
  input: { billId: string; actorId: string; reason: string },
): boolean {
  return db.transaction((tx) => {
    const bill = tx.select().from(bills).where(eq(bills.id, input.billId)).get();
    if (!bill || bill.voidedAt) return false;

    tx.update(bills)
      .set({ voidedAt: new Date(), voidedBy: input.actorId, voidReason: input.reason })
      .where(eq(bills.id, input.billId))
      .run();

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: "bill.voided",
        entityType: "bill",
        entityId: input.billId,
        detail: JSON.stringify({ reason: input.reason }),
      })
      .run();

    return true;
  });
}
