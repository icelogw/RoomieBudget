import { eq, like } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";

import type { Db } from "@/db/connection";
import { emailLog } from "@/db/schema";
import { APP_NAME } from "@/lib/app";
import { getEnv, isMailEnabled } from "@/lib/env";
import { newId } from "@/lib/ids";

/**
 * Outgoing email.
 *
 * Every message is a no-reply: the household has one address, nobody reads
 * replies to it, and the headers say so rather than leaving people to discover
 * it by writing back into a void.
 *
 * Email is optional. With no SMTP_HOST configured the app runs normally and
 * simply sends nothing — a self-hosted bill tracker should not be unusable
 * because a mail relay has not been set up yet.
 */

export type MailKind = "invite" | "bill_created" | "bill_due_soon" | "bill_overdue";

/** Only the one method is used, which keeps the test seam below honest. */
type MailTransport = Pick<Transporter, "sendMail">;

let transporter: Transporter | null = null;
let override: MailTransport | null = null;

/** Test seam. Pass null to go back to the configured relay. */
export function setMailTransport(transport: MailTransport | null): void {
  override = transport;
}

function getTransport(): MailTransport | null {
  if (override) return override;
  if (!isMailEnabled()) return null;
  if (transporter) return transporter;

  const env = getEnv();

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  return transporter;
}

export type SendInput = {
  kind: MailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Makes a message unique. The log has a unique index on it, so a retry, a
   * restart mid-send, or a reminder job running twice cannot mail the same
   * person the same thing again.
   */
  dedupeKey: string;
  entityId?: string | null;
};

export type SendResult = "sent" | "duplicate" | "disabled" | "failed" | "exhausted";

/**
 * How many times one message may fail before it is given up on.
 *
 * Without a bound, a relay that is down for a week would be retried every
 * half hour for a week. With one, a genuinely broken relay costs a handful of
 * attempts per message and then stops.
 */
const MAX_ATTEMPTS = 5;

/**
 * A failed attempt is kept, but under a key nobody will ask for again.
 *
 * The deployment notes tell operators to read email_log when mail has not
 * arrived, so deleting the row would hide exactly what they came to find. The
 * original key stays embedded so previous failures for a message can still be
 * counted.
 */
function failedKey(dedupeKey: string, logId: string): string {
  return `failed:${dedupeKey}:${logId}`;
}

/**
 * Claim the dedupe key before sending, not after.
 *
 * Writing the log row first means a crash between sending and logging can at
 * worst lose a record of a sent message; doing it the other way round risks
 * sending the same overdue notice every half hour forever.
 */
export async function sendMail(db: Db, input: SendInput): Promise<SendResult> {
  const transport = getTransport();
  if (!transport) return "disabled";

  const attempts = db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(like(emailLog.dedupeKey, `${failedKey(input.dedupeKey, "")}%`))
    .all().length;

  if (attempts >= MAX_ATTEMPTS) return "exhausted";

  const logId = newId();

  try {
    db.insert(emailLog)
      .values({
        id: logId,
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        toEmail: input.to,
        subject: input.subject,
        entityId: input.entityId ?? null,
      })
      .run();
  } catch (error) {
    // The unique index rejected it: this message has already been handled.
    if (/UNIQUE/i.test(error instanceof Error ? error.message : "")) return "duplicate";
    throw error;
  }

  const env = getEnv();

  try {
    await transport.sendMail({
      from: { name: APP_NAME, address: env.MAIL_FROM },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: {
        // Tells mail clients and other robots not to auto-reply, and stops
        // out-of-office replies bouncing around a mailbox nobody reads.
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
    });

    db.update(emailLog).set({ sentAt: new Date() }).where(eq(emailLog.id, logId)).run();

    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Email (${input.kind}) to ${input.to} failed:`, message);

    // Move the row aside so the real key is free again. A failed attempt must
    // not suppress the message permanently: bill_created and bill_due_soon are
    // one-shot keys, so a relay down for five minutes would otherwise lose
    // those notifications for good.
    db.update(emailLog)
      .set({ dedupeKey: failedKey(input.dedupeKey, logId), error: message.slice(0, 500) })
      .where(eq(emailLog.id, logId))
      .run();
    return "failed";
  }
}
