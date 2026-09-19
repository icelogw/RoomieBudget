import type { ZodError } from "zod";

/** Shape every server action returns, so forms all render errors the same way. */
export type FormState = {
  message?: string;
  fieldErrors?: Record<string, string | undefined>;
};

export const EMPTY_FORM_STATE: FormState = {};

/** Keep only the first message per field — a stack of them helps nobody. */
export function fieldErrorsFrom(error: ZodError): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}
