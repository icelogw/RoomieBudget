"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import {
  createCategory,
  deleteCategory,
  editCategory,
  renameHousehold,
  reorderCategory,
  type SettingsState,
} from "./settings-actions";

const INITIAL: SettingsState = {};

const ROW_BUTTON =
  "rounded px-2 py-1 text-xs font-medium text-ink-muted transition-colors " +
  "hover:bg-surface-sunken hover:text-ink disabled:opacity-40";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function HouseholdNameForm({ current }: { current: string }) {
  const [state, action] = useActionState(renameHousehold, INITIAL);

  return (
    <form action={action} className="space-y-3">
      {state.notice && <Callout tone="ok">{state.notice}</Callout>}

      <TextField
        label="Household name"
        name="householdName"
        defaultValue={current}
        placeholder="12 Marion Street"
        hint="Shown in the sidebar and at the top of the app."
        error={state.fieldErrors?.householdName}
      />

      <Submit label="Save name" busy="Saving…" />
    </form>
  );
}

export function AddCategoryForm() {
  const [state, action] = useActionState(createCategory, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          name="name"
          placeholder="Add a category"
          aria-label="New category name"
          required
          maxLength={40}
          className={
            "h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle " +
            (state.fieldErrors?.name ? "border-danger" : "border-line-strong")
          }
        />
        {state.fieldErrors?.name && (
          <p className="mt-1.5 text-xs text-danger">{state.fieldErrors.name}</p>
        )}
      </div>

      <Button type="submit" className="shrink-0">
        <PlusIcon className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}

export function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: { id: string; name: string };
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const [renameState, renameAction, renamePending] = useActionState(editCategory, INITIAL);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCategory, INITIAL);
  const [moveState, moveAction, movePending] = useActionState(reorderCategory, INITIAL);

  const error = renameState.message ?? deleteState.message ?? moveState.message;

  return (
    <li className="border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <form
            action={renameAction}
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={() => setEditing(false)}
          >
            <input type="hidden" name="categoryId" value={category.id} />
            <input
              name="name"
              defaultValue={category.name}
              autoFocus
              required
              maxLength={40}
              aria-label={`Rename ${category.name}`}
              className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 text-sm text-ink"
            />
            <button type="submit" className={ROW_BUTTON} disabled={renamePending}>
              {renamePending ? "Saving…" : "Save"}
            </button>
            <button type="button" className={ROW_BUTTON} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="min-w-0 truncate text-sm text-ink">{category.name}</span>

            <div className="flex shrink-0 items-center gap-0.5">
              <form action={moveAction} className="contents">
                <input type="hidden" name="categoryId" value={category.id} />
                <input type="hidden" name="direction" value="up" />
                <button
                  type="submit"
                  className={ROW_BUTTON}
                  disabled={isFirst || movePending}
                  aria-label={`Move ${category.name} up`}
                >
                  ↑
                </button>
              </form>

              <form action={moveAction} className="contents">
                <input type="hidden" name="categoryId" value={category.id} />
                <input type="hidden" name="direction" value="down" />
                <button
                  type="submit"
                  className={ROW_BUTTON}
                  disabled={isLast || movePending}
                  aria-label={`Move ${category.name} down`}
                >
                  ↓
                </button>
              </form>

              <button type="button" className={ROW_BUTTON} onClick={() => setEditing(true)}>
                Rename
              </button>

              <form action={deleteAction}>
                <input type="hidden" name="categoryId" value={category.id} />
                <button
                  type="submit"
                  className={`${ROW_BUTTON} hover:text-danger`}
                  disabled={deletePending}
                >
                  {deletePending ? "Removing…" : "Remove"}
                </button>
              </form>
            </div>
          </>
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
