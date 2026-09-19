import type { ComponentProps, ReactNode } from "react";

import { ChevronDownIcon } from "./icons";

/**
 * The shared vocabulary every screen is built from. Deliberately small: four
 * button variants, one field, one callout. Components take semantic tokens
 * only, so light and dark stay in step without either being special-cased.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-sunken",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export function TextField({
  label,
  name,
  error,
  hint,
  className = "",
  ...props
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const describedBy = [error && `${name}-error`, hint && `${name}-hint`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>

      <input
        {...props}
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={
          "mt-1.5 block h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink " +
          "placeholder:text-ink-subtle " +
          (error ? "border-danger" : "border-line-strong")
        }
      />

      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const CALLOUT_TONES = {
  danger: "border-danger/30 bg-danger-soft text-danger",
  warn: "border-warn/30 bg-warn-soft text-warn",
  ok: "border-ok/30 bg-ok-soft text-ok",
  neutral: "border-line bg-surface-sunken text-ink-muted",
} as const;

export function Callout({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`rounded-md border px-3 py-2.5 text-sm ${CALLOUT_TONES[tone]}`}
    >
      {children}
    </div>
  );
}

/**
 * A collapsible panel.
 *
 * Built on <details> rather than state: it opens and closes with no
 * JavaScript, is keyboard operable for free, and the browser handles find-in-
 * page opening it. The chevron is the only thing that needs styling.
 */
export function Disclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-lg border border-line bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {description && (
            <span className="mt-0.5 block text-xs text-ink-subtle">{description}</span>
          )}
        </span>
        <ChevronDownIcon className="h-5 w-5 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

/** Centred single-column frame used by sign-in, setup and invite screens. */
export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {intro && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </main>
  );
}
