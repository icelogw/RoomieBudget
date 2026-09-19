"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { finaliseBill, type BillFormState } from "../actions";

const INITIAL: BillFormState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Set amount and split"}
    </Button>
  );
}

/**
 * Shown on a bill issued by a series whose amount varies. Until an amount is
 * entered the bill has no shares, so nobody owes anything yet.
 */
export function FinaliseForm({ billId }: { billId: string }) {
  const [state, action] = useActionState(finaliseBill, INITIAL);

  return (
    <form action={action} className="space-y-3">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <input type="hidden" name="billId" value={billId} />

      <TextField
        label="How much was it?"
        name="total"
        inputMode="decimal"
        placeholder="0.00"
        required
        autoFocus
        hint="It will be split the way the recurring bill was set up."
        error={state.fieldErrors?.total}
      />

      <Submit />
    </form>
  );
}
