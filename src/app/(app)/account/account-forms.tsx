"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { changePassword, savePaymentDetails, type AccountState } from "./actions";

const INITIAL: AccountState = {};

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function PaymentForm({
  payIdType,
  payId,
  paymentNote,
}: {
  payIdType: "email" | "mobile";
  payId: string;
  paymentNote: string;
}) {
  const [state, action] = useActionState(savePaymentDetails, INITIAL);
  const [type, setType] = useState(payIdType);

  return (
    <form action={action} className="space-y-4">
      {state.notice && <Callout tone="ok">{state.notice}</Callout>}
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <div>
        <label htmlFor="payIdType" className="block text-sm font-medium text-ink">
          PayID type
        </label>
        <select
          id="payIdType"
          name="payIdType"
          value={type}
          onChange={(e) => setType(e.target.value as "email" | "mobile")}
          className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink sm:w-56"
        >
          <option value="email">Email</option>
          <option value="mobile">Mobile</option>
        </select>
      </div>

      <TextField
        label="PayID"
        name="payId"
        type={type === "email" ? "email" : "tel"}
        defaultValue={payId}
        placeholder={type === "email" ? "you@example.com" : "0412 345 678"}
        hint="Leave blank if you would rather not store one."
        error={state.fieldErrors?.payId}
      />

      <div>
        <label htmlFor="paymentNote" className="block text-sm font-medium text-ink">
          Note
        </label>
        <textarea
          id="paymentNote"
          name="paymentNote"
          rows={2}
          defaultValue={paymentNote}
          placeholder="Anything else that helps — which bank, a reference to use."
          className="mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle"
        />
        {state.fieldErrors?.paymentNote && (
          <p className="mt-1.5 text-xs text-danger">{state.fieldErrors.paymentNote}</p>
        )}
      </div>

      <Submit label="Save payment details" busy="Saving…" />
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, INITIAL);

  return (
    <form action={action} className="space-y-4">
      {state.notice && <Callout tone="ok">{state.notice}</Callout>}
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <TextField
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.current}
      />

      <TextField
        label="New password"
        name="next"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state.fieldErrors?.next}
      />

      <TextField
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />

      <Submit label="Change password" busy="Changing…" />
    </form>
  );
}
