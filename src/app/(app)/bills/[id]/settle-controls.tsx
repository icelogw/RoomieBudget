"use client";

import { useActionState } from "react";

import { Callout } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { formatAud } from "@/lib/money";
import { toggleShareSettled, type BillFormState } from "../actions";

const INITIAL: BillFormState = {};

export function ShareRow({
  share,
  billId,
  isYou,
  payIdHint,
}: {
  share: {
    id: string;
    name: string;
    amountCents: number;
    settled: boolean;
    settledByName: string | null;
    settledOn: string | null;
  };
  billId: string;
  isYou: boolean;
  payIdHint: string | null;
}) {
  const [state, action, pending] = useActionState(toggleShareSettled, INITIAL);

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">
            {share.name}
            {isYou && <span className="ml-1.5 text-xs text-ink-subtle">(you)</span>}
          </p>

          {share.settled ? (
            <p className="mt-0.5 text-xs text-ok">
              Paid{share.settledByName ? ` · marked by ${share.settledByName}` : ""}
              {share.settledOn ? ` on ${share.settledOn}` : ""}
            </p>
          ) : (
            payIdHint && <p className="mt-0.5 truncate text-xs text-ink-subtle">{payIdHint}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={"text-sm font-medium " + (share.settled ? "text-ink-subtle line-through" : "text-ink")}
            data-money
          >
            {formatAud(share.amountCents)}
          </span>

          <form action={action}>
            <input type="hidden" name="shareId" value={share.id} />
            <input type="hidden" name="billId" value={billId} />
            <input type="hidden" name="settled" value={share.settled ? "false" : "true"} />
            <button
              type="submit"
              disabled={pending}
              className={
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                (share.settled
                  ? "border-line-strong text-ink-muted hover:bg-surface-sunken"
                  : "border-ok/40 bg-ok-soft text-ok hover:border-ok")
              }
            >
              {!share.settled && <CheckIcon className="h-3.5 w-3.5" />}
              {pending ? "Saving…" : share.settled ? "Undo" : "Mark paid"}
            </button>
          </form>
        </div>
      </div>

      {state.message && (
        <div className="mt-2">
          <Callout tone="danger">{state.message}</Callout>
        </div>
      )}
    </li>
  );
}
