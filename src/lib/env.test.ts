import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

/**
 * The environment `docker compose up` actually produces from a .env copied
 * out of .env.example with only SESSION_SECRET filled in.
 *
 * Compose substitutes `${SMTP_HOST:-}` into an empty string rather than
 * leaving the variable out, so the container receives "" where a reader of
 * .env.example would expect "unset". That difference is what made the
 * documented quickstart crash-loop.
 */
const COMPOSE_QUICKSTART = {
  NODE_ENV: "production",
  SESSION_SECRET: "a".repeat(48),
  APP_URL: "http://localhost:3000",
  TZ: "Australia/Sydney",
  DATA_DIR: "/data",
  SMTP_HOST: "",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MAIL_FROM: "no-reply@roomiebudget.local",
  UPDATE_CHECK: "true",
  UPDATE_REPO: "icelogw/RoomieBudget",
};

describe("the documented quickstart", () => {
  it("starts with only SESSION_SECRET filled in", () => {
    expect(() => parseEnv(COMPOSE_QUICKSTART)).not.toThrow();
  });

  it("runs without email rather than refusing to start", () => {
    const env = parseEnv(COMPOSE_QUICKSTART);
    expect(env.SMTP_HOST).toBeUndefined();
  });
});

describe("blank variables", () => {
  /**
   * Leaving a line blank in .env is how an operator says "I do not want
   * this", and every optional variable has to read it that way — not just
   * the one that happened to be reported.
   */
  it("treats an empty string as absent for every optional variable", () => {
    const env = parseEnv({
      ...COMPOSE_QUICKSTART,
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    });

    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it("falls back to the default when a variable with one is blank", () => {
    const env = parseEnv({ ...COMPOSE_QUICKSTART, TZ: "", APP_URL: "", SMTP_PORT: "" });

    expect(env.TZ).toBe("Australia/Sydney");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SMTP_PORT).toBe(587);
  });

  it("still rejects a blank SESSION_SECRET in production", () => {
    expect(() => parseEnv({ ...COMPOSE_QUICKSTART, SESSION_SECRET: "" })).toThrow(
      /SESSION_SECRET/,
    );
  });
});

describe("defaults", () => {
  /**
   * A default that its own validator rejects is invisible until somebody
   * passes the documented value in explicitly, which is exactly what compose
   * does. Every default is therefore checked against the schema.
   */
  it("accepts its own documented defaults when passed in explicitly", () => {
    const fromDefaults = parseEnv({ SESSION_SECRET: "a".repeat(48) });

    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "a".repeat(48),
        APP_URL: fromDefaults.APP_URL,
        TZ: fromDefaults.TZ,
        DATA_DIR: fromDefaults.DATA_DIR,
        MAIL_FROM: fromDefaults.MAIL_FROM,
        SMTP_PORT: String(fromDefaults.SMTP_PORT),
        UPDATE_REPO: fromDefaults.UPDATE_REPO,
      }),
    ).not.toThrow();
  });
});

describe("validation that must survive", () => {
  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnv({ ...COMPOSE_QUICKSTART, APP_URL: "not-a-url" })).toThrow();
  });

  it("rejects a malformed MAIL_FROM", () => {
    expect(() => parseEnv({ ...COMPOSE_QUICKSTART, MAIL_FROM: "nonsense" })).toThrow();
  });

  it("rejects a SESSION_SECRET that is too short in production", () => {
    expect(() => parseEnv({ ...COMPOSE_QUICKSTART, SESSION_SECRET: "short" })).toThrow();
  });

  it("allows a missing SESSION_SECRET outside production", () => {
    expect(() =>
      parseEnv({ ...COMPOSE_QUICKSTART, NODE_ENV: "development", SESSION_SECRET: "" }),
    ).not.toThrow();
  });
});
