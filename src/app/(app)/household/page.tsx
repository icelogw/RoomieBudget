import type { Metadata } from "next";
import { asc, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { invites, users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { formatCalendarDate } from "@/lib/dates";
import { InviteForm } from "./invite-panel";
import { MemberRow, PendingInviteRow } from "./household-rows";

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
          isAdmin
            ? "Who lives here, and who has been invited."
            : "Who lives here."
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
