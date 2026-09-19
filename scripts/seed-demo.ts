/**
 * Fill a database with a plausible sharehouse so the interface can be judged
 * with real content in it rather than empty states.
 *
 * Writes to DATA_DIR, which must not be the real one — it wipes what is there
 * first so it can be re-run. The compose "demo" profile points it at
 * ./data-demo, kept well away from ./data.
 *
 *   DATA_DIR=./data-demo npx tsx scripts/seed-demo.ts
 */

import { rmSync } from "node:fs";
import path from "node:path";

import { openDatabase } from "@/db/connection";
import { billShares, bills, categories, settings, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { addDays, todayIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { createBill, setShareSettled } from "@/server/bills";
import { createSeries, generateDueBills } from "@/server/recurring";

const DATA_DIR = process.env.DATA_DIR ?? "./data-demo";
const PASSWORD = "demo-password";

if (path.resolve(DATA_DIR).endsWith(`${path.sep}data`)) {
  console.error("Refusing to seed over ./data — that is the real database.");
  process.exit(1);
}

async function main() {
  const file = path.join(DATA_DIR, "roomiebudget.sqlite");

  // Start clean so the demo is the same every time it is rebuilt.
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${file}${suffix}`, { force: true });
  }

  const db = openDatabase(file);
  const today = todayIso();
  const passwordHash = await hashPassword(PASSWORD);

  const ash = newId();
  const mia = newId();

  db.insert(users)
    .values([
      {
        id: ash,
        email: "ash@example.com",
        name: "Ash Nguyen",
        passwordHash,
        role: "admin",
        payId: "ash@example.com",
        payIdType: "email",
        paymentNote: "Up bank — reference your name please",
      },
      {
        id: mia,
        email: "mia@example.com",
        name: "Mia Patel",
        passwordHash,
        role: "member",
        payId: "+61412345678",
        payIdType: "mobile",
      },
    ])
    .run();

  db.insert(settings).values({ key: "household.name", value: "14 Rosslyn Street" }).run();

  // A couple of categories beyond the seeded defaults.
  for (const [i, name] of ["Takeaway", "Repairs"].entries()) {
    db.insert(categories)
      .values({ id: newId(), name, sortOrder: 100 + i })
      .run();
  }

  const both = [ash, mia];

  // --- Recurring: rent every fortnight, power quarterly with a varying amount
  createSeries(db, {
    createdBy: ash,
    paidBy: ash,
    description: "Rent",
    category: "Rent",
    amountMode: "fixed",
    totalCents: 128_000,
    frequency: "fortnightly",
    anchorDate: addDays(today, -28),
    dueOffsetDays: 5,
    splitMode: "even",
    participants: both.map((userId) => ({ userId, weight: 1 })),
  });

  createSeries(db, {
    createdBy: mia,
    paidBy: mia,
    description: "Electricity",
    category: "Utilities",
    amountMode: "prompt",
    frequency: "quarterly",
    anchorDate: addDays(today, -2),
    dueOffsetDays: 21,
    splitMode: "even",
    participants: both.map((userId) => ({ userId, weight: 1 })),
  });

  // Issues the rent that has fallen due so far, and the power draft.
  generateDueBills(db, { today });

  // --- One-off bills, spread across the last month
  const oneOffs: Array<Parameters<typeof createBill>[1] & { settle?: boolean }> = [
    {
      createdBy: ash,
      paidBy: ash,
      description: "Internet — September",
      category: "Internet",
      totalCents: 8900,
      issuedOn: addDays(today, -21),
      dueOn: addDays(today, -7),
      split: { mode: "even", userIds: both },
    },
    {
      createdBy: mia,
      paidBy: mia,
      description: "Woolworths shop",
      category: "Groceries",
      totalCents: 14_235,
      issuedOn: addDays(today, -12),
      dueOn: addDays(today, 2),
      notes: "Mostly shared, but the oat milk is Mia's.",
      split: { mode: "even", userIds: both },
      settle: true,
    },
    {
      createdBy: ash,
      paidBy: ash,
      description: "Plumber — kitchen tap",
      category: "Repairs",
      totalCents: 24_750,
      issuedOn: addDays(today, -9),
      dueOn: addDays(today, 5),
      split: { mode: "even", userIds: both },
    },
    {
      createdBy: mia,
      paidBy: mia,
      description: "Replacement window — cricket ball",
      category: "Repairs",
      totalCents: 18_000,
      issuedOn: addDays(today, -6),
      dueOn: addDays(today, 8),
      notes: "Ash's ball, Ash's window.",
      split: { mode: "single", userId: ash },
    },
    {
      createdBy: ash,
      paidBy: ash,
      description: "Thai takeaway",
      category: "Takeaway",
      totalCents: 6850,
      issuedOn: addDays(today, -4),
      split: {
        mode: "amount",
        entries: [
          { userId: ash, amountCents: 3200 },
          { userId: mia, amountCents: 3650 },
        ],
      },
    },
    {
      createdBy: mia,
      paidBy: mia,
      description: "Water rates",
      category: "Utilities",
      totalCents: 31_480,
      issuedOn: addDays(today, -2),
      dueOn: addDays(today, 12),
      split: {
        mode: "percent",
        entries: [
          { userId: ash, basisPoints: 4000 },
          { userId: mia, basisPoints: 6000 },
        ],
      },
    },
  ];

  for (const { settle, ...input } of oneOffs) {
    const billId = createBill(db, input);

    if (settle) {
      const shares = db.select().from(billShares).all().filter((s) => s.billId === billId);
      for (const share of shares) {
        setShareSettled(db, { shareId: share.id, actorId: ash, settled: true });
      }
    }
  }

  const billCount = db.select().from(bills).all().length;
  const outstanding = db
    .select()
    .from(billShares)
    .all()
    .filter((s) => s.settledAt === null).length;

  console.log(`Seeded ${DATA_DIR}`);
  console.log(`  ${billCount} bills, ${outstanding} shares outstanding`);
  console.log("");
  console.log("  Sign in with either:");
  console.log(`    ash@example.com  /  ${PASSWORD}   (admin)`);
  console.log(`    mia@example.com  /  ${PASSWORD}   (member)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
