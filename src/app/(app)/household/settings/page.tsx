import type { Metadata } from "next";
import Link from "next/link";

import { getDb } from "@/db";
import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-user";
import { householdName, listCategories } from "@/server/household";
import { AddCategoryForm, CategoryRow, HouseholdNameForm } from "./settings-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "House settings" };

export default async function HouseSettingsPage() {
  // Settings change what every housemate sees, so they are an admin's to set.
  await requireAdmin();

  const db = getDb();
  const categories = listCategories(db);

  return (
    <>
      <PageHeader
        title="House settings"
        description="Things that apply to the whole household."
        action={
          <Link
            href="/household"
            className="shrink-0 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Back to household
          </Link>
        }
      />

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Name</h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">
          What to call this household. Useful once you have lived in more than one.
        </p>
        <HouseholdNameForm current={householdName(db)} />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="border-b border-line bg-surface-sunken px-4 py-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
            Bill categories
          </h2>
        </div>

        {categories.length === 0 ? (
          <div className="p-4">
            <Callout>
              No categories yet. Add a few and they will appear in the dropdown when entering
              a bill.
            </Callout>
          </div>
        ) : (
          <ul>
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

        <div className="border-t border-line p-4">
          <AddCategoryForm />
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            These fill the category dropdown when adding a bill. Renaming or removing one
            only changes the dropdown — bills already filed under the old name keep it, so
            your history stays as it actually happened.
          </p>
        </div>
      </section>
    </>
  );
}
