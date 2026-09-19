import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { Button } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { APP_NAME, APP_TAGLINE } from "@/lib/app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();
  const [{ value: householdSize }] = await db.select({ value: count() }).from(users);

  if (householdSize === 0) redirect("/setup");

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xs font-medium uppercase tracking-[0.14em] text-ink-subtle">
            {APP_TAGLINE}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{APP_NAME}</h1>
        </div>

        <form action={signOut}>
          <Button variant="ghost" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      <div className="mt-8 rounded-lg border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">Signed in as {currentUser.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {currentUser.role === "admin"
            ? "You are the household admin, so you can invite housemates and manage the household."
            : "You are a member of this household."}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5 text-sm">
          <dt className="text-ink-subtle">Email</dt>
          <dd className="text-ink">{currentUser.email}</dd>
          <dt className="text-ink-subtle">Household</dt>
          <dd className="text-ink">
            {householdSize} {householdSize === 1 ? "person" : "people"}
          </dd>
        </dl>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-line p-6">
        <h2 className="text-base font-semibold text-ink">Not built yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Bills, balances, settle-up and recurring charges come next. Inviting housemates
          lands with them.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-accent underline underline-offset-4"
        >
          Sign-in page
        </Link>
      </div>
    </main>
  );
}
