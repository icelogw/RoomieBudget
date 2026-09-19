"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Callout, TextField } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { signIn } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(signIn, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.message && <Callout tone="danger">{state.message}</Callout>}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        error={state.fieldErrors?.email}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <Submit />
    </form>
  );
}
