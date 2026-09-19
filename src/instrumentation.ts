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

  // What the process is actually in, which is not necessarily what TZ says.
  // Node reads TZ from the real environment at startup and nothing here can
  // change it afterwards, so reporting the configured value would be a claim
  // rather than an observation.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  console.log(
    `RoomieBudget starting — env=${env.NODE_ENV} tz=${timezone} data=${env.DATA_DIR} ` +
      `mail=${env.SMTP_HOST ? "on" : "off"}`,
  );

  if (timezone !== env.TZ) {
    console.warn(
      `TZ is configured as ${env.TZ} but this process is running in ${timezone}. ` +
        "Due dates and reminders will be worked out in " +
        `${timezone}. Pass TZ into the container to change it.`,
    );
  }
}
