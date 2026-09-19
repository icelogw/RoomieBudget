import {
  MoneyError,
  assertSharesCoverTotal,
  splitByWeights,
  splitEvenly,
  type Cents,
} from "./money";

/**
 * How a bill is divided. The four modes cover what actually happens in a
 * sharehouse: rent split evenly, a shop split by what each person asked for,
 * a bill split by room size, and "you broke it, you pay for it".
 */
export type Split =
  | { mode: "even"; userIds: string[] }
  | { mode: "amount"; entries: Array<{ userId: string; amountCents: Cents }> }
  | { mode: "percent"; entries: Array<{ userId: string; basisPoints: number }> }
  | { mode: "weights"; entries: Array<{ userId: string; weight: number }> }
  | { mode: "single"; userId: string };

export type Share = { userId: string; amountCents: Cents };

/** 100% expressed in basis points, the integer unit percentages are kept in. */
export const FULL_SHARE_BASIS_POINTS = 10_000;

function assertNoDuplicates(userIds: string[]): void {
  if (new Set(userIds).size !== userIds.length) {
    throw new MoneyError("The same person cannot appear twice on one bill");
  }
}

/**
 * Turn a bill total and a split into exact per-person amounts.
 *
 * Always returns shares summing to exactly `totalCents`. This runs on the
 * server on every save — the browser computes a preview for the person
 * entering the bill, but that preview is never what gets stored.
 */
export function computeShares(totalCents: Cents, split: Split): Share[] {
  if (!Number.isInteger(totalCents)) {
    throw new MoneyError("Bill totals must be whole cents");
  }
  if (totalCents <= 0) {
    throw new MoneyError("A bill must be more than zero");
  }

  switch (split.mode) {
    case "even": {
      assertNoDuplicates(split.userIds);
      if (split.userIds.length === 0) {
        throw new MoneyError("Choose at least one person to split this between");
      }

      const amounts = splitEvenly(totalCents, split.userIds.length);
      return split.userIds.map((userId, i) => ({ userId, amountCents: amounts[i] }));
    }

    case "single": {
      return [{ userId: split.userId, amountCents: totalCents }];
    }

    case "amount": {
      assertNoDuplicates(split.entries.map((e) => e.userId));
      if (split.entries.length === 0) {
        throw new MoneyError("Choose at least one person to split this between");
      }
      if (split.entries.some((e) => !Number.isInteger(e.amountCents) || e.amountCents < 0)) {
        throw new MoneyError("Every amount must be zero or more");
      }

      // Hand-entered amounts are used as given, so they must already add up.
      // Silently adjusting someone's share to force a match would be worse
      // than refusing: the person entering the bill would never know.
      assertSharesCoverTotal(
        split.entries.map((e) => e.amountCents),
        totalCents,
      );

      return split.entries.map((e) => ({ userId: e.userId, amountCents: e.amountCents }));
    }

    case "weights": {
      // Proportional shares that are not percentages: two parts to one, or a
      // rent split by room size. Same largest-remainder allocation.
      assertNoDuplicates(split.entries.map((e) => e.userId));
      if (split.entries.length === 0) {
        throw new MoneyError("Choose at least one person to split this between");
      }
      if (split.entries.some((e) => !Number.isInteger(e.weight) || e.weight < 0)) {
        throw new MoneyError("Every share must be a whole number, zero or more");
      }
      if (split.entries.reduce((acc, e) => acc + e.weight, 0) === 0) {
        throw new MoneyError("At least one person must have a share above zero");
      }

      const amounts = splitByWeights(
        totalCents,
        split.entries.map((e) => e.weight),
      );
      return split.entries.map((e, i) => ({ userId: e.userId, amountCents: amounts[i] }));
    }

    case "percent": {
      assertNoDuplicates(split.entries.map((e) => e.userId));
      if (split.entries.length === 0) {
        throw new MoneyError("Choose at least one person to split this between");
      }
      if (split.entries.some((e) => !Number.isInteger(e.basisPoints) || e.basisPoints < 0)) {
        throw new MoneyError("Every percentage must be zero or more");
      }

      const total = split.entries.reduce((acc, e) => acc + e.basisPoints, 0);
      if (total !== FULL_SHARE_BASIS_POINTS) {
        throw new MoneyError(`Percentages must add up to 100%, not ${total / 100}%`);
      }

      // Largest-remainder over the basis points, so 33.33/33.33/33.34 of an
      // odd total still reconciles to the cent.
      const amounts = splitByWeights(
        totalCents,
        split.entries.map((e) => e.basisPoints),
      );
      return split.entries.map((e, i) => ({ userId: e.userId, amountCents: amounts[i] }));
    }
  }
}

/** "33.33" -> 3333 basis points. Rejects anything finer than two decimals. */
export function parsePercent(input: string): number {
  const cleaned = input.trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new MoneyError(`"${input}" is not a valid percentage`);
  }

  const [whole, fraction = ""] = cleaned.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (basisPoints > FULL_SHARE_BASIS_POINTS) {
    throw new MoneyError("A percentage cannot be more than 100%");
  }
  return basisPoints;
}
