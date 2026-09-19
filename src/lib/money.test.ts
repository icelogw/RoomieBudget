import { describe, expect, it } from "vitest";
import {
  MoneyError,
  assertSharesCoverTotal,
  formatAud,
  formatCents,
  parseAmount,
  splitByWeights,
  splitEvenly,
} from "./money";

describe("parseAmount", () => {
  it("reads plain and decorated input", () => {
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("12.3")).toBe(1230);
    expect(parseAmount("12.34")).toBe(1234);
    expect(parseAmount("$1,234.56")).toBe(123456);
    expect(parseAmount("  0.05 ")).toBe(5);
    expect(parseAmount("-8.10")).toBe(-810);
    expect(parseAmount("1,234,567.89")).toBe(123456789);
  });

  it("rejects anything it cannot represent exactly", () => {
    const bad = ["", "abc", "1.234", "1.2.3", "$", "1e3", "- 5", "1 234.56", "1$2", "$"];
    const badGrouping = ["1,", ",5", "1,23", "12,3456", "1,234,", "1,2,3"];
    for (const input of [...bad, ...badGrouping]) {
      expect(() => parseAmount(input), input).toThrow(MoneyError);
    }
  });
});

describe("formatting", () => {
  it("pads cents and groups thousands", () => {
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(123456)).toBe("1234.56");
    expect(formatAud(5)).toBe("$0.05");
    expect(formatAud(123456)).toBe("$1,234.56");
  });

  it("puts the minus sign outside the dollar sign", () => {
    expect(formatAud(-810)).toBe("-$8.10");
  });
});

describe("splitEvenly", () => {
  it("hands leftover cents out one at a time", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1, 3)).toEqual([1, 0, 0]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
  });

  it("always sums to the original total", () => {
    for (let total = 0; total < 2000; total++) {
      for (let people = 1; people <= 7; people++) {
        const shares = splitEvenly(total, people);
        const sum = shares.reduce((a, b) => a + b, 0);
        expect(sum, `${total} across ${people}`).toBe(total);
      }
    }
  });

  it("never differs by more than a cent between people", () => {
    const shares = splitEvenly(10_000_01, 7);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("refuses a nonsensical number of people", () => {
    expect(() => splitEvenly(100, 0)).toThrow(MoneyError);
    expect(() => splitEvenly(100, 2.5)).toThrow(MoneyError);
  });
});

describe("splitByWeights", () => {
  it("allocates in proportion to the weights", () => {
    expect(splitByWeights(10000, [1, 1, 2])).toEqual([2500, 2500, 5000]);
    expect(splitByWeights(10000, [5000, 5000])).toEqual([5000, 5000]);
  });

  it("handles basis-point percentages that do not divide evenly", () => {
    const shares = splitByWeights(10000, [3333, 3333, 3334]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("gives a zero-weight person nothing", () => {
    expect(splitByWeights(999, [0, 1])).toEqual([0, 999]);
  });

  it("is deterministic across repeated calls", () => {
    const once = splitByWeights(1000, [1, 1, 1]);
    const twice = splitByWeights(1000, [1, 1, 1]);
    expect(once).toEqual(twice);
  });

  it("preserves sign for credits", () => {
    expect(splitByWeights(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it("rejects weights it cannot compute exactly", () => {
    expect(() => splitByWeights(100, [])).toThrow(MoneyError);
    expect(() => splitByWeights(100, [0, 0])).toThrow(MoneyError);
    expect(() => splitByWeights(100, [1.5, 1])).toThrow(MoneyError);
    expect(() => splitByWeights(100, [-1, 3])).toThrow(MoneyError);
  });
});

describe("assertSharesCoverTotal", () => {
  it("accepts an exact cover", () => {
    expect(() => assertSharesCoverTotal([2500, 7500], 10000)).not.toThrow();
  });

  it("names the shortfall in the error", () => {
    expect(() => assertSharesCoverTotal([2500, 7000], 10000)).toThrow(/\$5\.00 short of/);
    expect(() => assertSharesCoverTotal([2500, 8000], 10000)).toThrow(/\$5\.00 over/);
  });
});
