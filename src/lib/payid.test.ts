import { describe, expect, it } from "vitest";

import { formatPayId, normaliseMobile, validatePayId } from "./payid";

describe("normaliseMobile", () => {
  it("accepts the local form and stores it internationally", () => {
    expect(normaliseMobile("0412345678")).toEqual({ ok: true, value: "+61412345678" });
  });

  it("accepts the same number however it is spaced", () => {
    for (const input of ["0412 345 678", "0412-345-678", " 0412345678 ", "(04) 1234 5678"]) {
      expect(normaliseMobile(input), input).toEqual({ ok: true, value: "+61412345678" });
    }
  });

  it("accepts international form, with or without the plus", () => {
    expect(normaliseMobile("+61412345678")).toEqual({ ok: true, value: "+61412345678" });
    expect(normaliseMobile("61412345678")).toEqual({ ok: true, value: "+61412345678" });
  });

  it("rejects numbers that are not Australian mobiles", () => {
    const bad = [
      "0212345678", // Sydney landline
      "041234567", // one digit short
      "04123456789", // one digit long
      "1300123456", // service number
      "+64212345678", // New Zealand
      "0512345678", // no such prefix
      "abcdefghij",
      "",
    ];
    for (const input of bad) {
      expect(normaliseMobile(input).ok, input).toBe(false);
    }
  });

  it("compares equal however the same number was typed", () => {
    const forms = ["0412345678", "0412 345 678", "+61412345678", "61412345678"];
    const normalised = forms.map((f) => normaliseMobile(f));
    expect(new Set(normalised.map((r) => (r.ok ? r.value : "bad"))).size).toBe(1);
  });
});

describe("validatePayId", () => {
  it("lowercases email so it matches regardless of typing", () => {
    expect(validatePayId("email", "Alice@Example.COM")).toEqual({
      ok: true,
      value: "alice@example.com",
    });
  });

  it("rejects malformed email", () => {
    for (const bad of ["alice", "alice@", "@example.com", "alice@example", "a b@c.com"]) {
      expect(validatePayId("email", bad).ok, bad).toBe(false);
    }
  });

  it("asks for a value rather than silently storing nothing", () => {
    expect(validatePayId("email", "   ")).toEqual({
      ok: false,
      error: "Enter a PayID, or leave it blank",
    });
  });
});

describe("formatPayId", () => {
  it("shows a stored mobile back in local form", () => {
    expect(formatPayId("mobile", "+61412345678")).toBe("0412 345 678");
  });

  it("leaves email untouched", () => {
    expect(formatPayId("email", "alice@example.com")).toBe("alice@example.com");
  });
});
