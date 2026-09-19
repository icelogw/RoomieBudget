import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthShell } from "@/components/ui";
import { APP_NAME } from "@/lib/app";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const db = getDb();
  const [{ value: householdSize }] = await db.select({ value: count() }).from(users);

  // Once anyone exists this page is permanently closed, or it would be a way
  // to mint a second admin from outside.
  if (householdSize > 0) redirect("/login");

  return (
    <AuthShell
      title={`Set up ${APP_NAME}`}
      intro="This first account is the household admin. You can invite everyone else once you are in."
    >
      <SetupForm />
    </AuthShell>
  );
}
