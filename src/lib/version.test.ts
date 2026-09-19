import { describe, expect, it } from "vitest";

import { compareVersions, isNewerThanRunning, parseVersion } from "./version";

describe("parseVersion", () => {
  it("reads a tag with or without the v", () => {
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("ignores anything trailing the patch number", () => {
    expect(parseVersion("v1.2.3-beta.1")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("returns null for things that are not versions", () => {
    for (const bad of ["dev", "", "v1", "v1.2", "latest", "main"]) {
      expect(parseVersion(bad), bad).toBeNull();
    }
  });
});

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("v2.0.0", "v1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.3.0", "v1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.4", "v1.2.3")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "v1.2.3")).toBe(0);
    expect(compareVersions("v1.2.3", "v1.2.4")).toBeLessThan(0);
  });

  it("compares numerically, not as text", () => {
    // The bug this guards: "10" sorts before "9" as a string.
    expect(compareVersions("v1.10.0", "v1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("v10.0.0", "v9.0.0")).toBeGreaterThan(0);
  });

  it("treats an unparseable version as equal rather than newer", () => {
    expect(compareVersions("dev", "v1.0.0")).toBe(0);
    expect(compareVersions("v1.0.0", "garbage")).toBe(0);
  });
});

describe("isNewerThanRunning", () => {
  it("spots a genuine upgrade", () => {
    expect(isNewerThanRunning("v1.1.0", "v1.0.0")).toBe(true);
  });

  it("says nothing when already current, or ahead", () => {
    expect(isNewerThanRunning("v1.0.0", "v1.0.0")).toBe(false);
    expect(isNewerThanRunning("v0.9.0", "v1.0.0")).toBe(false);
  });

  it("never nags a development build", () => {
    // A working-tree build has no release to compare against, and telling a
    // developer to upgrade to the version they are working past is noise.
    expect(isNewerThanRunning("v9.9.9", "dev")).toBe(false);
  });

  it("ignores a malformed release tag rather than guessing", () => {
    expect(isNewerThanRunning("not-a-version", "v1.0.0")).toBe(false);
  });
});
