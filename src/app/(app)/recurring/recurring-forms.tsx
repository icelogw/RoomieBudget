"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { FREQUENCIES } from "@/lib/recurrence";
import { addSeries, removeSeries, toggleSeries, type RecurringState } from "./actions";

const INITIAL: RecurringState = {};

export type Housemate = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Create recurring bill"}
    </Button>
  );
}

export function SeriesForm({
  housemates,
  currentUserId,
  today,
}: {
  housemates: Housemate[];
  currentUserId: string;
  today: string;
}) {
  const [state, action] = useActionState(addSeries, INITIAL);

  const [amountMode, setAmountMode] = useState<"fixed" | "prompt">("fixed");
  const [splitMode, setSplitMode] = useState<"even" | "weights" | "single">("even");
  const [selected, setSelected] = useState<string[]>(housemates.map((h) => h.id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={action} className="space-y-4">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <TextField
        label="What is it for?"
        name="description"
        placeholder="Rent"
        required
        error={state.fieldErrors?.description}
      />

      <div>
        <span className="block text-sm font-medium text-ink">Amount</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              { value: "fixed", label: "Same every time" },
              { value: "prompt", label: "Varies — ask me" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAmountMode(option.value)}
              aria-pressed={amountMode === option.value}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (amountMode === option.value
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line-strong text-ink-muted hover:bg-surface-sunken hover:text-ink")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="amountMode" value={amountMode} />

        {amountMode === "fixed" ? (
          <div className="mt-3">
            <TextField
              label="How much"
              name="total"
              inputMode="decimal"
              placeholder="620.00"
              required
              error={state.fieldErrors?.total}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-subtle">
            A bill will appear on schedule with no amount, waiting for you to fill it in.
            Use this for power or water, where the figure changes every time.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="frequency" className="block text-sm font-medium text-ink">
            How often
          </label>
          <select
            id="frequency"
            name="frequency"
            defaultValue="monthly"
            className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="Starting from"
          name="anchorDate"
          type="date"
          defaultValue={today}
          hint="Also sets which day of the month it lands on."
          error={state.fieldErrors?.anchorDate}
        />
      </div>

      <TextField
        label="Days to pay"
        name="dueOffsetDays"
        type="number"
        min={0}
        max={90}
        defaultValue={14}
        hint="How long after it is issued the bill falls due."
        error={state.fieldErrors?.dueOffsetDays}
      />

      <div>
        <label htmlFor="paidBy" className="block text-sm font-medium text-ink">
          Who pays it
        </label>
        <select
          id="paidBy"
          name="paidBy"
          defaultValue={currentUserId}
          className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
        >
          {housemates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.id === currentUserId ? " (you)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="block text-sm font-medium text-ink">Split</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              { value: "even", label: "Evenly" },
              { value: "weights", label: "By share" },
              { value: "single", label: "One person" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSplitMode(option.value)}
              aria-pressed={splitMode === option.value}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (splitMode === option.value
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line-strong text-ink-muted hover:bg-surface-sunken hover:text-ink")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="splitMode" value={splitMode} />

        {splitMode === "weights" && (
          <p className="mt-2 text-xs text-ink-subtle">
            Whole numbers in proportion — 2 and 1 means one person pays two thirds.
          </p>
        )}

        <ul className="mt-3 space-y-1.5">
          {housemates.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
            >
              <input
                type="checkbox"
                id={`rp-${person.id}`}
                name="participant"
                value={person.id}
                checked={selected.includes(person.id)}
                onChange={() => toggle(person.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <label htmlFor={`rp-${person.id}`} className="flex-1 truncate text-sm text-ink">
                {person.name}
                {person.id === currentUserId && (
                  <span className="ml-1.5 text-xs text-ink-subtle">(you)</span>
                )}
              </label>

              {splitMode === "weights" && selected.includes(person.id) && (
                <input
                  name={`weight:${person.id}`}
                  type="number"
                  min={0}
                  defaultValue={1}
                  aria-label={`${person.name} share`}
                  className="h-8 w-20 rounded border border-line-strong bg-surface px-2 text-right text-sm text-ink"
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      <Submit />
    </form>
  );
}

export function SeriesRow({
  item,
}: {
  item: {
    id: string;
    description: string;
    detail: string;
    nextLabel: string;
    isActive: boolean;
  };
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
      </div>

      {error && (
        <div className="mt-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
    </li>
  );
}
