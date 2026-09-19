/**
 * PayID validation for the two identifier types a person can register with an
 * Australian bank: an email address, or a mobile number.
 *
 * The app stores a PayID so housemates know where to send money. It does not
 * resolve, verify or transact against it — there is no connection to NPP or to
 * any bank, and none of this constitutes a payment service.
 *
 * Bank account numbers and BSBs are deliberately not supported. They are more
 * sensitive than a PayID, and for paying a housemate back a PayID is what
 * people actually use.
 */

export type PayIdType = "email" | "mobile";

export type PayIdResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Australian mobile numbers are ten digits beginning 04, or the same number in
 * international form as +614 followed by eight digits.
 *
 * Stored in +61 form: it is unambiguous, it is what a banking app displays,
 * and it means the same number typed two ways compares equal.
 */
export function normaliseMobile(input: string): PayIdResult {
  const digits = input.replace(/[\s()-]/g, "");

  if (/^04\d{8}$/.test(digits)) {
    return { ok: true, value: `+61${digits.slice(1)}` };
  }

  if (/^\+614\d{8}$/.test(digits)) {
    return { ok: true, value: digits };
  }

  if (/^614\d{8}$/.test(digits)) {
    return { ok: true, value: `+${digits}` };
  }

  return {
    ok: false,
    error: "Enter an Australian mobile, like 0412 345 678",
  };
}

export function validatePayId(type: PayIdType, rawValue: string): PayIdResult {
  const value = rawValue.trim();

  if (!value) return { ok: false, error: "Enter a PayID, or leave it blank" };

  if (type === "email") {
    const lower = value.toLowerCase();
    return EMAIL.test(lower)
      ? { ok: true, value: lower }
      : { ok: false, error: "Enter a valid email address" };
  }

  return normaliseMobile(value);
}

/** "0412 345 678" — the form an Australian expects to read. */
export function formatPayId(type: PayIdType, value: string): string {
  if (type !== "mobile") return value;

  // Stored as +61 followed by nine digits. Local form is a leading 0 plus
  // those nine, grouped 4-3-3: 0412 345 678.
  const match = /^\+61(\d{3})(\d{3})(\d{3})$/.exec(value);
  if (!match) return value;
  return `0${match[1]} ${match[2]} ${match[3]}`;
}
