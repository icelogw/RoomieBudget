import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AuthShell } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in: no reason to show a login form.
  if (await getCurrentUser()) redirect("/");

  // A brand new install has nobody to sign in as, so send them to setup
  // rather than to a form that cannot succeed.
  const [{ value: householdSize }] = await getDb().select({ value: count() }).from(users);
  if (householdSize === 0) redirect("/setup");

  return (
    <AuthShell title="Sign in" intro="Welcome back.">
      <LoginForm />
    </AuthShell>
  );
}
