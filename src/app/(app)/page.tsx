import type { Metadata } from "next";
import Link from "next/link";

import { getDb } from "@/db";
import { PageHeader } from "@/components/app-shell";
import { PlusIcon } from "@/components/icons";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { describeDueDate, formatCalendarDate, todayIso } from "@/lib/dates";
import { formatAud } from "@/lib/money";
import { describeFrequency } from "@/lib/recurrence";
import { listBills, type BillDetail } from "@/server/bills";
import { listSeries } from "@/server/recurring";
import { SeriesRow } from "./bills/recurring-rows";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bills" };

function StatusPill({ bill, today }: { bill: BillDetail; today: string }) {
  if (bill.isDraft) {
    return (
      <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-2xs font-medium text-warn">
        Needs an amount
      </span>
    );
  }

  if (bill.isSettled) {
    return (
      <span className="shrink-0 rounded-full bg-ok-soft px-2 py-0.5 text-2xs font-medium text-ok">
        Settled
      </span>
    );
  }

  const overdue = bill.dueOn !== null && bill.dueOn < today;

  return (
    <span
      className={
        "shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium " +
        (overdue ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")
      }
    >
      {bill.dueOn ? describeDueDate(bill.dueOn, today) : "Outstanding"}
    </span>
  );
}

export default async function BillsPage() {
  const user = await requireUser();
  const today = todayIso();
  const db = getDb();
  const bills = listBills(db);
  const series = listSeries(db);

  const yourOutstanding = bills
    .flatMap((b) => b.shares)
    .filter((s) => s.userId === user.id && s.settledAt === null)
    .reduce((acc, s) => acc + s.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Bills"
        description="Everything the household owes, newest first."
        action={
          <Link
            href="/bills/new"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" />
            Add bill
          </Link>
        }
      />

      {yourOutstanding > 0 && (
        <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-sm text-ink-muted">
            You owe{" "}
            <span className="font-semibold text-ink" data-money>
              {formatAud(yourOutstanding)}
            </span>{" "}
            across {bills.filter((b) => b.shares.some((s) => s.userId === user.id && !s.settledAt)).length}{" "}
            bills.
          </p>
        </div>
      )}

      {bills.length === 0 ? (
        <Callout>
          No bills yet. Add the first one and it will show up here with everyone&apos;s share.
        </Callout>
      ) : (
        <ul className="space-y-2">
          {bills.map((bill) => {
            const yours = bill.shares.find((s) => s.userId === user.id);

            return (
              <li key={bill.id}>
                <Link
                  href={`/bills/${bill.id}`}
                  className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        <span className="truncate">{bill.description}</span>
                        {bill.seriesId && (
                          <span className="shrink-0 rounded border border-line-strong px-1.5 py-px text-2xs font-normal text-ink-subtle">
                            Repeating
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        {formatCalendarDate(bill.issuedOn)}
                        {bill.category && ` · ${bill.category}`}
                        {` · added by ${bill.createdByName}`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink" data-money>
                        {formatAud(bill.totalCents)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        {bill.shares.length} {bill.shares.length === 1 ? "person" : "people"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <StatusPill bill={bill} today={today} />

                    {yours && (
                      <p className="text-xs text-ink-muted">
                        Your share{" "}
                        <span
                          className={
                            "font-medium " + (yours.settledAt ? "text-ok" : "text-ink")
                          }
                          data-money
                        >
                          {formatAud(yours.amountCents)}
                        </span>
                        {yours.settledAt && " · paid"}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8 overflow-hidden rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Recurring
        </h2>

        {series.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-subtle">
            Nothing repeats yet. Tick{" "}
            <span className="font-medium text-ink-muted">This bill repeats</span> when adding
            a bill to set one up.
          </p>
        ) : (
          <ul>
            {series.map((item) => {
              const amount =
                item.amountMode === "prompt" ? "amount varies" : formatAud(item.totalCents ?? 0);

              const people =
                item.participantNames.length > 2
                  ? `${item.participantNames.length} people`
                  : item.participantNames.join(" and ");

              return (
                <SeriesRow
                  key={item.id}
                  item={{
                    id: item.id,
                    description: item.description,
                    detail: `${describeFrequency(item.frequency)} · ${amount} · ${people} · paid by ${item.paidByName}`,
                    nextLabel: item.isActive
                      ? `Next on ${formatCalendarDate(item.nextIssueOn)} — ${describeDueDate(
                          item.nextIssueOn,
                          today,
                        ).replace(/^Due /, "")}`
                      : "Paused — nothing will be issued",
                    isActive: item.isActive,
                  }}
                />
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
