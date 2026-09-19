import { headers } from "next/headers";

/**
 * Where a request appears to have come from, for throttling purposes only.
 *
 * The container sits behind a reverse proxy on the NAS, so X-Forwarded-For is
 * all there is — and the client controls what it sends. The rightmost entry is
 * the one the nearest proxy appended from the peer address it actually saw, so
 * that is the one taken: anything a client puts in the header is pushed left
 * and ignored. That holds for exactly one trusted hop, which is the documented
 * deployment.
 *
 * With no proxy at all — a plain `docker run` on the LAN — there is no header
 * and every client shares one bucket. That is honest rather than ideal: it
 * means housemates on the same LAN cannot be told apart, so the per-account
 * ceiling behaves as it did before. The alternative would be treating a
 * spoofable value as identity, which is worse.
 *
 * Never use this for authorisation. It is a bucket key, nothing more.
 */
export async function clientSource(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  if (!forwarded) return "direct";

  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  return hops.at(-1) ?? "direct";
}
