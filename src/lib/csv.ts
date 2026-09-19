/**
 * CSV writing.
 *
 * Excel is the destination for most of these, which constrains the format
 * more than the RFC does: fields are quoted whenever they contain a comma,
 * quote or newline, quotes are doubled, and lines end with CRLF.
 *
 * The leading-apostrophe guard below is the one non-obvious part, and it
 * matters: a spreadsheet treats a field beginning =, +, - or @ as a formula,
 * so a bill described as "=rent owing" would execute on open. That is a real
 * attack against whoever opens the export, not a formatting nicety.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeField(value: string): string {
  // Neutralise anything a spreadsheet would run, without altering the text
  // itself: a leading apostrophe is how spreadsheets mark a literal string.
  const safe = FORMULA_START.test(value) ? `'${value}` : value;

  return NEEDS_QUOTING.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(escapeField).join(",")];

  for (const row of rows) {
    lines.push(
      row
        .map((cell) => (cell === null || cell === undefined ? "" : escapeField(String(cell))))
        .join(","),
    );
  }

  // CRLF, and a trailing newline so the file ends cleanly.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Excel assumes the system codepage unless a UTF-8 byte order mark says
 * otherwise, which is how "Café" becomes "CafÃ©". Every export carries one.
 */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}
