import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkLoginAttempt,
  clearAttempts,
  recordFailedAttempt,
  resetAllAttempts,
  type Attempt,
} from "./rate-limit";

const MAX_PER_ACCOUNT = 8;
const MAX_PER_SOURCE = 40;
const WINDOW_MS = 15 * 60 * 1000;

const alice: Attempt = { account: "alice@example.com", source: "192.168.1.10" };

function fail(attempt: Attempt, times: number) {
  for (let i = 0; i < times; i++) recordFailedAttempt(attempt);
}

beforeEach(() => {
  resetAllAttempts();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("guessing one account from one source", () => {
  it("allows attempts up to the limit", () => {
    fail(alice, MAX_PER_ACCOUNT - 1);
    expect(checkLoginAttempt(alice).allowed).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    fail(alice, MAX_PER_ACCOUNT);

    const result = checkLoginAttempt(alice);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMinutes).toBeGreaterThan(0);
      expect(result.retryAfterMinutes).toBeLessThanOrEqual(15);
    }
  });

  it("forgives once the window has passed", () => {
    fail(alice, MAX_PER_ACCOUNT);
    expect(checkLoginAttempt(alice).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(checkLoginAttempt(alice).allowed).toBe(true);
  });

  it("counts down the remaining wait as time passes", () => {
    fail(alice, MAX_PER_ACCOUNT);

    const first = checkLoginAttempt(alice);
    vi.advanceTimersByTime(10 * 60 * 1000);
    const later = checkLoginAttempt(alice);

    if (first.allowed || later.allowed) throw new Error("expected both to be blocked");
    expect(later.retryAfterMinutes).toBeLessThan(first.retryAfterMinutes);
  });

  it("wipes the record on a successful sign-in", () => {
    fail(alice, MAX_PER_ACCOUNT);
    expect(checkLoginAttempt(alice).allowed).toBe(false);

    clearAttempts(alice);
    expect(checkLoginAttempt(alice).allowed).toBe(true);
  });
});

describe("one housemate cannot lock another out", () => {
  /**
   * Keying only on the account let anybody deny a specific person access for
   * fifteen minutes by getting their password wrong eight times on purpose.
   */
  it("keeps two sources guessing the same account apart", () => {
    const fromLounge = { account: "alice@example.com", source: "192.168.1.50" };
    const fromPhone = { account: "alice@example.com", source: "192.168.1.51" };

    fail(fromLounge, MAX_PER_ACCOUNT);

    expect(checkLoginAttempt(fromLounge).allowed).toBe(false);
    expect(checkLoginAttempt(fromPhone).allowed).toBe(true);
  });

  it("still throttles the source that is actually guessing", () => {
    const attacker = { account: "alice@example.com", source: "192.168.1.99" };
    fail(attacker, MAX_PER_ACCOUNT);

    expect(checkLoginAttempt(attacker).allowed).toBe(false);
  });
});

describe("one source working through many accounts", () => {
  /**
   * Without a source ceiling, every new address handed an attacker a fresh
   * budget of eight, so the total was unbounded.
   */
  it("is stopped once the source ceiling is reached", () => {
    const source = "192.168.1.200";

    for (let i = 0; i < MAX_PER_SOURCE; i++) {
      recordFailedAttempt({ account: `victim${i}@example.com`, source });
    }

    expect(checkLoginAttempt({ account: "someone-new@example.com", source }).allowed).toBe(
      false,
    );
  });

  it("leaves other sources alone", () => {
    const busy = "192.168.1.201";
    for (let i = 0; i < MAX_PER_SOURCE; i++) {
      recordFailedAttempt({ account: `victim${i}@example.com`, source: busy });
    }

    expect(
      checkLoginAttempt({ account: "victim0@example.com", source: "192.168.1.202" }).allowed,
    ).toBe(true);
  });

  it("does not hand back a fresh budget for guessing one password right", () => {
    const source = "192.168.1.203";

    for (let i = 0; i < MAX_PER_SOURCE; i++) {
      recordFailedAttempt({ account: `victim${i}@example.com`, source });
    }

    // Succeeding at one account clears that account's bucket, not the
    // source's — otherwise a single correct guess would reset the ceiling.
    clearAttempts({ account: "victim0@example.com", source });

    expect(checkLoginAttempt({ account: "victim1@example.com", source }).allowed).toBe(false);
  });
});
