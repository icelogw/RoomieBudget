import { eq } from "drizzle-orm";
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

export type MailKind =
  | "invite"
  | "bill_created"
  | "bill_due_soon"
  | "bill_overdue"
  | "bill_settled"
  | "weekly_summary";

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
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

export type SendResult = "sent" | "duplicate" | "disabled" | "failed";

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

    db.update(emailLog)
      .set({ error: message.slice(0, 500) })
      .where(eq(emailLog.id, logId))
      .run();
    return "failed";
  }
}
