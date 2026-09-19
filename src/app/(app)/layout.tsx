import { redirect } from "next/navigation";
import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";

// Reads the session cookie and the User-Agent, so nothing here is static.
export const dynamic = "force-dynamic";

/**
 * Every signed-in page sits under this layout, so the authentication check
 * happens once and cannot be forgotten on a new page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ value: householdSize }] = await getDb().select({ value: count() }).from(users);
  if (householdSize === 0) redirect("/setup");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
