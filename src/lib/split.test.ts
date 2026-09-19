import { describe, expect, it } from "vitest";

import { MoneyError } from "./money";
import { computeShares, parsePercent, type Split } from "./split";

const ALICE = "alice";
const BOB = "bob";
const CHARLIE = "charlie";

function sum(shares: Array<{ amountCents: number }>): number {
  return shares.reduce((acc, s) => acc + s.amountCents, 0);
}

describe("even split", () => {
  it("divides exactly when it can", () => {
    const shares = computeShares(9000, { mode: "even", userIds: [ALICE, BOB, CHARLIE] });
    expect(shares).toEqual([
      { userId: ALICE, amountCents: 3000 },
      { userId: BOB, amountCents: 3000 },
      { userId: CHARLIE, amountCents: 3000 },
    ]);
  });

  it("gives the odd cent to the first person rather than losing it", () => {
    const shares = computeShares(10_00, { mode: "even", userIds: [ALICE, BOB, CHARLIE] });
    expect(shares.map((s) => s.amountCents)).toEqual([334, 333, 333]);
    expect(sum(shares)).toBe(1000);
  });

  it("reconciles for any total across any household size", () => {
    for (let total = 1; total <= 1500; total++) {
      for (const people of [[ALICE], [ALICE, BOB], [ALICE, BOB, CHARLIE]]) {
        const shares = computeShares(total, { mode: "even", userIds: people });
        expect(sum(shares), `${total} across ${people.length}`).toBe(total);
      }
    }
  });

  it("refuses a bill split between nobody", () => {
    expect(() => computeShares(1000, { mode: "even", userIds: [] })).toThrow(MoneyError);
  });

  it("refuses to bill the same person twice", () => {
    expect(() =>
      computeShares(1000, { mode: "even", userIds: [ALICE, ALICE] }),
    ).toThrow(/cannot appear twice/);
  });
});

describe("single payer", () => {
  it("assigns the whole bill to one person", () => {
    const shares = computeShares(4550, { mode: "single", userId: BOB });
    expect(shares).toEqual([{ userId: BOB, amountCents: 4550 }]);
  });
});

describe("split by amount", () => {
  it("uses the amounts exactly as entered", () => {
    const split: Split = {
      mode: "amount",
      entries: [
        { userId: ALICE, amountCents: 2500 },
        { userId: BOB, amountCents: 7500 },
      ],
    };
    expect(computeShares(10_000, split)).toEqual([
      { userId: ALICE, amountCents: 2500 },
      { userId: BOB, amountCents: 7500 },
    ]);
  });

  it("refuses amounts that do not add up, and says by how much", () => {
    const split: Split = {
      mode: "amount",
      entries: [
        { userId: ALICE, amountCents: 2500 },
        { userId: BOB, amountCents: 7000 },
      ],
    };
    expect(() => computeShares(10_000, split)).toThrow(/\$5\.00 short of/);
  });

  it("allows a zero share for someone who owes nothing this time", () => {
    const split: Split = {
      mode: "amount",
      entries: [
        { userId: ALICE, amountCents: 0 },
        { userId: BOB, amountCents: 1000 },
      ],
    };
    expect(sum(computeShares(1000, split))).toBe(1000);
  });

  it("refuses negative amounts", () => {
    const split: Split = {
      mode: "amount",
      entries: [
        { userId: ALICE, amountCents: -500 },
        { userId: BOB, amountCents: 1500 },
      ],
    };
    expect(() => computeShares(1000, split)).toThrow(/zero or more/);
  });
});

describe("split by percent", () => {
  it("applies whole percentages", () => {
    const split: Split = {
      mode: "percent",
      entries: [
        { userId: ALICE, basisPoints: 6000 },
        { userId: BOB, basisPoints: 4000 },
      ],
    };
    expect(computeShares(10_000, split)).toEqual([
      { userId: ALICE, amountCents: 6000 },
      { userId: BOB, amountCents: 4000 },
    ]);
  });

  it("reconciles thirds of an awkward total", () => {
    const split: Split = {
      mode: "percent",
      entries: [
        { userId: ALICE, basisPoints: 3333 },
        { userId: BOB, basisPoints: 3333 },
        { userId: CHARLIE, basisPoints: 3334 },
      ],
    };
    const shares = computeShares(10_001, split);
    expect(sum(shares)).toBe(10_001);
  });

  it("refuses percentages that do not total 100, naming the total", () => {
    const split: Split = {
      mode: "percent",
      entries: [
        { userId: ALICE, basisPoints: 5000 },
        { userId: BOB, basisPoints: 4000 },
      ],
    };
    expect(() => computeShares(10_000, split)).toThrow(/must add up to 100%, not 90%/);
  });
});

