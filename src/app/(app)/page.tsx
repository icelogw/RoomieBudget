import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell";
import { Callout } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Bills" };

export default async function BillsPage() {
  const user = await requireUser();
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title="Bills"
        description="Everything the household owes, and what each person still has to pay."
      />

      <Callout>
        Nothing here yet, {firstName}. Adding a bill, splitting it and settling up are next.
      </Callout>
    </>
  );
}
