import { LOCALE } from "./app";

/**
 * Calendar dates are "YYYY-MM-DD" strings and are deliberately never turned
 * into a Date to be displayed.
 *
 * `new Date("2026-10-03")` parses as midnight UTC, which in Australia is
 * already the 3rd but in the Americas is still the 2nd — so formatting through
 * a Date shifts the day. Splitting the string cannot.
 */
export function formatCalendarDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

/** "3 Oct 2026" — for headings, where the long form reads better. */
export function formatCalendarDateLong(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  // Constructed as a local date, not parsed from the string, so no UTC shift.
  return new Date(year, month - 1, day).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Today in the household's timezone, as a calendar date.
 *
 * The container's TZ is the household's timezone, so the system clock is the
 * right source. "en-CA" is used only because it formats as YYYY-MM-DD.
 */
export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Shift a calendar date by whole days, staying in calendar space. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}

/** "Today", "Tomorrow", "3 days overdue" — relative to the household's today. */
export function describeDueDate(dueOn: string, today = todayIso()): string {
  const days = daysBetween(today, dueOn);

  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 14) return `Due in ${days} days`;
  return `Due ${formatCalendarDate(dueOn)}`;
}

/** Timestamps are instants, so these do go through Date. */
export function formatTimestamp(at: Date): string {
  return at.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
