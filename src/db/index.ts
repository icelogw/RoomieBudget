import path from "node:path";

import { env } from "@/lib/env";
import { openDatabase, type Db } from "./connection";
import * as schema from "./schema";

// Next's dev server re-evaluates modules on every change. Without a global
// handle each reload would open another connection and leak file descriptors.
const globalForDb = globalThis as unknown as { db?: Db };

export const db =
  globalForDb.db ?? openDatabase(path.join(env.DATA_DIR, "roomiebudget.sqlite"));

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
