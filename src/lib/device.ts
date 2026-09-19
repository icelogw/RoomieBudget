import { headers } from "next/headers";

export type Device = "mobile" | "desktop";

/**
 * Phones and small Android tablets. iPads are deliberately absent: iPadOS
 * reports itself as "Macintosh", and a tablet has the screen for the desktop
 * layout anyway.
 */
const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i;

/**
 * Chosen on the server from the User-Agent, so the correct layout is in the
 * first HTML response. Deciding client-side instead would mean every phone
 * renders the desktop sidebar for a frame before swapping — visible, and worse
 * on a slow connection.
 *
 * User-Agent is a hint, not a fact: it can be spoofed or absent, and a desktop
 * browser in device-emulation mode will lie. So this only picks which shell to
 * render, and both shells are responsive on their own. Being wrong costs a
 * less suitable layout, never a broken page.
 */
export async function getDevice(): Promise<Device> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return MOBILE_UA.test(userAgent) ? "mobile" : "desktop";
}
