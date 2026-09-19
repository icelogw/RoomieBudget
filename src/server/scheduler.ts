import type { Db } from "@/db/connection";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { generateDueBills } from "./recurring";

/**
 * Background work, run in-process.
 *
 * A polling loop rather than cron: the generator is keyed on calendar dates
 * and is safe to run repeatedly, so "check every half hour whether anything is
 * due" needs no scheduler to be correct, and a container that was switched off
 * catches up the moment it starts rather than waiting for the next cron slot.
 *
 * In-process rather than a second container because the work is a few
 * milliseconds of SQLite every half hour. A sidecar would double the moving
 * parts on the NAS for no benefit.
 *
 * The database is passed in rather than imported. Importing it here would put
 * better-sqlite3 in the module graph of whatever starts the scheduler, and
 * anything reachable from instrumentation.ts is compiled for the edge and
 * browser runtimes too — where 'fs' does not exist and the build fails.
 */

const INTERVAL_MS = 30 * 60 * 1000;

let started = false;

function tick(db: Db) {
  try {
    const result = generateDueBills(db);
    if (result.billsCreated > 0) {
      console.log(
        `Recurring: issued ${result.billsCreated} bill(s) from ` +
          `${result.seriesProcessed} series`,
      );
    }
  } catch (error) {
    // Never throw out of the timer: an unhandled rejection here would take the
    // server down over a background job.
    console.error("Recurring bill generation failed:", error);
  }

  try {
    const removed = deleteExpiredSessions(db);
    if (removed > 0) console.log(`Sessions: cleared ${removed} expired`);
  } catch (error) {
    console.error("Session cleanup failed:", error);
  }
}

export function startScheduler(db: Db) {
  if (started) return;
  started = true;

  // Run once at startup so a restart is itself the catch-up.
  tick(db);

  // unref so a pending timer never keeps the process alive during shutdown.
  setInterval(() => tick(db), INTERVAL_MS).unref();

  console.log(`Scheduler started — checking every ${INTERVAL_MS / 60_000} minutes`);
}
