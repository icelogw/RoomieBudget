"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { createHousehold } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating account…" : "Create admin account"}
    </Button>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(createHousehold, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <TextField
        label="Your name"
        name="name"
        autoComplete="name"
        required
        autoFocus
        error={state.fieldErrors?.name}
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Bills and reminders are sent here."
        error={state.fieldErrors?.email}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
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
