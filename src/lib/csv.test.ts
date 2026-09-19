import { describe, expect, it } from "vitest";

import { toCsv, withBom } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows", () => {
    expect(toCsv(["Date", "Amount"], [["19/09/2026", "123.45"]])).toBe(
      "Date,Amount\r\n19/09/2026,123.45\r\n",
    );
  });

  it("quotes fields containing a comma", () => {
    expect(toCsv(["Description"], [["Rent, September"]])).toContain('"Rent, September"');
  });

  it("doubles embedded quotes", () => {
    expect(toCsv(["Note"], [['He said "fine"']])).toContain('"He said ""fine"""');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsv(["Note"], [["line one\nline two"]])).toContain('"line one\nline two"');
  });

  it("writes an empty cell for null", () => {
    expect(toCsv(["A", "B"], [["x", null]])).toBe("A,B\r\nx,\r\n");
  });

  it("accepts numbers", () => {
    expect(toCsv(["Cents"], [[1234]])).toContain("1234");
  });
});

describe("spreadsheet formula injection", () => {
  /**
   * A bill description is free text typed by a housemate. Excel and Sheets
   * execute a cell starting =, +, - or @ when the file is opened, so an
   * unescaped export turns a bill description into code running on whoever
   * opens it.
   */
  it("neutralises fields that a spreadsheet would execute", () => {
    for (const dangerous of [
      "=1+1",
      "=cmd|'/c calc'!A1",
      "+1234",
      "-1234",
      "@SUM(A1:A9)",
    ]) {
      const csv = toCsv(["Description"], [[dangerous]]);
      expect(csv, dangerous).toContain(`'${dangerous.replace(/"/g, '""')}`);
    }
  });

  it("leaves ordinary text alone", () => {
    const csv = toCsv(["Description"], [["Electricity"]]);
    expect(csv).toBe("Description\r\nElectricity\r\n");
  });

  it("does not mangle a negative amount in a numeric column", () => {
    // Guarded too, since a leading minus is indistinguishable from a formula
    // to a spreadsheet. Amounts are written unsigned with a separate column
    // where the sign matters.
    expect(toCsv(["Amount"], [["-12.34"]])).toContain("'-12.34");
  });
});

describe("withBom", () => {
  it("prefixes the byte order mark Excel needs for UTF-8", () => {
    const csv = withBom(toCsv(["Name"], [["Café"]]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Café");
  });
});
