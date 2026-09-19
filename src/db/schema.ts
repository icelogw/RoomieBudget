import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Two conventions run through this schema.
 *
 * Calendar dates — a bill's issue and due dates — are stored as TEXT in
 * "YYYY-MM-DD" form, not as timestamps. A due date is a date on the household's
 * wall calendar, not an instant in time: rent due on the 1st is due on the 1st
 * regardless of UTC offset or daylight saving. Storing these as epoch millis is
 * how apps end up showing "due 31/03" to one person and "due 01/04" to another.
 *
 * Event times — when a row was created, when a bill was settled — are genuine
 * instants, and are stored as epoch milliseconds.
 *
 * Amounts are always integer cents. See lib/money.ts.
 */

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),

    // How this person prefers to be paid back. PayID only — the app
    // deliberately does not store BSB or account numbers.
    payId: text("pay_id"),
    payIdType: text("pay_id_type", { enum: ["email", "mobile"] }),
    paymentNote: text("payment_note"),

    // Deactivated rather than deleted: a departed housemate still appears on
    // the bills they were part of, and those records must not lose their name.
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

    ...timestamps,
  },
  (t) => [unique("users_email_unique").on(t.email)],
);

/**
 * Pending invitations. Only the hash of the invite token is stored, so a copy
 * of the database does not hand over working invite links.
 */
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    unique("invites_token_hash_unique").on(t.tokenHash),
    index("invites_email_idx").on(t.email),
  ],
);

/**
 * Sessions are server-side. The row id is the SHA-256 of the cookie token, so
 * the database never holds a value that could be replayed as a login.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const recurringSeries = sqliteTable(
  "recurring_series",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    category: text("category"),

    // "fixed" generates the bill outright. "prompt" generates it as a draft
    // with no amount, for bills that vary — a power bill is never the same
    // twice, and guessing it would be worse than asking.
    amountMode: text("amount_mode", { enum: ["fixed", "prompt"] })
      .notNull()
      .default("fixed"),
    totalCents: integer("total_cents"),

    frequency: text("frequency", {
      enum: ["weekly", "fortnightly", "monthly", "quarterly", "yearly"],
    }).notNull(),

    // First occurrence, and the date the cadence is measured from.
    anchorDate: text("anchor_date").notNull(),
    // Next occurrence still to be generated. Advances as bills are created.
    nextIssueOn: text("next_issue_on").notNull(),
    // Bill falls due this many days after it is issued.
    dueOffsetDays: integer("due_offset_days").notNull().default(14),

    splitMode: text("split_mode", { enum: ["even", "weights", "single"] })
      .notNull()
      .default("even"),
    // JSON: [{ userId, weight }]. Weights are integers; see lib/money.ts.
    splitConfig: text("split_config").notNull(),

    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),

    // Who fronts the money each time this series issues a bill. Usually the
    // person who set it up, but rent might come out of the other account.
    paidBy: text("paid_by").references(() => users.id),

    ...timestamps,
  },
  (t) => [index("recurring_next_issue_idx").on(t.isActive, t.nextIssueOn)],
);

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    category: text("category"),
    totalCents: integer("total_cents").notNull(),
    notes: text("notes"),

    issuedOn: text("issued_on").notNull(),
    dueOn: text("due_on"),

    // Set when generated from a series with amountMode "prompt".
    isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),

    seriesId: text("series_id").references(() => recurringSeries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),

    // Who actually fronted the money. Everyone else on the bill owes them
    // their share, which is what makes a netted balance meaningful. Nullable
    // only because the column was added after the first release; every bill
    // written since sets it, and older rows were backfilled from created_by.
    paidBy: text("paid_by").references(() => users.id),

    // Bills are voided, never deleted. A financial record that can vanish
    // without trace is not a record, and "who cancelled that?" is a question
    // housemates genuinely ask.
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    voidedBy: text("voided_by").references(() => users.id),
    voidReason: text("void_reason"),

    ...timestamps,
  },
  (t) => [
    index("bills_due_idx").on(t.dueOn),
    index("bills_issued_idx").on(t.issuedOn),
    index("bills_series_idx").on(t.seriesId),

    // One bill per series per issue date, enforced by the database rather
    // than by the generator remembering to check. SQLite treats NULLs as
    // distinct in a unique index, so manually entered bills — which have no
    // series — are unaffected.
    uniqueIndex("bills_series_issue_unique").on(t.seriesId, t.issuedOn),
  ],
);

export const billShares = sqliteTable(
  "bill_shares",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),

    // Snapshot taken when the bill was split. Never recomputed.
    amountCents: integer("amount_cents").notNull(),

    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
    // Either party may settle, so record which one did.
    settledBy: text("settled_by").references(() => users.id),
    settleNote: text("settle_note"),

    ...timestamps,
  },
  (t) => [
    unique("bill_shares_bill_user_unique").on(t.billId, t.userId),
    index("bill_shares_user_outstanding_idx").on(t.userId, t.settledAt),
  ],
);

/**
 * Every email the app decided to send. `dedupeKey` is what stops a restart
 * loop from mailing the same overdue notice six times.
 */
export const emailLog = sqliteTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    kind: text("kind", {
      enum: [
        "invite",
        "bill_created",
        "bill_due_soon",
        "bill_overdue",
        "bill_settled",
        "weekly_summary",
      ],
    }).notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    entityId: text("entity_id"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    error: text("error"),
    createdAt: timestamps.createdAt,
  },
  (t) => [unique("email_log_dedupe_unique").on(t.dedupeKey)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    // JSON blob of whatever context the action needs.
    detail: text("detail"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);

/**
 * The category list behind the dropdown on a bill.
 *
 * Bills keep their category as plain text rather than a foreign key: it is a
 * snapshot of what was chosen at the time, so renaming or deleting a category
 * later cannot rewrite history or orphan an old bill.
 */
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Manual ordering, so the ones a household uses most can sit at the top.
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("categories_name_unique").on(t.name)],
);

/** Household-level preferences, editable from the UI. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamps.updatedAt,
});

export type Category = typeof categories.$inferSelect;
export type User = typeof users.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillShare = typeof billShares.$inferSelect;
export type RecurringSeries = typeof recurringSeries.$inferSelect;
export type Session = typeof sessions.$inferSelect;
