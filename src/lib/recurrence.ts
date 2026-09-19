import { addDays, daysBetween } from "./dates";

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const DAY_STEP: Partial<Record<Frequency, number>> = { weekly: 7, fortnightly: 14 };
const MONTH_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toIso(year: number, monthIndex: number, day: number): string {
  return [
    year,
    String(monthIndex + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

/**
 * The nth occurrence of a series, counting the anchor date as n = 0.
 *
 * Month-based cadences are always measured from the anchor, never from the
 * previous occurrence. A bill anchored on the 31st falls on the 28th in
 * February and then returns to the 31st in March — stepping from the previous
 * date instead would strand it on the 28th forever.
 */
export function occurrenceOn(anchorIso: string, frequency: Frequency, index: number): string {
  if (index < 0) throw new Error("Occurrence index cannot be negative");

  const dayStep = DAY_STEP[frequency];
  if (dayStep !== undefined) {
    return addDays(anchorIso, dayStep * index);
  }

  const monthStep = MONTH_STEP[frequency]!;
  const [year, month, day] = anchorIso.split("-").map(Number);

  const absoluteMonth = (month - 1) + monthStep * index;
  const targetYear = year + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;

  // Clamp rather than roll over: 31 September becomes 30 September, not
  // 1 October.
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return toIso(targetYear, targetMonth, clampedDay);
}

/** Guards against a runaway loop if a date ever fails to advance. */
const MAX_STEPS = 10_000;

/** The first occurrence strictly after `afterIso`. */
export function nextOccurrenceAfter(
  anchorIso: string,
  frequency: Frequency,
  afterIso: string,
): string {
  // Jump close to the answer before stepping, so a series anchored years ago
  // does not need thousands of iterations.
  const dayStep = DAY_STEP[frequency];
  let index: number;

  if (dayStep !== undefined) {
    index = Math.max(0, Math.floor(daysBetween(anchorIso, afterIso) / dayStep));
  } else {
    const monthStep = MONTH_STEP[frequency]!;
    const [anchorYear, anchorMonth] = anchorIso.split("-").map(Number);
    const [afterYear, afterMonth] = afterIso.split("-").map(Number);
    const months = (afterYear - anchorYear) * 12 + (afterMonth - anchorMonth);
    index = Math.max(0, Math.floor(months / monthStep));
  }

  for (let step = 0; step < MAX_STEPS; step++, index++) {
    const candidate = occurrenceOn(anchorIso, frequency, index);
    if (candidate > afterIso) return candidate;
  }

  throw new Error("Could not find the next occurrence");
}

/**
 * Every occurrence from `fromIso` up to and including `throughIso`.
 *
 * Used to catch up after downtime: a container that was off for a fortnight
 * comes back and issues the bills it missed, rather than silently skipping
 * them or issuing only the most recent one.
 */
export function occurrencesBetween(
  anchorIso: string,
  frequency: Frequency,
  fromIso: string,
  throughIso: string,
  limit = 60,
): string[] {
  if (fromIso > throughIso) return [];

  const dates: string[] = [];
  let current = fromIso;

  while (current <= throughIso && dates.length < limit) {
    dates.push(current);
    current = nextOccurrenceAfter(anchorIso, frequency, current);
  }

  return dates;
}

export function describeFrequency(frequency: Frequency): string {
  return FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency;
}
