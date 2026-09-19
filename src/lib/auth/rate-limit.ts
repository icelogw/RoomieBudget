/**
 * A deliberately small login throttle.
 *
 * The deployment is LAN and VPN only, so this is not trying to survive a
 * botnet — it exists so that someone with a laptop in the lounge room cannot
 * sit and guess a housemate's password all evening.
 *
 * State is in memory and resets on restart. That is an acceptable trade for a
 * single-container app: persisting it would mean a write to SQLite on every
 * failed login, which is a worse deal than the attack it would prevent.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; firstAttemptAt: number };

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.firstAttemptAt > WINDOW_MS) buckets.delete(key);
  }
}

export type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfterMinutes: number };

export function checkLoginAttempt(key: string): ThrottleResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true };

  if (bucket.count < MAX_ATTEMPTS) return { allowed: true };

  const elapsed = now - bucket.firstAttemptAt;
  return {
    allowed: false,
    retryAfterMinutes: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 60_000)),
  };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.firstAttemptAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  bucket.count += 1;
}

/** Called on success, so a correct password immediately clears the record. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

/** Test seam. */
export function resetAllAttempts(): void {
  buckets.clear();
}
