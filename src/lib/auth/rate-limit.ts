/**
 * A deliberately small login throttle.
 *
 * The deployment is LAN and VPN only, so this is not trying to survive a
 * botnet — it exists so that someone with a laptop in the lounge room cannot
 * sit and guess a housemate's password all evening.
 *
 * Two buckets, because one is not enough for either job. Keying only on the
 * account lets anybody lock a specific housemate out by getting their password
 * wrong eight times on purpose, and hands an attacker a fresh budget for every
 * address they try. The account bucket is therefore keyed on account *and*
 * where the attempt came from, and a second bucket caps one source across all
 * accounts.
 *
 * State is in memory and resets on restart. That is an acceptable trade for a
 * single-container app: persisting it would mean a write to SQLite on every
 * failed login, which is a worse deal than the attack it would prevent.
 */

const WINDOW_MS = 15 * 60 * 1000;

/** One source guessing at one account. */
const MAX_PER_ACCOUNT = 8;

/**
 * One source across every account it tries. Higher than the per-account
 * ceiling so a household sharing a source is not tripped by ordinary
 * forgetfulness, low enough that grinding through addresses stops quickly.
 */
const MAX_PER_SOURCE = 40;

type Bucket = { count: number; firstAttemptAt: number };

const buckets = new Map<string, Bucket>();

export type Attempt = {
  /** The account being guessed at, normally a lowercased email. */
  account: string;
  /** Where the attempt came from. See clientSource(). */
  source: string;
};

function accountKey({ account, source }: Attempt): string {
  return `account:${account}|${source}`;
}

function sourceKey({ source }: Attempt): string {
  return `source:${source}`;
}

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.firstAttemptAt > WINDOW_MS) buckets.delete(key);
  }
}

function remainingMinutes(bucket: Bucket, now: number): number {
  return Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.firstAttemptAt)) / 60_000));
}

export type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfterMinutes: number };

export function checkLoginAttempt(attempt: Attempt): ThrottleResult {
  const now = Date.now();
  sweep(now);

  const perAccount = buckets.get(accountKey(attempt));
  const perSource = buckets.get(sourceKey(attempt));

  const blocked = [
    perAccount && perAccount.count >= MAX_PER_ACCOUNT ? perAccount : null,
    perSource && perSource.count >= MAX_PER_SOURCE ? perSource : null,
  ].filter((b): b is Bucket => b !== null);

  if (blocked.length === 0) return { allowed: true };

  return {
    allowed: false,
    retryAfterMinutes: Math.max(...blocked.map((b) => remainingMinutes(b, now))),
  };
}

function bump(key: string, now: number) {
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.firstAttemptAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  bucket.count += 1;
}

export function recordFailedAttempt(attempt: Attempt): void {
  const now = Date.now();
  bump(accountKey(attempt), now);
  bump(sourceKey(attempt), now);
}

/**
 * Called on success. Only the account bucket is cleared: guessing one password
 * correctly should not hand the same source a fresh budget for everyone else's.
 */
export function clearAttempts(attempt: Attempt): void {
  buckets.delete(accountKey(attempt));
}

/** Test seam. */
export function resetAllAttempts(): void {
  buckets.clear();
}
