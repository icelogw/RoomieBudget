import type { Metadata } from "next";
import { asc, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { invites, users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { Callout, Disclosure } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { householdName, listCategories } from "@/server/household";
import { formatCalendarDate } from "@/lib/dates";
import { InviteForm } from "./invite-panel";
import { MemberRow, PendingInviteRow } from "./household-rows";
import { AddCategoryForm, CategoryRow, HouseholdNameForm } from "./settings-forms";

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
  const categories = isAdmin ? listCategories(db) : [];

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
              They will get a link by email if mail is set up, and it is shown here either
              way so you can pass it on yourself.
            </p>
            <InviteForm />
          </section>

          {/* Collapsed by default: set once, then rarely touched. */}
          <div className="mt-6">
            <Disclosure
              title="House settings"
              description="The household's name, and the categories offered when adding a bill."
            >
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-ink">Name</h3>
                  <HouseholdNameForm current={householdName(db)} />
                </div>

                <div className="border-t border-line pt-5">
                  <h3 className="text-sm font-semibold text-ink">Bill categories</h3>
                  <p className="mb-3 mt-1 text-xs leading-relaxed text-ink-subtle">
                    Renaming or removing one only changes the dropdown. Bills already filed
                    under the old name keep it, so your history stays as it happened.
                  </p>

                  {categories.length > 0 && (
                    <ul className="mb-3 overflow-hidden rounded-md border border-line">
                      {categories.map((category, index) => (
                        <CategoryRow
                          key={category.id}
                          category={category}
                          isFirst={index === 0}
                          isLast={index === categories.length - 1}
                        />
                      ))}
                    </ul>
                  )}

                  <AddCategoryForm />
                </div>
              </div>
            </Disclosure>
          </div>
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
