import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell, Callout } from "@/components/ui";
import { APP_NAME } from "@/lib/app";
import { AcceptForm } from "./accept-form";
import { lookupInvite } from "./lookup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Join the household" };

const PROBLEMS = {
  unknown: "This invite link is not valid.",
  expired: "This invite link has expired.",
  used: "This invite has already been used.",
} as const;

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = lookupInvite(token);

  if (!invite.ok) {
    return (
      <AuthShell title="That link will not work">
        <div className="space-y-4">
          <Callout tone="danger">{PROBLEMS[invite.reason]}</Callout>
          <p className="text-sm leading-relaxed text-ink-muted">
            Ask whoever invited you to send a new one. Links last seven days and can only
            be used once.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-accent underline underline-offset-4"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${APP_NAME}`}
      intro={`${invite.name}, you have been invited to share bills with the household. Pick a password and you are in.`}
    >
      <AcceptForm token={token} email={invite.email} />
    </AuthShell>
  );
}
