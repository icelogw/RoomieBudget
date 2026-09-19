import { z } from "zod";

/**
 * Server-side configuration. Never import this from a client component — it
 * reads secrets.
 *
 * Validation is strict in production and forgiving in development, so a fresh
 * clone runs with no .env file at all but a misconfigured container fails
 * loudly at startup instead of halfway through sending an email.
 */

const isProduction = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Absolute URL the app is reached at, used for links in emails. */
  APP_URL: z.url().default("http://localhost:3000"),

  /** Directory holding the SQLite file. Mount this as a volume. */
  DATA_DIR: z.string().min(1).default("./data"),

  /** Signs session cookies. Rotating it logs everyone out. */
  SESSION_SECRET: isProduction
    ? z.string().min(32, "SESSION_SECRET must be at least 32 characters")
    : z.string().min(32).default("development-secret-not-for-production-use"),

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
});

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = load();

/** Email is optional — without SMTP configured the app still works, silently. */
export const mailEnabled = Boolean(env.SMTP_HOST);
