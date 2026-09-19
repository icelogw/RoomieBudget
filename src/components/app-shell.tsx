import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/app";
import { signOut } from "@/lib/auth/actions";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getDevice } from "@/lib/device";
import { SidebarNav, TabBar } from "./nav";

/**
 * Two genuinely different layouts rather than one that reflows.
 *
 * Desktop gets a persistent sidebar, because there is room for navigation to
 * stay on screen. Phones get a bottom tab bar, because the top of a phone
 * screen is the hardest place to reach and a hamburger would hide the whole
 * app behind a tap.
 */
export async function AppShell({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: ReactNode;
}) {
  const device = await getDevice();
  return device === "mobile" ? (
    <MobileShell user={user}>{children}</MobileShell>
  ) : (
    <DesktopShell user={user}>{children}</DesktopShell>
  );
}

function MobileShell({ user, children }: { user: AuthenticatedUser; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold tracking-tight text-ink">{APP_NAME}</p>
          <p className="truncate text-xs text-ink-subtle">{user.name}</p>
        </div>
      </header>

      {/* Bottom padding clears the fixed tab bar. */}
      <main className="flex-1 px-4 pb-24 pt-5">{children}</main>

      <TabBar />
    </div>
  );
}

function DesktopShell({ user, children }: { user: AuthenticatedUser; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5">
        <p className="px-2.5 text-sm font-semibold tracking-tight text-ink">{APP_NAME}</p>

        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>

        <div className="border-t border-line pt-3">
          <p className="truncate px-2.5 text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate px-2.5 text-xs text-ink-subtle">{user.email}</p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

/** Consistent page heading, with room for a primary action on the right. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
