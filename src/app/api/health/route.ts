import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { BUILT_AT, GIT_SHA, VERSION } from "@/lib/version";

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

    // The version is here as well as in the interface so a deployment can be
    // checked with curl, without signing in.
    return Response.json({
      status: "ok",
      version: VERSION,
      commit: GIT_SHA || undefined,
      builtAt: BUILT_AT || undefined,
    });
  } catch (error) {
    return Response.json(
      { status: "error", detail: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
