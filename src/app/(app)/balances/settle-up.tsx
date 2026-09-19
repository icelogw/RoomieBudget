"use client";

import { useActionState } from "react";

import { Callout } from "@/components/ui";
import { formatAud } from "@/lib/money";
import { settleUp, type SettleState } from "./actions";

const INITIAL: SettleState = {};

export function DebtRow({
  debt,
  viewerId,
  payHint,
}: {
  debt: {
    debtorId: string;
    debtorName: string;
    creditorId: string;
    creditorName: string;
    amountCents: number;
    billCount: number;
  };
  viewerId: string;
  payHint: string | null;
}) {
  const [state, action, pending] = useActionState(settleUp, INITIAL);

  const youOwe = debt.debtorId === viewerId;

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink">
            {youOwe ? (
              <>
                You owe <span className="font-medium">{debt.creditorName}</span>
              </>
            ) : (
              <>
                <span className="font-medium">{debt.debtorName}</span> owes you
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            Netted across {debt.billCount} {debt.billCount === 1 ? "bill" : "bills"}
          </p>
          {youOwe && payHint && (
            <p className="mt-1.5 truncate text-xs text-ink-muted">{payHint}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p
            className={
              "text-xl font-semibold tracking-tight " + (youOwe ? "text-danger" : "text-ok")
            }
            data-money
          >
            {formatAud(debt.amountCents)}
          </p>

          <form action={action} className="mt-2">
            <input type="hidden" name="debtorId" value={debt.debtorId} />
            <input type="hidden" name="creditorId" value={debt.creditorId} />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50"
            >
              {pending ? "Settling…" : youOwe ? "Mark as paid" : "Mark as received"}
            </button>
          </form>
        </div>
      </div>

      {state.message && (
        <div className="mt-3">
          <Callout tone="danger">{state.message}</Callout>
        </div>
      )}
      {state.notice && (
        <div className="mt-3">
          <Callout tone="ok">{state.notice}</Callout>
        </div>
      )}
    </li>
  );
}
