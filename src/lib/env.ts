import { z } from "zod";

/**
 * Server-side configuration. Never import this from a client component — it
 * reads secrets.
 *
 * Validation is deliberately lazy. `next build` evaluates every module with
 * NODE_ENV=production while tracing routes, so validating at import time would
 * demand a real SESSION_SECRET during the image build and bake it into the
 * layer. Configuration belongs to the running container, not to the image.
 *
 * Failing fast is still wanted, just at the right moment: instrumentation.ts
 * calls getEnv() when the server boots, so a misconfigured container dies on
 * startup rather than on somebody's first login.
 */

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Absolute URL the app is reached at, used for links in emails. */
  APP_URL: z.url().default("http://localhost:3000"),

  /** Directory holding the SQLite file. Mount this as a volume. */
  DATA_DIR: z.string().min(1).default("./data"),

  /** Signs session cookies. Rotating it logs everyone out. */
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters").optional(),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  /** The no-reply address bills are sent from. */
  MAIL_FROM: z.email().default("no-reply@localhost"),

  /** Household timezone. The container's TZ, used for calendar-date maths. */
  TZ: z.string().min(1).default("Australia/Sydney"),

  /**
   * Ask GitHub, anonymously, whether a newer release exists. Off makes the
   * app contact nothing outside the house at all.
   */
  UPDATE_CHECK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  /** Where to look for releases. Only useful if you forked it. */
  UPDATE_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Must look like owner/repo")
    .default("icelogw/RoomieBudget"),
});

export type Env = z.infer<typeof schema> & { SESSION_SECRET: string };

const DEV_SECRET = "development-secret-not-for-production-use";

let cached: Env | undefined;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const value = parsed.data;

  if (value.NODE_ENV === "production" && !value.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is required in production.\n" +
        "Generate one with:  openssl rand -base64 48",
    );
  }

  return { ...value, SESSION_SECRET: value.SESSION_SECRET ?? DEV_SECRET };
}

export function getEnv(): Env {
  if (!cached) cached = load();
  return cached;
}

/** Email is optional — without SMTP configured the app still works, silently. */
export function isMailEnabled(): boolean {
  return Boolean(getEnv().SMTP_HOST);
}
