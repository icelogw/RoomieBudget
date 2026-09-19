import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";

import { APP_NAME, APP_TAGLINE } from "@/lib/app";
import "./globals.css";

/**
 * Self-hosted at build time by next/font, so a LAN-only install with no
 * internet access still renders correctly.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  // A private household ledger has no business in a search index, even though
  // it should never be reachable from the internet in the first place.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Phones are a first-class target here, so the theme colour follows the
  // palette rather than leaving the browser chrome white in dark mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#131210" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={plexSans.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
