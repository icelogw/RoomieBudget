"use client";

import { useActionState } from "react";

import { Callout } from "@/components/ui";
import { removeSeries, toggleSeries, type RecurringState } from "./recurring-actions";

const INITIAL: RecurringState = {};

export function SeriesRow({
  item,
  canManage,
}: {
  item: {
    id: string;
    description: string;
    detail: string;
    nextLabel: string;
    isActive: boolean;
  };
  /** Rendering only. The action checks again, since it is reachable anyway. */
  canManage: boolean;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleSeries, INITIAL);
  const [removeState, removeAction, removePending] = useActionState(removeSeries, INITIAL);

  const error = toggleState.message ?? removeState.message;

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {item.description}
            {!item.isActive && <span className="ml-2 text-xs text-ink-subtle">paused</span>}
          </p>
          <p className="truncate text-xs text-ink-subtle">{item.detail}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{item.nextLabel}</p>
        </div>

        {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <form action={toggleAction}>
            <input type="hidden" name="seriesId" value={item.id} />
            <input type="hidden" name="active" value={item.isActive ? "false" : "true"} />
            <button
              type="submit"
              disabled={togglePending}
              className="rounded px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
            >
              {togglePending ? "Working…" : item.isActive ? "Pause" : "Resume"}
            </button>
          </form>

          <form action={removeAction}>
            <input type="hidden" name="seriesId" value={item.id} />
            <button
              type="submit"
              disabled={removePending}
              className="rounded px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-danger disabled:opacity-50"
            >
              {removePending ? "Working…" : "Delete"}
            </button>
          </form>
        </div>
        )}
      </div>

      {error && (
        <div className="mt-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
    </li>
  );
}
