"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { HouseIcon, PersonIcon, ReceiptIcon, ScalesIcon } from "./icons";

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Bills", Icon: ReceiptIcon },
  { href: "/balances", label: "Balances", Icon: ScalesIcon },
  { href: "/household", label: "Household", Icon: HouseIcon },
  { href: "/account", label: "Account", Icon: PersonIcon },
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
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
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
