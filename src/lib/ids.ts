import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

/**
 * Short, URL-safe, unguessable identifier. 16 characters of base32 is 80 bits
 * of entropy — enough that IDs appearing in URLs cannot be enumerated.
 */
export function newId(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
