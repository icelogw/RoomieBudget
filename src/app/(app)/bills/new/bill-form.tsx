"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatAud, parseAmount } from "@/lib/money";
import { computeShares, parsePercent, type Split } from "@/lib/split";
import { addBill, type BillFormState } from "../actions";

export type Housemate = { id: string; name: string };

type Mode = "even" | "amount" | "percent" | "single";

const MODES: Array<{ value: Mode; label: string; help: string }> = [
  { value: "even", label: "Evenly", help: "Split equally between everyone selected." },
  { value: "amount", label: "By amount", help: "Type what each person owes. Must add up to the total." },
  { value: "percent", label: "By percent", help: "Type each share as a percentage. Must add up to 100%." },
  { value: "single", label: "One person", help: "One person owes the whole thing." },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add bill"}
    </Button>
  );
}

export function BillForm({
  housemates,
  currentUserId,
  today,
}: {
  housemates: Housemate[];
  currentUserId: string;
  today: string;
}) {
  const [state, action] = useActionState(addBill, EMPTY_FORM_STATE as BillFormState);

  const [mode, setMode] = useState<Mode>("even");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [total, setTotal] = useState("");
  const [selected, setSelected] = useState<string[]>(housemates.map((h) => h.id));
  const [single, setSingle] = useState(currentUserId);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [percents, setPercents] = useState<Record<string, string>>({});

  const nameOf = useMemo(
    () => new Map(housemates.map((h) => [h.id, h.name])),
    [housemates],
  );

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  /**
   * A running preview of who owes what.
   *
   * This exists so nobody has to save a bill to find out whether the numbers
   * work. It is feedback only — the server recomputes the shares from the same
   * inputs and stores those.
   */
  const preview = useMemo(() => {
    let totalCents: number;
    try {
      totalCents = parseAmount(total);
    } catch {
      return { kind: "idle" as const };
    }
    if (totalCents <= 0) return { kind: "idle" as const };

    try {
      const split: Split =
        mode === "single"
          ? { mode: "single", userId: single }
          : mode === "even"
            ? { mode: "even", userIds: selected }
            : mode === "amount"
              ? {
                  mode: "amount",
                  entries: selected.map((userId) => ({
                    userId,
                    amountCents: amounts[userId]?.trim() ? parseAmount(amounts[userId]) : 0,
                  })),
                }
              : {
                  mode: "percent",
                  entries: selected.map((userId) => ({
                    userId,
                    basisPoints: percents[userId]?.trim() ? parsePercent(percents[userId]) : 0,
                  })),
                };

      return { kind: "ok" as const, shares: computeShares(totalCents, split) };
    } catch (error) {
      return {
        kind: "problem" as const,
        message: error instanceof Error ? error.message : "That split does not work",
      };
    }
  }, [total, mode, selected, single, amounts, percents]);

  const perPersonInput = mode === "amount" || mode === "percent";

  return (
    <form action={action} className="space-y-6">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <TextField
          label="What is it for?"
          name="description"
          placeholder="Electricity, January quarter"
          required
          autoFocus
          error={state.fieldErrors?.description}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Total amount"
            name="total"
            inputMode="decimal"
            placeholder="0.00"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
            error={state.fieldErrors?.total}
          />
          <TextField
            label="Category"
            name="category"
            placeholder="Utilities"
            hint="Optional."
            error={state.fieldErrors?.category}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Issued on"
            name="issuedOn"
            type="date"
            defaultValue={today}
            error={state.fieldErrors?.issuedOn}
          />
          <TextField
            label="Due on"
            name="dueOn"
            type="date"
            hint="Optional. Drives reminders."
            error={state.fieldErrors?.dueOn}
          />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <label htmlFor="paidBy" className="block text-sm font-medium text-ink">
          Who paid for this?
        </label>
        <select
          id="paidBy"
          name="paidBy"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink sm:w-64"
        >
          {housemates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.id === currentUserId ? " (you)" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-subtle">
          Everyone else owes them their share. Their own share is marked paid straight away.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">How is it split?</h2>

        <input type="hidden" name="splitMode" value={mode} />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (mode === option.value
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line-strong text-ink-muted hover:bg-surface-sunken hover:text-ink")
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs text-ink-subtle">
          {MODES.find((m) => m.value === mode)!.help}
        </p>

        <ul className="mt-4 space-y-1.5">
          {housemates.map((person) => {
            const isOn = mode === "single" ? single === person.id : selected.includes(person.id);

            return (
              <li
                key={person.id}
                className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
              >
                <input
                  type={mode === "single" ? "radio" : "checkbox"}
                  id={`person-${person.id}`}
                  name={mode === "single" ? "singleUserId" : "participant"}
                  value={person.id}
                  checked={isOn}
                  onChange={() =>
                    mode === "single" ? setSingle(person.id) : toggle(person.id)
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <label
                  htmlFor={`person-${person.id}`}
                  className="flex-1 truncate text-sm text-ink"
                >
                  {person.name}
                  {person.id === currentUserId && (
                    <span className="ml-1.5 text-xs text-ink-subtle">(you)</span>
                  )}
                </label>

                {perPersonInput && isOn && (
                  <input
                    name={`${mode}:${person.id}`}
                    inputMode="decimal"
                    placeholder={mode === "amount" ? "0.00" : "0"}
                    value={
                      mode === "amount" ? (amounts[person.id] ?? "") : (percents[person.id] ?? "")
                    }
                    onChange={(e) =>
                      mode === "amount"
                        ? setAmounts((p) => ({ ...p, [person.id]: e.target.value }))
                        : setPercents((p) => ({ ...p, [person.id]: e.target.value }))
                    }
                    aria-label={`${person.name} ${mode === "amount" ? "amount" : "percentage"}`}
                    className="h-8 w-24 rounded border border-line-strong bg-surface px-2 text-right text-sm text-ink"
                    data-money
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Who owes what</h2>

        <div className="mt-3">
          {preview.kind === "idle" && (
            <p className="text-sm text-ink-subtle">Enter an amount to see the split.</p>
          )}

          {preview.kind === "problem" && <Callout tone="warn">{preview.message}</Callout>}

          {preview.kind === "ok" && (
            <ul className="divide-y divide-line">
              {preview.shares.map((share) => (
                <li key={share.userId} className="flex justify-between py-1.5 text-sm">
                  <span className="text-ink">
                    {nameOf.get(share.userId) ?? "Unknown"}
                    {share.userId === paidBy && (
                      <span className="ml-1.5 text-xs text-ink-subtle">paid this</span>
                    )}
                  </span>
                  <span
                    className={
                      "font-medium " +
                      (share.userId === paidBy ? "text-ink-subtle" : "text-ink")
                    }
                    data-money
                  >
                    {formatAud(share.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <label htmlFor="notes" className="block text-sm font-medium text-ink">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Anything worth remembering about this bill."
          className="mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle"
        />
      </section>

      <Submit />
    </form>
  );
}
