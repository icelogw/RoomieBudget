import { and, eq, isNull, ne } from "drizzle-orm";

import type { Db } from "@/db/connection";
import { billShares, bills, users } from "@/db/schema";
import { APP_NAME } from "@/lib/app";
import { daysBetween, formatCalendarDate, todayIso } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { formatAud } from "@/lib/money";
import { layout, plain } from "./mail-templates";
import { sendMail } from "./mail";

/**
 * What the app emails, and when.
 *
 * Nothing here is sent to the person who fronted the money — they already
 * know. Notices go to whoever owes a share, and only while that share is
 * actually outstanding.
 */

/** Warn this many days before a bill falls due. */
const DUE_SOON_DAYS = 3;

function appUrl(path: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

type Recipient = { userId: string; name: string; email: string; amountCents: number };

/** Everyone who still owes something on a bill, excluding whoever paid it. */
function debtorsFor(db: Db, billId: string): Recipient[] {
  return db
    .select({
      userId: billShares.userId,
      name: users.name,
      email: users.email,
      amountCents: billShares.amountCents,
    })
    .from(billShares)
    .innerJoin(users, eq(billShares.userId, users.id))
    .innerJoin(bills, eq(billShares.billId, bills.id))
    .where(
      and(
        eq(billShares.billId, billId),
        isNull(billShares.settledAt),
        eq(users.isActive, true),
        ne(billShares.userId, bills.paidBy),
      ),
    )
    .all();
}

/**
 * Tell people a bill has been added and what they owe.
 *
 * Fire and forget: a mail relay being slow or down must not make adding a bill
 * fail or feel sluggish. Failures are logged and recorded in email_log.
 */
export function notifyBillCreated(db: Db, billId: string): void {
  void (async () => {
    try {
      const bill = db.select().from(bills).where(eq(bills.id, billId)).get();
      if (!bill || bill.voidedAt || bill.isDraft) return;

      const payer = bill.paidBy
        ? db.select().from(users).where(eq(users.id, bill.paidBy)).get()
        : null;

      for (const person of debtorsFor(db, billId)) {
        const content = {
          heading: `${bill.description} — you owe ${formatAud(person.amountCents)}`,
          intro: payer
            ? `${payer.name} paid ${formatAud(bill.totalCents)} for ${bill.description}. Your share is ${formatAud(person.amountCents)}.`
            : `A bill for ${bill.description} has been added. Your share is ${formatAud(person.amountCents)}.`,
          rows: [
            { label: "Bill total", value: formatAud(bill.totalCents) },
            { label: "Your share", value: formatAud(person.amountCents) },
            ...(bill.dueOn
              ? [{ label: "Due", value: formatCalendarDate(bill.dueOn) }]
              : []),
            ...(payer ? [{ label: "Paid by", value: payer.name }] : []),
          ],
          button: { label: "Open the bill", url: appUrl(`/bills/${billId}`) },
        };

        await sendMail(db, {
          kind: "bill_created",
          to: person.email,
          subject: `${bill.description} — ${formatAud(person.amountCents)}`,
          html: layout(content),
          text: plain(content),
          dedupeKey: `bill_created:${billId}:${person.userId}`,
          entityId: billId,
        });
      }
    } catch (error) {
      console.error("Bill notification failed:", error);
    }
  })();
}

export type ReminderResult = { dueSoon: number; overdue: number };

/**
 * Nudge people about bills coming due and bills already overdue.
 *
 * Called from the scheduler. Overdue notices repeat weekly rather than daily —
 * the dedupe key carries the week number, so a bill two weeks late has
 * produced two emails, not fourteen.
 */
export async function sendDueReminders(db: Db): Promise<ReminderResult> {
  const today = todayIso();
  const result: ReminderResult = { dueSoon: 0, overdue: 0 };

  const outstanding = db
    .select({
      billId: bills.id,
      description: bills.description,
      dueOn: bills.dueOn,
      totalCents: bills.totalCents,
      paidBy: bills.paidBy,
      shareUserId: billShares.userId,
      amountCents: billShares.amountCents,
      name: users.name,
      email: users.email,
    })
    .from(billShares)
    .innerJoin(bills, eq(billShares.billId, bills.id))
    .innerJoin(users, eq(billShares.userId, users.id))
    .where(
      and(
        isNull(billShares.settledAt),
        isNull(bills.voidedAt),
        eq(bills.isDraft, false),
        eq(users.isActive, true),
        ne(billShares.userId, bills.paidBy),
      ),
    )
    .all();

  for (const row of outstanding) {
    if (!row.dueOn) continue;

    const daysUntilDue = daysBetween(today, row.dueOn);

    // Not close enough to be worth an email yet.
    if (daysUntilDue > DUE_SOON_DAYS) continue;

    const overdue = daysUntilDue < 0;
    const daysLate = Math.abs(daysUntilDue);

    const content = overdue
      ? {
          heading: `${row.description} is ${daysLate} ${daysLate === 1 ? "day" : "days"} overdue`,
          intro: `Your share of ${row.description} was due on ${formatCalendarDate(row.dueOn)} and is still outstanding.`,
          rows: [
            { label: "You owe", value: formatAud(row.amountCents) },
            { label: "Was due", value: formatCalendarDate(row.dueOn) },
          ],
          button: { label: "Settle it", url: appUrl(`/bills/${row.billId}`) },
          footnote: "Already paid? Mark it off and this will stop.",
        }
      : {
          heading:
            daysUntilDue === 0
              ? `${row.description} is due today`
              : `${row.description} is due in ${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"}`,
          intro: `Your share of ${row.description} is ${formatAud(row.amountCents)}.`,
          rows: [
            { label: "You owe", value: formatAud(row.amountCents) },
            { label: "Due", value: formatCalendarDate(row.dueOn) },
          ],
          button: { label: "Open the bill", url: appUrl(`/bills/${row.billId}`) },
        };

    // Weekly buckets for overdue, one-off for the pre-due warning.
    const dedupeKey = overdue
      ? `overdue:${row.billId}:${row.shareUserId}:${Math.floor(daysLate / 7)}`
      : `due_soon:${row.billId}:${row.shareUserId}`;

    const sent = await sendMail(db, {
      kind: overdue ? "bill_overdue" : "bill_due_soon",
      to: row.email,
      subject: overdue
        ? `Overdue: ${row.description} — ${formatAud(row.amountCents)}`
        : `${APP_NAME}: ${row.description} due ${formatCalendarDate(row.dueOn)}`,
      html: layout(content),
      text: plain(content),
      dedupeKey,
      entityId: row.billId,
    });

    if (sent === "sent") {
      if (overdue) result.overdue += 1;
      else result.dueSoon += 1;
    }
  }

  return result;
}

/** Email an invite link, when mail is configured. */
export async function sendInviteEmail(
  db: Db,
  input: { inviteId: string; name: string; email: string; link: string; invitedBy: string },
): Promise<void> {
  const content = {
    heading: `${input.invitedBy} has invited you to ${APP_NAME}`,
    intro: `${input.name}, this is where your household keeps track of shared bills and who owes what. Follow the link to pick a password and join.`,
    button: { label: "Join the household", url: input.link },
    footnote: "The link works once and expires in seven days.",
  };

  await sendMail(db, {
    kind: "invite",
    to: input.email,
    subject: `${input.invitedBy} has invited you to ${APP_NAME}`,
    html: layout(content),
    text: plain(content),
    // Keyed on the link, so regenerating an invite sends a fresh email while
    // a repeat of the same one does not.
    dedupeKey: `invite:${input.inviteId}:${input.link.slice(-12)}`,
    entityId: input.inviteId,
  });
}
