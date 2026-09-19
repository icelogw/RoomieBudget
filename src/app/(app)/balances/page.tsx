import type { Metadata } from "next";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { formatAud } from "@/lib/money";
import { formatPayId } from "@/lib/payid";
import { balanceFor } from "@/server/balances";
import { DebtRow } from "./settle-up";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Balances" };

export default async function BalancesPage() {
  const user = await requireUser();
  const db = getDb();

  const balance = balanceFor(db, user.id);

  // Payment details for everyone this person owes, so "how do I pay them?"
  // is answered on the same screen as "how much?".
  const creditorIds = balance.debts
    .filter((d) => d.debtorId === user.id)
    .map((d) => d.creditorId);

  const payees =
    creditorIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            payId: users.payId,
            payIdType: users.payIdType,
            paymentNote: users.paymentNote,
          })
          .from(users)
          .where(inArray(users.id, creditorIds))
      : [];

  const hintFor = new Map(
    payees.map((p) => {
      const parts: string[] = [];
      if (p.payId && p.payIdType) parts.push(`PayID ${formatPayId(p.payIdType, p.payId)}`);
      if (p.paymentNote) parts.push(p.paymentNote);
      return [p.id, parts.length > 0 ? parts.join(" · ") : null] as const;
    }),
  );

  const settled = balance.debts.length === 0;

  return (
    <>
      <PageHeader
        title="Balances"
        description="Everything outstanding, netted down to one figure per person."
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-ink-subtle">You owe</p>
          <p
            className={
              "mt-1 text-2xl font-semibold tracking-tight " +
              (balance.youOweCents > 0 ? "text-danger" : "text-ink-subtle")
            }
            data-money
          >
            {formatAud(balance.youOweCents)}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Owed to you</p>
          <p
            className={
              "mt-1 text-2xl font-semibold tracking-tight " +
              (balance.owedToYouCents > 0 ? "text-ok" : "text-ink-subtle")
            }
            data-money
          >
            {formatAud(balance.owedToYouCents)}
          </p>
        </div>
      </section>

      {settled ? (
        <Callout tone="ok">
          Everyone is square. Nothing is outstanding between anyone in the household.
        </Callout>
      ) : (
        <ul className="space-y-3">
          {balance.debts.map((debt) => (
            <DebtRow
              key={`${debt.debtorId}:${debt.creditorId}`}
              debt={debt}
              viewerId={user.id}
              payHint={hintFor.get(debt.creditorId) ?? null}
            />
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
        Debts that run both ways are cancelled off before anything is shown, so you only
        ever see the difference. Marking a balance settled clears every bill behind it, and
        is recorded against whoever did it.
      </p>
    </>
  );
}
