import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { describeDueDate, formatCalendarDate, formatTimestamp, todayIso } from "@/lib/dates";
import { formatAud } from "@/lib/money";
import { formatPayId } from "@/lib/payid";
import { getBill } from "@/server/bills";
import { ShareRow } from "./settle-controls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();

  const bill = getBill(db, id);
  if (!bill) notFound();

  // Payment details for anyone still owed money on this bill, so the person
  // who owes it can see where to send it without going hunting.
  const creditorIds = [bill.createdBy];
  const payees = await db
    .select({
      id: users.id,
      name: users.name,
      payId: users.payId,
      payIdType: users.payIdType,
      paymentNote: users.paymentNote,
    })
    .from(users)
    .where(inArray(users.id, creditorIds));

  const payee = payees[0];
  const payeeHint =
    payee && payee.payId && payee.payIdType
      ? `Pay ${payee.name}: ${formatPayId(payee.payIdType, payee.payId)}`
      : null;

  const today = todayIso();

  return (
    <>
      <div className="mb-4">
        <Link
          href="/"
          className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Back to bills
        </Link>
      </div>

      <PageHeader
        title={bill.description}
        description={`${formatCalendarDate(bill.issuedOn)}${
          bill.category ? ` · ${bill.category}` : ""
        } · added by ${bill.createdByName}`}
      />

      {bill.voidedAt && (
        <div className="mb-5">
          <Callout tone="danger">
            This bill was voided on {formatTimestamp(bill.voidedAt)}.
            {bill.voidReason && ` Reason: ${bill.voidReason}`}
          </Callout>
        </div>
      )}

      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-subtle">Total</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight text-ink" data-money>
              {formatAud(bill.totalCents)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-ink-subtle">Still owed</p>
            <p
              className={
                "mt-0.5 text-2xl font-semibold tracking-tight " +
                (bill.outstandingCents === 0 ? "text-ok" : "text-ink")
              }
              data-money
            >
              {formatAud(bill.outstandingCents)}
            </p>
          </div>
        </div>

        {bill.dueOn && (
          <p
            className={
              "mt-3 border-t border-line pt-3 text-sm " +
              (!bill.isSettled && bill.dueOn < today ? "text-danger" : "text-ink-muted")
            }
          >
            {bill.isSettled
              ? `Was due ${formatCalendarDate(bill.dueOn)}`
              : describeDueDate(bill.dueOn, today)}
          </p>
        )}

        {bill.notes && (
          <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-ink-muted">
            {bill.notes}
          </p>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Who owes what
        </h2>
        <ul>
          {bill.shares.map((share) => (
            <ShareRow
              key={share.id}
              billId={bill.id}
              isYou={share.userId === user.id}
              payIdHint={share.userId === user.id ? payeeHint : null}
              share={{
                id: share.id,
                name: share.name,
                amountCents: share.amountCents,
                settled: share.settledAt !== null,
                settledByName: share.settledByName,
                settledOn: share.settledAt ? formatTimestamp(share.settledAt) : null,
              }}
            />
          ))}
        </ul>
      </section>

      <p className="mt-4 text-xs text-ink-subtle">
        Either of you can mark a share paid, and either of you can undo it. Every change is
        recorded with who made it.
      </p>
    </>
  );
}
