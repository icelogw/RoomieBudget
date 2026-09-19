import type { Metadata } from "next";
import Link from "next/link";

import { getDb } from "@/db";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { describeDueDate, formatCalendarDate, todayIso } from "@/lib/dates";
import { formatAud } from "@/lib/money";
import { describeFrequency } from "@/lib/recurrence";
import { listSeries } from "@/server/recurring";
import { SeriesRow } from "./recurring-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recurring" };

export default async function RecurringPage() {
  await requireUser();
  const db = getDb();
  const today = todayIso();

  const all = listSeries(db);

  return (
    <>
      <PageHeader
        title="Recurring bills"
        description="Bills that repeat. Each one is issued automatically on the day it is due."
        action={
          <Link
            href="/bills/new"
            className="inline-flex h-10 shrink-0 items-center rounded-md border border-line-strong px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            Add bill
          </Link>
        }
      />

      {all.length === 0 ? (
        <Callout>
          Nothing repeats yet. Add a bill and tick{" "}
          <span className="font-medium">This bill repeats</span> — rent, internet and power
          are the usual candidates.
        </Callout>
      ) : (
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
            Set up
          </h2>
          <ul>
            {all.map((item) => {
              const amount =
                item.amountMode === "prompt"
                  ? "amount varies"
                  : formatAud(item.totalCents ?? 0);

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
        </section>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
        Set one up from{" "}
        <Link href="/bills/new" className="text-accent underline underline-offset-4">
          Add bill
        </Link>{" "}
        by ticking &ldquo;This bill repeats&rdquo;. Pausing holds a series without deleting
        it; deleting leaves the bills it already issued untouched.
      </p>
    </>
  );
}
