/**
 * Runs once when the server starts, in the running container rather than
 * during the build. Validating configuration here means a missing
 * SESSION_SECRET stops the container immediately, with a message naming the
 * variable, instead of surfacing as a failed login days later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("@/lib/env");
  const env = getEnv();

  console.log(
    `RoomieBudget starting — env=${env.NODE_ENV} tz=${env.TZ} data=${env.DATA_DIR} ` +
      `mail=${env.SMTP_HOST ? "on" : "off"}`,
  );
}
