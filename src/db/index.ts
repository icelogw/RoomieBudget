import path from "node:path";

import { getEnv } from "@/lib/env";
import { openDatabase, type Db } from "./connection";
import * as schema from "./schema";

// Next's dev server re-evaluates modules on every change. Without a global
// handle each reload would open another connection and leak file descriptors.
const globalForDb = globalThis as unknown as { db?: Db };

/**
 * Open the database on first use, not on import.
 *
 * `next build` imports every module to trace and prerender routes. Connecting
 * at import time would mean the build opens SQLite and runs migrations against
 * whatever DATA_DIR happens to be set during the image build — a directory
 * that is not the mounted volume, and may not be writable at all.
 */
export function getDb(): Db {
  if (!globalForDb.db) {
    globalForDb.db = openDatabase(path.join(getEnv().DATA_DIR, "roomiebudget.sqlite"));
  }
  return globalForDb.db;
}

export { schema };
