import { VERSION, isNewerThanRunning } from "@/lib/version";
import { getEnv } from "@/lib/env";

/**
 * Whether a newer release exists on GitHub.
 *
 * Anonymous, unauthenticated and read-only. That works for a public
 * repository; a private one answers 404, which is reported as "cannot check"
 * rather than "up to date" — claiming the latter would be a lie, and the
 * difference matters to somebody deciding whether to upgrade.
 *
 * No token is ever used. A household bill tracker has no business holding
 * credentials that can read a GitHub account.
 *
 * Every failure is quiet. An update check is a convenience, and a NAS with no
 * route to the internet is a perfectly normal way to run this.
 */

export type UpdateStatus =
  | { state: "disabled" }
  | { state: "development" }
  | { state: "current"; running: string }
  | { state: "available"; running: string; latest: string; url: string }
  | { state: "unknown"; reason: string };

/** Checked at most this often, however many people load the page. */
const CACHE_MS = 6 * 60 * 60 * 1000;

let cached: { at: number; status: UpdateStatus } | null = null;

async function fetchLatest(repo: string): Promise<UpdateStatus> {
  const running = VERSION;

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RoomieBudget",
      },
      // Never let a slow or unreachable GitHub hold up a page render.
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (response.status === 404) {
      return {
        state: "unknown",
        reason: "No public releases found. A private repository cannot be checked anonymously.",
      };
    }

    if (response.status === 403) {
      return { state: "unknown", reason: "GitHub rate limit reached. It will retry later." };
    }

    if (!response.ok) {
      return { state: "unknown", reason: `GitHub replied ${response.status}.` };
    }

    const release = (await response.json()) as { tag_name?: string; html_url?: string };
    const latest = release.tag_name;

    if (!latest) return { state: "unknown", reason: "GitHub returned no release tag." };

    if (isNewerThanRunning(latest, running)) {
      return {
        state: "available",
        running,
        latest,
        url: release.html_url ?? `https://github.com/${repo}/releases`,
      };
    }

    return { state: "current", running };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "GitHub did not respond in time."
        : "Could not reach GitHub.";
    return { state: "unknown", reason };
  }
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const env = getEnv();

  if (!env.UPDATE_CHECK) return { state: "disabled" };

  // A build from a working tree has no release to compare against.
  if (VERSION === "dev") return { state: "development" };

  if (cached && Date.now() - cached.at < CACHE_MS) return cached.status;

  const status = await fetchLatest(env.UPDATE_REPO);
  cached = { at: Date.now(), status };
  return status;
}

/** Test seam, and a way to force a re-check after changing settings. */
export function clearUpdateCache(): void {
  cached = null;
}
