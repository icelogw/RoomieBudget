import { describe, expect, it } from "vitest";

import { nextOccurrenceAfter, occurrenceOn, occurrencesBetween } from "./recurrence";

describe("weekly and fortnightly", () => {
  it("steps by whole weeks", () => {
    expect(occurrenceOn("2026-09-19", "weekly", 0)).toBe("2026-09-19");
    expect(occurrenceOn("2026-09-19", "weekly", 1)).toBe("2026-09-26");
    expect(occurrenceOn("2026-09-19", "fortnightly", 1)).toBe("2026-10-03");
    expect(occurrenceOn("2026-09-19", "fortnightly", 3)).toBe("2026-10-31");
  });

  it("crosses a year boundary", () => {
    expect(occurrenceOn("2026-12-28", "weekly", 1)).toBe("2027-01-04");
  });
});

describe("month-based cadences", () => {
  it("keeps the same day of the month", () => {
    expect(occurrenceOn("2026-09-15", "monthly", 1)).toBe("2026-10-15");
    expect(occurrenceOn("2026-09-15", "quarterly", 1)).toBe("2026-12-15");
    expect(occurrenceOn("2026-09-15", "yearly", 1)).toBe("2027-09-15");
  });

  it("clamps to the last day when the month is short", () => {
    // January 31 has no equivalent in February.
    expect(occurrenceOn("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceOn("2026-01-31", "monthly", 3)).toBe("2026-04-30");
  });

  it("returns to the anchor day after a short month, rather than sticking", () => {
    // This is the reason occurrences are measured from the anchor. Stepping
    // from the previous date would leave a 31st bill stranded on the 28th.
    expect(occurrenceOn("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceOn("2026-01-31", "monthly", 4)).toBe("2026-05-31");
  });

  it("handles a leap year", () => {
    expect(occurrenceOn("2024-01-31", "monthly", 1)).toBe("2024-02-29");
    expect(occurrenceOn("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });

  it("crosses year boundaries", () => {
    expect(occurrenceOn("2026-11-15", "quarterly", 1)).toBe("2027-02-15");
    expect(occurrenceOn("2026-12-01", "monthly", 1)).toBe("2027-01-01");
  });
});

describe("nextOccurrenceAfter", () => {
  it("never returns the date it was given", () => {
    expect(nextOccurrenceAfter("2026-09-19", "weekly", "2026-09-19")).toBe("2026-09-26");
    expect(nextOccurrenceAfter("2026-09-15", "monthly", "2026-09-15")).toBe("2026-10-15");
  });

  it("returns the anchor when asked about a date before it", () => {
    expect(nextOccurrenceAfter("2026-09-19", "weekly", "2026-09-01")).toBe("2026-09-19");
  });

  it("skips forward correctly from a date between occurrences", () => {
    expect(nextOccurrenceAfter("2026-09-19", "fortnightly", "2026-09-25")).toBe("2026-10-03");
  });

  it("copes with an anchor years in the past without stalling", () => {
    expect(nextOccurrenceAfter("2010-01-15", "monthly", "2026-09-19")).toBe("2026-10-15");
    expect(nextOccurrenceAfter("2010-01-05", "weekly", "2026-09-19")).toBe("2026-09-22");
  });

  it("always moves strictly forward, never stalling on a short month", () => {
    const anchor = "2026-01-31";
    let cursor = "2026-01-01";

    for (let i = 0; i < 40; i++) {
      const next = nextOccurrenceAfter(anchor, "monthly", cursor);
      expect(next > cursor, `${next} must be after ${cursor}`).toBe(true);
      cursor = next;
    }
  });
});

describe("occurrencesBetween", () => {
  it("lists every missed date, for catching up after downtime", () => {
    const missed = occurrencesBetween("2026-09-01", "weekly", "2026-09-01", "2026-09-22");
    expect(missed).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("includes a date falling exactly on the end of the range", () => {
    expect(occurrencesBetween("2026-09-01", "monthly", "2026-10-01", "2026-10-01")).toEqual([
      "2026-10-01",
    ]);
  });

  it("returns nothing when the next date is still in the future", () => {
    expect(occurrencesBetween("2026-09-01", "monthly", "2026-11-01", "2026-10-15")).toEqual([]);
  });

  it("caps how far it will catch up", () => {
    // A series left dormant for years must not generate hundreds of bills the
    // moment the container comes back.
    const many = occurrencesBetween("2000-01-01", "weekly", "2000-01-01", "2026-09-19", 10);
    expect(many).toHaveLength(10);
  });
});