describe("split by weights", () => {
  it("divides in proportion", () => {
    const split: Split = {
      mode: "weights",
      entries: [
        { userId: ALICE, weight: 2 },
        { userId: BOB, weight: 1 },
      ],
    };
    expect(computeShares(9000, split)).toEqual([
      { userId: ALICE, amountCents: 6000 },
      { userId: BOB, amountCents: 3000 },
    ]);
  });

  it("reconciles when the weights do not divide evenly", () => {
    const split: Split = {
      mode: "weights",
      entries: [
        { userId: ALICE, weight: 1 },
        { userId: BOB, weight: 1 },
        { userId: CHARLIE, weight: 1 },
      ],
    };
    expect(sum(computeShares(10_001, split))).toBe(10_001);
  });

  it("refuses weights that are all zero", () => {
    const split: Split = {
      mode: "weights",
      entries: [
        { userId: ALICE, weight: 0 },
        { userId: BOB, weight: 0 },
      ],
    };
    expect(() => computeShares(1000, split)).toThrow(/above zero/);
  });

  it("refuses fractional weights", () => {
    const split: Split = {
      mode: "weights",
      entries: [
        { userId: ALICE, weight: 1.5 },
        { userId: BOB, weight: 1 },
      ],
    };
    expect(() => computeShares(1000, split)).toThrow(/whole number/);
  });
});

describe("converting a one-off split into a repeating one", () => {
  /**
   * A bill entered with percentages or exact amounts becomes a series stored
   * as proportional weights. These pin that the conversion changes nothing:
   * ticking "this repeats" must not quietly alter what anyone owes.
   */

  it("weights from basis points match the percentage split exactly", () => {
    const entries = [
      { userId: ALICE, basisPoints: 3333 },
      { userId: BOB, basisPoints: 3333 },
      { userId: CHARLIE, basisPoints: 3334 },
    ];

    for (const total of [10_000, 10_001, 24_755, 7, 99_999]) {
      const asPercent = computeShares(total, { mode: "percent", entries });
      const asWeights = computeShares(total, {
        mode: "weights",
        entries: entries.map((e) => ({ userId: e.userId, weight: e.basisPoints })),
      });
      expect(asWeights, `total ${total}`).toEqual(asPercent);
    }
  });

  it("weights from exact amounts reproduce them while the total is unchanged", () => {
    const entries = [
      { userId: ALICE, amountCents: 2500 },
      { userId: BOB, amountCents: 7500 },
    ];

    const asWeights = computeShares(10_000, {
      mode: "weights",
      entries: entries.map((e) => ({ userId: e.userId, weight: e.amountCents })),
    });

    expect(asWeights).toEqual(computeShares(10_000, { mode: "amount", entries }));
  });

  it("scales those proportions when a later amount differs", () => {
    // The same 25/75 division applied to a bill twice the size.
    const shares = computeShares(20_000, {
      mode: "weights",
      entries: [
        { userId: ALICE, weight: 2500 },
        { userId: BOB, weight: 7500 },
      ],
    });

    expect(shares).toEqual([
      { userId: ALICE, amountCents: 5000 },
      { userId: BOB, amountCents: 15_000 },
    ]);
  });
});

describe("guards on the total", () => {
  it("refuses zero and negative bills", () => {
    expect(() => computeShares(0, { mode: "single", userId: ALICE })).toThrow(MoneyError);
    expect(() => computeShares(-100, { mode: "single", userId: ALICE })).toThrow(MoneyError);
  });

  it("refuses fractional cents", () => {
    expect(() => computeShares(10.5, { mode: "single", userId: ALICE })).toThrow(
      /whole cents/,
    );
  });
});

describe("percent parsing", () => {
  it("reads whole and fractional percentages", () => {
    expect(parsePercent("50")).toBe(5000);
    expect(parsePercent("33.33")).toBe(3333);
    expect(parsePercent("100")).toBe(10_000);
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent(" 12.5% ")).toBe(1250);
  });

  it("rejects nonsense and anything over 100", () => {
    for (const bad of ["", "abc", "-5", "101", "33.333", "1e2"]) {
      expect(() => parsePercent(bad), bad).toThrow(MoneyError);
    }
  });
});
