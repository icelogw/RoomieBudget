import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { emailLog, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { layout, plain } from "./mail-templates";
import { sendMail } from "./mail";

/**
 * These talk to the Mailpit container from docker-compose.dev.yml, so they
 * exercise a real SMTP conversation rather than a mock. If Mailpit is not
 * running the suite skips them rather than failing — the rest of the tests
 * must still pass on a machine with no containers up.
 */

const MAILPIT_API = "http://localhost:8025/api/v1";
const SMTP_PORT = "1025";

let mailpitUp = false;
let db: Db;

async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT_API}/messages?limit=1`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function latestMessageTo(address: string) {
  const response = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${address}`)}`);
  if (!response.ok) return null;

  const body = (await response.json()) as { messages?: Array<{ ID: string }> };
  const id = body.messages?.[0]?.ID;
  if (!id) return null;

  const detail = await fetch(`${MAILPIT_API}/message/${id}`);
  return (await detail.json()) as {
    Subject: string;
    Text: string;
    HTML: string;
    From: { Address: string };
    To: Array<{ Address: string }>;
  };
}

beforeAll(async () => {
  mailpitUp = await mailpitAvailable();

  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = SMTP_PORT;
  process.env.SMTP_SECURE = "false";
  process.env.MAIL_FROM = "no-reply@roomiebudget.local";
});

beforeEach(() => {
  db = openDatabase(":memory:");
  db.insert(users)
    .values({ id: newId(), email: "a@example.com", name: "Alice", passwordHash: "x" })
    .run();
});

function message(to: string, dedupeKey: string) {
  const content = {
    heading: "Electricity — you owe $123.78",
    intro: "Alice paid $247.55 for Electricity. Your share is $123.78.",
    rows: [{ label: "Your share", value: "$123.78" }],
    button: { label: "Open the bill", url: "http://localhost:3000/bills/ABC" },
  };

  return {
    kind: "bill_created" as const,
    to,
    subject: "Electricity — $123.78",
    html: layout(content),
    text: plain(content),
    dedupeKey,
  };
}

describe("templates", () => {
  it("escapes anything that came from a person", () => {
    const html = layout({
      heading: 'Rent <script>alert("x")</script>',
      intro: "Fine & dandy",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Fine &amp; dandy");
  });

  it("always produces a plain-text alternative", () => {
    const text = plain({
      heading: "Electricity is overdue",
      intro: "Your share is $50.00.",
      rows: [{ label: "You owe", value: "$50.00" }],
      button: { label: "Settle it", url: "http://example.com/x" },
    });

    expect(text).toContain("Electricity is overdue");
    expect(text).toContain("You owe: $50.00");
    expect(text).toContain("http://example.com/x");
    expect(text).toContain("do not reply");
  });

  it("says it is a no-reply address", () => {
    const html = layout({ heading: "Anything", intro: "Anything" });
    expect(html).toContain("not monitored");
  });
});

describe("sending", () => {
  it("delivers a real message over SMTP", async ({ skip }) => {
    if (!mailpitUp) skip();

    const to = `deliver-${Date.now()}@example.com`;
    expect(await sendMail(db, message(to, `test:${to}`))).toBe("sent");

    const received = await latestMessageTo(to);
    expect(received?.Subject).toBe("Electricity — $123.78");
    expect(received?.From.Address).toBe("no-reply@roomiebudget.local");
    expect(received?.Text).toContain("do not reply");
  });

  it("records what it sent", async ({ skip }) => {
    if (!mailpitUp) skip();

    const to = `logged-${Date.now()}@example.com`;
    await sendMail(db, message(to, `test:${to}`));

    const [row] = db.select().from(emailLog).all();
    expect(row.toEmail).toBe(to);
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.error).toBeNull();
  });

  it("refuses to send the same thing twice", async ({ skip }) => {
    if (!mailpitUp) skip();

    const to = `dedupe-${Date.now()}@example.com`;
    const key = `test:${to}`;

    expect(await sendMail(db, message(to, key))).toBe("sent");
    expect(await sendMail(db, message(to, key))).toBe("duplicate");
    expect(await sendMail(db, message(to, key))).toBe("duplicate");

    // One log row, so one email — this is what stops a restart loop mailing
    // somebody the same overdue notice every half hour.
    expect(db.select().from(emailLog).all()).toHaveLength(1);
  });

  it("treats a different key as a different message", async ({ skip }) => {
    if (!mailpitUp) skip();

    const to = `keys-${Date.now()}@example.com`;
    expect(await sendMail(db, message(to, `week:0:${to}`))).toBe("sent");
    expect(await sendMail(db, message(to, `week:1:${to}`))).toBe("sent");

    expect(db.select().from(emailLog).all()).toHaveLength(2);
  });
});
