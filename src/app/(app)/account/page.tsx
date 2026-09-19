import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current-user";
import { PasswordForm, PaymentForm } from "./account-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-lg border border-line bg-surface p-4 first:mt-0">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && <p className="mb-4 mt-1 text-sm text-ink-muted">{description}</p>}
      {children}
    </section>
  );
}

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Account" description="Your details and how housemates pay you back." />

      <Section title="You">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-subtle">Name</dt>
          <dd className="text-ink">{user.name}</dd>
          <dt className="text-ink-subtle">Email</dt>
          <dd className="text-ink">{user.email}</dd>
          <dt className="text-ink-subtle">Role</dt>
          <dd className="text-ink">{user.role === "admin" ? "Admin" : "Member"}</dd>
        </dl>
      </Section>

      <Section
        title="How you get paid back"
        description="Shown to housemates when they owe you. The app never moves money — it only shows them where to send it."
      >
        <PaymentForm
          payIdType={user.payIdType ?? "email"}
          payId={user.payId ?? ""}
          paymentNote={user.paymentNote ?? ""}
        />
      </Section>

      <Section title="Password">
        <PasswordForm />
      </Section>

      <Section title="Sign out">
        <form action={signOut}>
          <Button variant="secondary" type="submit">
            Sign out
          </Button>
        </form>
      </Section>
    </>
  );
}
