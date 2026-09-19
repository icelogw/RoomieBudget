import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id at the parameters OWASP currently recommends: 19 MiB of memory,
 * two passes, one lane. Memory cost is what makes GPU cracking expensive, so
 * it is the number not to trim if hashing ever feels slow.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Verify a password. Returns false on a malformed or unknown hash rather than
 * throwing, so a corrupt row reads as a failed login instead of a 500.
 */
export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the time a real verification takes.
 *
 * Called when no account matches the submitted email. Without it, a missing
 * account returns noticeably faster than a wrong password, which lets an
 * outsider enumerate who lives here.
 *
 * Hashing rather than verifying a decoy digest: the work is the same, and it
 * cannot quietly become a no-op if a hardcoded hash is ever malformed.
 */
export async function fakeVerify(): Promise<void> {
  await hash("timing-equaliser", OPTIONS);
}
