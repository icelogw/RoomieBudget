import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/current-user";
import { todayIso } from "@/lib/dates";
import { BillForm } from "./bill-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Add a bill" };

export default async function NewBillPage() {
  const user = await requireUser();

  // Only people who still live here can be put on a new bill. Past bills keep
  // whoever was on them at the time.
  const housemates = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));

  return (
    <>
      <PageHeader title="Add a bill" description="Enter what it cost and how it is divided." />
      <BillForm housemates={housemates} currentUserId={user.id} today={todayIso()} />
    </>
  );
}
