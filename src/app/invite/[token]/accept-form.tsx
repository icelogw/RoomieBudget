"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { acceptInvite } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Joining…" : "Join the household"}
    </Button>
  );
}

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptInvite, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <input type="hidden" name="token" value={token} />

      {/* Shown so they can check it is the right address, but it comes from
          the invite and cannot be edited here. */}
      <TextField label="Email" name="email-display" value={email} readOnly disabled />

      <TextField
        label="Choose a password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint="At least 10 characters. A short phrase works well."
        error={state.fieldErrors?.password}
      />

      <TextField
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />

      <Submit />
    </form>
  );
}
