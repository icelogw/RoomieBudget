import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkLoginAttempt,
  clearAttempts,
  recordFailedAttempt,
  resetAllAttempts,
} from "./rate-limit";

const KEY = "alice@example.com";
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

beforeEach(() => {
  resetAllAttempts();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkLoginAttempt", () => {
  it("allows an address that has never failed", () => {
    expect(checkLoginAttempt(KEY).allowed).toBe(true);
  });

  it("allows attempts right up to the limit", () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailedAttempt(KEY);
    expect(checkLoginAttempt(KEY).allowed).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);

    const result = checkLoginAttempt(KEY);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMinutes).toBeGreaterThan(0);
      expect(result.retryAfterMinutes).toBeLessThanOrEqual(15);
    }
  });

  it("throttles each address separately", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);

    expect(checkLoginAttempt(KEY).allowed).toBe(false);
    expect(checkLoginAttempt("bob@example.com").allowed).toBe(true);
  });

  it("forgives once the window has passed", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);
    expect(checkLoginAttempt(KEY).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(checkLoginAttempt(KEY).allowed).toBe(true);
  });

  it("counts down the remaining wait as time passes", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);

    const first = checkLoginAttempt(KEY);
    vi.advanceTimersByTime(10 * 60 * 1000);
    const later = checkLoginAttempt(KEY);

    if (!first.allowed && !later.allowed) {
      expect(later.retryAfterMinutes).toBeLessThan(first.retryAfterMinutes);
    } else {
      throw new Error("expected both checks to be blocked");
    }
  });
});

describe("clearAttempts", () => {
  it("wipes the record on a successful sign-in", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt(KEY);
    expect(checkLoginAttempt(KEY).allowed).toBe(false);

    clearAttempts(KEY);
    expect(checkLoginAttempt(KEY).allowed).toBe(true);
  });
});
