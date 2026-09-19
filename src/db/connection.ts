import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type Db = ReturnType<typeof openDatabase>;

/**
 * Open a database, apply pragmas, and bring it up to the current migration.
 *
 * Kept separate from the app singleton so tests can open their own throwaway
 * database rather than sharing the one the dev server is holding open.
 */
export function openDatabase(file: string) {
  if (file !== ":memory:") {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  const sqlite = new Database(file);

  // SQLite ships with foreign key enforcement OFF, and it is per-connection,
  // not per-database. Without this line every FOREIGN KEY in the schema is
  // decorative and orphaned rows accumulate silently.
  sqlite.pragma("foreign_keys = ON");

  // Write-ahead logging lets the reminder job write while someone is reading a
  // page, instead of the two blocking each other.
  if (file !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }

  // Durable enough: WAL + NORMAL survives application crashes, and only risks
  // the most recent transaction if the whole NAS loses power mid-write.
  sqlite.pragma("synchronous = NORMAL");

  // Wait rather than throwing SQLITE_BUSY the instant two writes overlap.
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  // Migrating on open suits a self-hosted app: pulling a new image and
  // restarting is the whole upgrade procedure, with no separate migrate step
  // to forget.
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  return db;
}
