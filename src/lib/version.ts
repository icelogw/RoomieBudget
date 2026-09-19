/**
 * The running version, and how to tell whether another one is newer.
 *
 * Values are baked in at build time from Docker build arguments, so an image
 * can say what it is. A build without them reports "dev", which is honest:
 * a container built straight from a working tree has no release to name.
 */

export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
export const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA || "";
export const BUILT_AT = process.env.NEXT_PUBLIC_BUILT_AT || "";

export type Semver = { major: number; minor: number; patch: number };

/** Parse "v1.2.3" or "1.2.3". Anything else is not a version. */
export function parseVersion(value: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Negative if a < b, positive if a > b, zero if the same. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  // An unparseable version is never treated as newer. A build called "dev"
  // must not announce itself as an upgrade over a real release.
  if (!left || !right) return 0;

  return (
    left.major - right.major || left.minor - right.minor || left.patch - right.patch
  );
}

/**
 * Whether `candidate` is a release worth telling somebody about.
 *
 * A development build is deliberately excluded: it has no version to compare,
 * and nagging a developer to "upgrade" to the release they are working past
 * would be noise.
 */
export function isNewerThanRunning(candidate: string, running: string = VERSION): boolean {
  if (running === "dev" || !parseVersion(running)) return false;
  return compareVersions(candidate, running) > 0;
}

/** "v1.2.0 (a1b2c3d)" — what to show in an interface. */
export function describeVersion(): string {
  if (VERSION === "dev") {
    return GIT_SHA ? `dev (${GIT_SHA.slice(0, 7)})` : "dev";
  }
  return GIT_SHA ? `${VERSION} (${GIT_SHA.slice(0, 7)})` : VERSION;
}
