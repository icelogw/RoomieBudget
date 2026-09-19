import Link from "next/link";
import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { APP_NAME, APP_TAGLINE } from "@/lib/app";

// Reads the database and the session cookie, so there is nothing to prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();
  const [{ value: householdSize }] = await db.select({ value: count() }).from(users);
  const currentUser = await getCurrentUser();

  const isFirstRun = householdSize === 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-2xs font-medium uppercase tracking-[0.14em] text-ink-subtle">
        {APP_TAGLINE}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{APP_NAME}</h1>

      <div className="mt-8 rounded-lg border border-line bg-surface p-6">
        {isFirstRun ? (
          <>
            <h2 className="text-base font-semibold text-ink">Nobody lives here yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Create the first account to set up the household. That account becomes the
              admin and can invite everyone else.
            </p>
            <Link
              href="/setup"
              className="mt-5 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Set up the household
            </Link>
          </>
        ) : currentUser ? (
          <>
            <h2 className="text-base font-semibold text-ink">
              Signed in as {currentUser.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              The dashboard is not built yet. Bills, balances and settle-up land next.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-ink">Welcome back</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {householdSize === 1
                ? "One account in this household."
                : `${householdSize} accounts in this household.`}
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Sign in
            </Link>
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-subtle" data-money>
        Amounts are shown in AUD. Dates follow DD/MM/YYYY.
      </p>
    </main>
  );
}
