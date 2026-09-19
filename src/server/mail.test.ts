import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Db } from "@/db/connection";
import { emailLog, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { layout, plain } from "./mail-templates";
import { sendMail, setMailTransport } from "./mail";

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

describe("a failed send", () => {
  /**
   * Stub transport rather than a real relay: the point is the ordering around
   * the dedupe key, and pointing SMTP at a closed port to force a failure
   * would make the test slow and dependent on the network being absent.
   */
  function flaky(failures: number) {
    let calls = 0;
    return {
      calls: () => calls,
      transport: {
        async sendMail() {
          calls += 1;
          if (calls <= failures) throw new Error("ECONNREFUSED 127.0.0.1:587");
          return { messageId: "stub" };
        },
      },
    };
  }

  afterEach(() => setMailTransport(null));

  it("does not consume the key, so the next attempt goes through", async () => {
    const stub = flaky(1);
    setMailTransport(stub.transport as never);

    const first = await sendMail(db, message("retry@example.com", "bill_created:B1:U1"));
    expect(first).toBe("failed");

    const second = await sendMail(db, message("retry@example.com", "bill_created:B1:U1"));
    expect(second).toBe("sent");

    // Once overall: the failure delivered nothing, the retry delivered one.
    expect(stub.calls()).toBe(2);
    expect(db.select().from(emailLog).all().filter((r) => r.sentAt !== null)).toHaveLength(1);
  });

  it("still refuses a genuine duplicate after a successful send", async () => {
    const stub = flaky(0);
    setMailTransport(stub.transport as never);

    expect(await sendMail(db, message("once@example.com", "bill_created:B2:U1"))).toBe("sent");
    expect(await sendMail(db, message("once@example.com", "bill_created:B2:U1"))).toBe(
      "duplicate",
    );

    expect(stub.calls()).toBe(1);
  });

  it("keeps the failure readable in the log", async () => {
    const stub = flaky(1);
    setMailTransport(stub.transport as never);

    await sendMail(db, message("kept@example.com", "bill_created:B3:U1"));

    // Operators are told to read this table when mail has not arrived, so the
    // attempt has to survive rather than being deleted.
    const [row] = db.select().from(emailLog).all();
    expect(row.error).toMatch(/ECONNREFUSED/);
    expect(row.sentAt).toBeNull();
    expect(row.dedupeKey).toContain("bill_created:B3:U1");
  });

  it("gives up on a message that keeps failing", async () => {
    const stub = flaky(Number.MAX_SAFE_INTEGER);
    setMailTransport(stub.transport as never);

    const key = "bill_created:B4:U1";
    for (let i = 0; i < 5; i++) {
      expect(await sendMail(db, message("doomed@example.com", key))).toBe("failed");
    }

    // A relay that is down for a week must not be retried every half hour for
    // a week.
    expect(await sendMail(db, message("doomed@example.com", key))).toBe("exhausted");
    expect(stub.calls()).toBe(5);
  });

  it("counts attempts per message, not across all of them", async () => {
    const stub = flaky(Number.MAX_SAFE_INTEGER);
    setMailTransport(stub.transport as never);

    for (let i = 0; i < 5; i++) {
      await sendMail(db, message("a@example.com", "bill_created:B5:U1"));
    }

    expect(await sendMail(db, message("b@example.com", "bill_created:B6:U1"))).toBe("failed");
  });
});
