'use client';

import { cn } from '@tp/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WORKSPACE_SCREENS, screenHref } from '../lib/screens';
import { PracticeSwitcher } from './practice-switcher';

/** The workspace navigation: the practice switcher on top, then one entry per screen. */
export function LeftRail() {
  const pathname = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <PracticeSwitcher />
      <nav aria-label="Workspace">
        <ul className="flex flex-col gap-0.5">
          {WORKSPACE_SCREENS.map((screen) => {
            const href = screenHref(screen.slug);
            const current = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={screen.slug}>
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-1.5 text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    current && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                  )}
                >
                  {screen.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
