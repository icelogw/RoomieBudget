import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Balances" };

export default async function BalancesPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Balances"
        description="What everyone owes once all the outstanding bills are netted off."
      />
      <Callout>
        Nothing to balance yet. This fills in once there are bills to settle.
      </Callout>
    </>
  );
}
