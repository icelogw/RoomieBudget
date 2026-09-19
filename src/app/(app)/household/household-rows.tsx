"use client";

import { useActionState } from "react";

import { Callout } from "@/components/ui";
import { InviteLink } from "./invite-panel";
import {
  regenerateInvite,
  revokeInvite,
  setMemberActive,
  type HouseholdState,
} from "./actions";

const INITIAL: HouseholdState = {};

const ROW_BUTTON =
  "rounded px-2 py-1 text-xs font-medium text-ink-muted transition-colors " +
  "hover:bg-surface-sunken hover:text-ink disabled:opacity-50";

export function PendingInviteRow({
  invite,
}: {
  invite: { id: string; name: string; email: string; role: string; expiresAt: string };
}) {
  const [regenState, regenAction, regenPending] = useActionState(regenerateInvite, INITIAL);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeInvite, INITIAL);

  const error = regenState.message ?? revokeState.message;

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{invite.name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {invite.email} · invited as {invite.role} · expires {invite.expiresAt}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <form action={regenAction}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <button type="submit" className={ROW_BUTTON} disabled={regenPending}>
              {regenPending ? "Working…" : "New link"}
            </button>
          </form>

          <form action={revokeAction}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <button
              type="submit"
              className={`${ROW_BUTTON} hover:text-danger`}
              disabled={revokePending}
            >
              {revokePending ? "Working…" : "Revoke"}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div className="mt-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      {regenState.inviteLink && (
        <div className="mt-2">
          <InviteLink link={regenState.inviteLink} />
        </div>
      )}
    </li>
  );
}

export function MemberRow({
  member,
  isSelf,
  canManage,
}: {
  member: { id: string; name: string; email: string; role: string; isActive: boolean };
  isSelf: boolean;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(setMemberActive, INITIAL);

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {member.name}
            {isSelf && <span className="ml-1.5 text-xs text-ink-subtle">(you)</span>}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            {member.email} · {member.role}
            {!member.isActive && " · deactivated"}
          </p>
        </div>

        {canManage && !isSelf && (
          <form action={action} className="shrink-0">
            <input type="hidden" name="userId" value={member.id} />
            <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
            <button
              type="submit"
              className={`${ROW_BUTTON} ${member.isActive ? "hover:text-danger" : "hover:text-ok"}`}
              disabled={pending}
            >
              {pending ? "Working…" : member.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </form>
        )}
      </div>

      {state.message && (
        <div className="mt-2">
          <Callout tone="danger">{state.message}</Callout>
        </div>
      )}
      {state.notice && (
        <div className="mt-2">
          <Callout tone="ok">{state.notice}</Callout>
        </div>
      )}
    </li>
  );
}
