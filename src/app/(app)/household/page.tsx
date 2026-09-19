import type { Metadata } from "next";
import Link from "next/link";
import { asc, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { invites, users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { describeDueDate, formatCalendarDate, todayIso } from "@/lib/dates";
import { formatAud } from "@/lib/money";
import { describeFrequency } from "@/lib/recurrence";
import { listSeries } from "@/server/recurring";
import { InviteForm } from "./invite-panel";
import { MemberRow, PendingInviteRow } from "./household-rows";
import { SeriesRow } from "./recurring-rows";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Household" };

/** Invites store an expiry instant; the list shows it as a calendar date. */
function expiryAsCalendarDate(expiresAt: Date): string {
  return expiresAt.toLocaleDateString("en-CA");
}

export default async function HouseholdPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const db = getDb();

  const members = await db.select().from(users).orderBy(asc(users.name));

  // Recurring bills are a household arrangement rather than a personal one,
  // so they live here alongside who lives here. Anyone can pause or stop one.
  const series = listSeries(db);
  const today = todayIso();

  // Only admins ever see pending invites — the email addresses of people who
  // have not joined yet are not everyone's business.
  const pending = isAdmin
    ? await db.select().from(invites).where(isNull(invites.acceptedAt)).orderBy(asc(invites.createdAt))
    : [];

  return (
    <>
      <PageHeader
        title="Household"
        description={
          isAdmin ? "Who lives here, and who has been invited." : "Who lives here."
        }
        action={
          isAdmin ? (
            <Link
              href="/household/settings"
              className="inline-flex h-10 shrink-0 items-center rounded-md border border-line-strong px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              House settings
            </Link>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Housemates
        </h2>
        <ul>
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={{
                id: member.id,
                name: member.name,
                email: member.email,
                role: member.role,
                isActive: member.isActive,
              }}
              isSelf={member.id === user.id}
              canManage={isAdmin}
            />
          ))}
        </ul>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
          Recurring bills
        </h2>

        {series.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-subtle">
            Nothing repeats yet. Add a bill and tick{" "}
            <span className="font-medium text-ink-muted">This bill repeats</span> to set one
            up.
          </p>
        ) : (
          <ul>
            {series.map((item) => {
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
        )}
      </section>

      {isAdmin && (
        <>
          {pending.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                Waiting to join
              </h2>
              <ul>
                {pending.map((invite) => (
                  <PendingInviteRow
                    key={invite.id}
                    invite={{
                      id: invite.id,
                      name: invite.name,
                      email: invite.email,
                      role: invite.role,
                      expiresAt: formatCalendarDate(expiryAsCalendarDate(invite.expiresAt)),
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Invite a housemate</h2>
            <p className="mb-4 mt-1 text-sm text-ink-muted">
              You will get a link to send them. Email delivery is not wired up yet, so
              pass it on however you like.
            </p>
            <InviteForm />
          </section>
        </>
      )}

      {!isAdmin && (
        <div className="mt-6">
          <Callout>Only an admin can invite or remove housemates.</Callout>
        </div>
      )}
    </>
  );
}
