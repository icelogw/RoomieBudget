"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { HouseIcon, ReceiptIcon, ScalesIcon } from "./icons";

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Bills", Icon: ReceiptIcon },
  { href: "/balances", label: "Balances", Icon: ScalesIcon },
  { href: "/household", label: "Household", Icon: HouseIcon },
];

/** "/" must match exactly, or it would light up on every page. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink")
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface"
      // Keeps the bar clear of the iPhone home indicator.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // 56px of height: comfortably past the 44px minimum tap target.
                className={
                  "flex h-14 flex-col items-center justify-center gap-1 text-2xs transition-colors " +
                  (active ? "font-medium text-accent" : "text-ink-subtle")
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The signed-in person's own block, which doubles as the way into Account.
 *
 * Kept out of the main navigation: it is the one destination people already
 * expect to find behind their own name, and leaving it there keeps the phone
 * tab bar to three items.
 */
export function AccountLink({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/account");

  return (
    <Link
      href="/account"
      aria-current={active ? "page" : undefined}
      className={
        "block rounded-md px-2.5 py-1.5 transition-colors " +
        (active ? "bg-accent-soft" : "hover:bg-surface-sunken")
      }
    >
      <span
        className={
          "block truncate text-sm font-medium " + (active ? "text-accent" : "text-ink")
        }
      >
        {name}
      </span>
      <span className="block truncate text-xs text-ink-subtle">{email}</span>
    </Link>
  );
}

/** The same destination from a phone, where there is only room for a name. */
export function AccountChip({ name }: { name: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/account");

  return (
    <Link
      href="/account"
      aria-current={active ? "page" : undefined}
      className={
        "shrink-0 truncate rounded-md px-2 py-1 text-xs transition-colors " +
        (active ? "bg-accent-soft font-medium text-accent" : "text-ink-subtle")
      }
    >
      {name}
    </Link>
  );
}
