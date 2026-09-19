import { and, eq, isNull, ne, or } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { auditLog, billShares, bills, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Cents } from "@/lib/money";

/**
 * Who owes whom, once everything outstanding is netted off.
 *
 * A share is a debt from the person it belongs to, to whoever fronted the
 * money for that bill. The payer's own share is settled at creation, so it
 * never appears here — nobody owes themselves.
 */

export type Debt = {
  debtorId: string;
  debtorName: string;
  creditorId: string;
  creditorName: string;
  amountCents: Cents;
  billCount: number;
};

type Raw = { debtorId: string; creditorId: string; amountCents: Cents };

function loadOutstanding(db: Db): { raw: Raw[]; names: Map<string, string> } {
  const rows = db
    .select({
      debtorId: billShares.userId,
      creditorId: bills.paidBy,
      amountCents: billShares.amountCents,
    })
    .from(billShares)
    .innerJoin(bills, eq(billShares.billId, bills.id))
    .where(
      and(
        isNull(billShares.settledAt),
        isNull(bills.voidedAt),
        // A share belonging to the payer is not a debt. Normally these are
        // already settled, but guarding here keeps the sum correct even if a
        // row was settled and then undone.
        ne(billShares.userId, bills.paidBy),
      ),
    )
    .all();

  const names = new Map(
    db.select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]),
  );

  return {
    raw: rows.filter((r): r is Raw => r.creditorId !== null),
    names,
  };
}

/**
 * Net every outstanding share down to one figure per pair of people.
 *
 * If Alice owes Bob $60 and Bob owes Alice $25, the answer is one debt of $35,
 * not two. Two housemates should not be transferring money past each other.
 */
export function outstandingDebts(db: Db): Debt[] {
  const { raw, names } = loadOutstanding(db);

  // Key each pair in a fixed order so both directions land in the same bucket.
  const pairs = new Map<
    string,
    { a: string; b: string; netAToB: Cents; billCount: number }
  >();

  for (const row of raw) {
    const [a, b] = row.debtorId < row.creditorId
      ? [row.debtorId, row.creditorId]
      : [row.creditorId, row.debtorId];

    const key = `${a}:${b}`;
    const entry = pairs.get(key) ?? { a, b, netAToB: 0, billCount: 0 };

    // Positive means a owes b.
    entry.netAToB += row.debtorId === a ? row.amountCents : -row.amountCents;
    entry.billCount += 1;
    pairs.set(key, entry);
  }

  const debts: Debt[] = [];

  for (const entry of pairs.values()) {
    if (entry.netAToB === 0) continue;

    const debtorId = entry.netAToB > 0 ? entry.a : entry.b;
    const creditorId = entry.netAToB > 0 ? entry.b : entry.a;

    debts.push({
      debtorId,
      debtorName: names.get(debtorId) ?? "Unknown",
      creditorId,
      creditorName: names.get(creditorId) ?? "Unknown",
      amountCents: Math.abs(entry.netAToB),
      billCount: entry.billCount,
    });
  }

  return debts.sort((x, y) => y.amountCents - x.amountCents);
}

export type PersonalBalance = {
  youOweCents: Cents;
  owedToYouCents: Cents;
  netCents: Cents;
  debts: Debt[];
};

/** The same figures, framed from one person's point of view. */
export function balanceFor(db: Db, userId: string): PersonalBalance {
  const mine = outstandingDebts(db).filter(
    (d) => d.debtorId === userId || d.creditorId === userId,
  );

  const youOweCents = mine
    .filter((d) => d.debtorId === userId)
    .reduce((acc, d) => acc + d.amountCents, 0);

  const owedToYouCents = mine
    .filter((d) => d.creditorId === userId)
    .reduce((acc, d) => acc + d.amountCents, 0);

  return {
    youOweCents,
    owedToYouCents,
    netCents: owedToYouCents - youOweCents,
    debts: mine,
  };
}

/**
 * Settle everything outstanding between two people, in one action.
 *
 * Both directions, not just the one the caller named as owing. The balances
 * page nets the pair down to a single figure and tells the user it has done
 * so, so settling has to leave them at zero — clearing only the leg the arrow
 * points at leaves the reverse leg alive, and it reappears immediately as a
 * debt running the other way. Somebody would hand over the netted amount and
 * the app would then claim they were owed money.
 *
 * A share carries no notion of a partial amount, so there is nothing to
 * apportion: every share between the two is settled, and the figure reported
 * is the net, because that is what actually changed hands.
 *
 * Still scoped to the pair. Shares involving anyone else are untouched.
 */
export function settleBetween(
  db: Db,
  input: { debtorId: string; creditorId: string; actorId: string },
): { count: number; totalCents: Cents } {
  return db.transaction((tx) => {
    const outstanding = tx
      .select({
        id: billShares.id,
        amountCents: billShares.amountCents,
        owedBy: billShares.userId,
      })
      .from(billShares)
      .innerJoin(bills, eq(billShares.billId, bills.id))
      .where(
        and(
          isNull(billShares.settledAt),
          isNull(bills.voidedAt),
          or(
            and(eq(billShares.userId, input.debtorId), eq(bills.paidBy, input.creditorId)),
            and(eq(billShares.userId, input.creditorId), eq(bills.paidBy, input.debtorId)),
          ),
        ),
      )
      .all();

    if (outstanding.length === 0) return { count: 0, totalCents: 0 };

    const now = new Date();
    for (const share of outstanding) {
      tx.update(billShares)
        .set({ settledAt: now, settledBy: input.actorId })
        .where(eq(billShares.id, share.id))
        .run();
    }

    const owedByDebtor = outstanding
      .filter((s) => s.owedBy === input.debtorId)
      .reduce((acc, s) => acc + s.amountCents, 0);

    const owedByCreditor = outstanding
      .filter((s) => s.owedBy === input.creditorId)
      .reduce((acc, s) => acc + s.amountCents, 0);

    const totalCents = Math.abs(owedByDebtor - owedByCreditor);

    tx.insert(auditLog)
      .values({
        id: newId(),
        actorId: input.actorId,
        action: "balance.settled_up",
        entityType: "user",
        entityId: input.debtorId,
        // Both gross figures as well as the net, so the entry is enough on its
        // own to reconstruct what was cleared in each direction.
        detail: JSON.stringify({
          creditorId: input.creditorId,
          count: outstanding.length,
          owedByDebtorCents: owedByDebtor,
          owedByCreditorCents: owedByCreditor,
          netCents: totalCents,
        }),
      })
      .run();

    return { count: outstanding.length, totalCents };
  });
}
