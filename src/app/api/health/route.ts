import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness for the container healthcheck and for TrueNAS.
 *
 * Touches the database rather than just returning 200: a server that is up but
 * cannot reach its volume is not healthy, and that is the failure worth
 * catching on a NAS where the dataset may not have mounted yet.
 */
export async function GET() {
  try {
    getDb().get(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    return Response.json(
      { status: "error", detail: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
