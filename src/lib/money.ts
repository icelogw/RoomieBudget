/**
 * Money is integer cents throughout. Nothing in this file, or anything that
 * calls it, may represent an amount as a float — 0.1 + 0.2 problems in a
 * ledger show up as a cent that exists on one screen and not another.
 */

export type Cents = number;

const MAX_AMOUNT: Cents = 100_000_000_00; // $100m, well inside safe integer range

export class MoneyError extends Error {}

/**
 * Parse user input ("12", "12.3", "$1,234.56") into cents.
 *
 * Thousands separators are checked for correct placement rather than simply
 * stripped, so a typo like "1," or "12,34" is rejected instead of silently
 * becoming $1.00 or $12.34.
 */
const AMOUNT = /^-?(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/;

export function parseAmount(input: string): Cents {
  const trimmed = input.trim();

  // Internal whitespace is always a typo: "1 234.56" and "- 5" are rejected
  // rather than quietly collapsed into a number the user did not type.
  if (/\s/.test(trimmed)) {
    throw new MoneyError(`"${input}" is not a valid amount`);
  }

  const withoutCurrency = trimmed.replace(/^(-?)\$/, "$1");
  if (!AMOUNT.test(withoutCurrency)) {
    throw new MoneyError(`"${input}" is not a valid amount`);
  }

  const cleaned = withoutCurrency.replace(/,/g, "");
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (cents > MAX_AMOUNT) throw new MoneyError(`Amount exceeds the maximum`);
  return negative ? -cents : cents;
}

/** "1234.50" — bare number, for form inputs and CSV. */
export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "$1,234.50" — for display. Negative renders as -$1,234.50, not $-1,234.50. */
export function formatAud(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100).toLocaleString("en-AU");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Split `total` across integer `weights` using the largest-remainder method.
 *
 * Weights must be integers so the arithmetic stays exact: `total * weight` and
 * `% divisor` are both integer operations, so the ordering of remainders is
 * decided without float comparison. Equal split is weights of [1, 1, 1, ...];
 * a percentage split is basis points, e.g. [3333, 3333, 3334].
 *
 * The returned shares always sum to exactly `total`. Leftover cents go to the
 * largest remainders first, ties broken by position, so the same inputs always
 * produce the same allocation.
 */
export function splitByWeights(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) throw new MoneyError("Cannot split across nobody");
  if (!weights.every((w) => Number.isInteger(w) && w >= 0)) {
    throw new MoneyError("Weights must be non-negative integers");
  }

  const divisor = weights.reduce((a, b) => a + b, 0);
  if (divisor === 0) throw new MoneyError("Weights must not all be zero");

  const negative = total < 0;
  const magnitude = Math.abs(total);

  const shares = weights.map((w) => Math.floor((magnitude * w) / divisor));
  let leftover = magnitude - shares.reduce((a, b) => a + b, 0);

  const byRemainder = weights
    .map((w, index) => ({ index, remainder: (magnitude * w) % divisor }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; leftover > 0; i++, leftover--) {
    shares[byRemainder[i].index]++;
  }

  return negative ? shares.map((s) => -s) : shares;
}

/** Split evenly across `count` people. */
export function splitEvenly(total: Cents, count: number): Cents[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new MoneyError("Cannot split across a fractional number of people");
  }
  return splitByWeights(total, new Array(count).fill(1));
}

/** Validate a set of hand-entered shares covers the bill exactly. */
export function assertSharesCoverTotal(shares: Cents[], total: Cents): void {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum !== total) {
    const delta = formatAud(Math.abs(total - sum));
    const direction = sum < total ? "short of" : "over";
    throw new MoneyError(`Shares are ${delta} ${direction} the bill total`);
  }
}
