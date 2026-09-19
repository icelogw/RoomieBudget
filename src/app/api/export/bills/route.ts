import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import { toCsv, withBom } from "@/lib/csv";
import { formatTimestamp, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { listBills } from "@/server/bills";

export const dynamic = "force-dynamic";

/**
 * Every bill share as one row, which is the shape a spreadsheet wants: one
 * line per person per bill, rather than a bill row with columns that grow
 * as housemates come and go.
 *
 * Amounts are written as plain decimal numbers with no currency symbol or
 * thousands separator, because "$1,234.56" imports as text and cannot be
 * summed. The currency has its own column instead.
 *
 * Dates go out as YYYY-MM-DD rather than the DD/MM/YYYY the interface uses.
 * A spreadsheet under a US locale reads 03/10/2026 as 3 October or 10 March
 * depending on nothing the file can control, and being wrong by seven months
 * without complaining is worse than looking unfamiliar. The stored form is
 * already YYYY-MM-DD, so this writes the column through unchanged.
 */
export async function GET() {
  // Authorisation here as everywhere else: a route handler is as reachable as
  // a page, and this one returns the household's entire financial history.
  await requireUser();

  const bills = listBills(getDb());

  const rows = bills.flatMap((bill) =>
    bill.shares.map((share) => [
      bill.issuedOn,
      bill.dueOn,
      bill.description,
      bill.category,
      "AUD",
      formatCents(bill.totalCents),
      bill.paidByName,
      share.name,
      formatCents(share.amountCents),
      share.settledAt ? "Paid" : "Outstanding",
      share.settledAt ? formatTimestamp(share.settledAt) : null,
      share.settledByName,
      bill.seriesId ? "Yes" : "No",
      bill.notes,
    ]),
  );

  const csv = withBom(
    toCsv(
      [
        "Issued",
        "Due",
        "Description",
        "Category",
        "Currency",
        "Bill total",
        "Paid by",
        "Person",
        "Their share",
        "Status",
        "Settled at",
        "Settled by",
        "Recurring",
        "Notes",
      ],
      rows,
    ),
  );

  const filename = `roomiebudget-bills-${todayIso()}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A financial export should not sit in a proxy or browser cache.
      "Cache-Control": "no-store",
    },
  });
}
