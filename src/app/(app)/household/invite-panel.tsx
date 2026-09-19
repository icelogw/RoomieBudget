"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { inviteHousemate, type HouseholdState } from "./actions";

const INITIAL: HouseholdState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating invite…" : "Create invite"}
    </Button>
  );
}

/**
 * The link is shown once and cannot be retrieved, so copying it is the primary
 * action rather than an afterthought.
 */
export function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context, which includes
      // plain HTTP on the LAN. Selecting the text still works, so say nothing
      // and let them copy it by hand.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-md border border-ok/30 bg-ok-soft p-3">
      <p className="text-xs font-medium text-ok">
        Send this link to them. It works once and expires in 7 days.
      </p>

      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 text-xs text-ink"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        It will not be shown again. If you lose it, generate a new one below.
      </p>
    </div>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteHousemate, INITIAL);

  return (
    <div className="space-y-3">
      {state.message && <Callout tone="danger">{state.message}</Callout>}
      {state.inviteLink && <InviteLink link={state.inviteLink} />}

      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Their name"
            name="name"
            autoComplete="off"
            required
            error={state.fieldErrors?.name}
          />
          <TextField
            label="Their email"
            name="email"
            type="email"
            autoComplete="off"
            required
            error={state.fieldErrors?.email}
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-ink">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="member"
            className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink sm:w-56"
          >
            <option value="member">Member — can add and settle bills</option>
            <option value="admin">Admin — can also manage the household</option>
          </select>
        </div>

        <Submit />
      </form>
    </div>
  );
}
