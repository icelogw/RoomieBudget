/**
 * Send one of every email the app produces to the local catcher, so they can
 * be read and compatibility-checked without waiting for a real bill to fall
 * due.
 *
 *   npm run mail:preview
 *
 * Requires the dev stack to be running, since it posts to Mailpit on :1025.
 */

import nodemailer from "nodemailer";

import { APP_NAME } from "@/lib/app";
import { formatCalendarDate, todayIso, addDays } from "@/lib/dates";
import { formatAud } from "@/lib/money";
import { layout, plain } from "@/server/mail-templates";

const HOST = process.env.SMTP_HOST ?? "localhost";
const PORT = Number(process.env.SMTP_PORT ?? 1025);
const FROM = process.env.MAIL_FROM ?? "no-reply@roomiebudget.local";
const TO = process.env.PREVIEW_TO ?? "preview@example.com";

const today = todayIso();

const samples = [
  {
    subject: `Electricity — ${formatAud(12_378)}`,
    content: {
      heading: `Electricity — you owe ${formatAud(12_378)}`,
      intro: `Ash Nguyen paid ${formatAud(24_755)} for Electricity. Your share is ${formatAud(12_378)}.`,
      rows: [
        { label: "Bill total", value: formatAud(24_755) },
        { label: "Your share", value: formatAud(12_378) },
        { label: "Due", value: formatCalendarDate(addDays(today, 14)) },
        { label: "Paid by", value: "Ash Nguyen" },
      ],
      button: { label: "Open the bill", url: "http://localhost:3000/bills/EXAMPLE" },
    },
  },
  {
    subject: `${APP_NAME}: Rent due ${formatCalendarDate(addDays(today, 3))}`,
    content: {
      heading: "Rent is due in 3 days",
      intro: `Your share of Rent is ${formatAud(64_000)}.`,
      rows: [
        { label: "You owe", value: formatAud(64_000) },
        { label: "Due", value: formatCalendarDate(addDays(today, 3)) },
      ],
      button: { label: "Open the bill", url: "http://localhost:3000/bills/EXAMPLE" },
    },
  },
  {
    subject: `Overdue: Water rates — ${formatAud(31_480)}`,
    content: {
      heading: "Water rates is 9 days overdue",
      intro: `Your share of Water rates was due on ${formatCalendarDate(addDays(today, -9))} and is still outstanding.`,
      rows: [
        { label: "You owe", value: formatAud(31_480) },
        { label: "Was due", value: formatCalendarDate(addDays(today, -9)) },
      ],
      button: { label: "Settle it", url: "http://localhost:3000/bills/EXAMPLE" },
      footnote: "Already paid? Mark it off and this will stop.",
    },
  },
  {
    subject: `Ash Nguyen has invited you to ${APP_NAME}`,
    content: {
      heading: `Ash Nguyen has invited you to ${APP_NAME}`,
      intro:
        "Mia, this is where your household keeps track of shared bills and who owes what. Follow the link to pick a password and join.",
      button: {
        label: "Join the household",
        url: "http://localhost:3000/invite/EXAMPLE-TOKEN",
      },
      footnote: "The link works once and expires in seven days.",
    },
  },
];

async function main() {
  const transport = nodemailer.createTransport({ host: HOST, port: PORT, secure: false });

  for (const sample of samples) {
    await transport.sendMail({
      from: { name: APP_NAME, address: FROM },
      to: TO,
      subject: sample.subject,
      text: plain(sample.content),
      html: layout(sample.content),
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
    });
    console.log(`sent: ${sample.subject}`);
  }

  console.log("");
  console.log("Read them at http://localhost:8025");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
