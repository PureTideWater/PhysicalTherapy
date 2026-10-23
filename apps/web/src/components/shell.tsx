import { Button, PermissionState, Separator, cn } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { signOut } from '../app/account/actions';
import type { Shell } from '../lib/http/route';
import { PaidWholeLockup } from './brand';
import { roleNames } from './format';
import { PublicHeader } from './public-header';
import { HELP } from './help';
import { FormKeys } from './form-keys';

/**
 * The application shell (PRD 7): the PaidWhole header with the practice switcher, listing only the
 * practices the actor reaches right now (resolved by the effective-permission function on this
 * request), and the account with sign-out; the rail with the workspace and account links and the
 * internal console for platform administrators. Rendered by each page from its own route's result,
 * never from a cached layout.
 */
/**
 * Where a practice opens for the actor: a contract specialist reaches a practice only under a support
 * grant, to abstract its contracts (docs/adr/0028), so the specialist's link opens that work; a
 * reimbursement reviewer reaches it the same way to review its audit reports (docs/adr/0038).
 */
export function practiceHref(shell: Shell, practiceId: string): string {
  return specialistOnly(shell) ? `/p/${practiceId}/abstraction` : reviewerOnly(shell) ? `/p/${practiceId}/reports` : `/p/${practiceId}`;
}

function specialistOnly(shell: Shell): boolean {
  return shell.platformRoles.includes('contract_specialist') && !shell.platformRoles.includes('support');
}

function reviewerOnly(shell: Shell): boolean {
  return shell.platformRoles.includes('reviewer') && !shell.platformRoles.includes('support');
}

function Chevron({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" width="12" height="12" className={cn('shrink-0 text-fg-muted', className)}>
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const SUMMARY = 'flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm hover:bg-accent [&::-webkit-details-marker]:hidden';
const DROPDOWN = 'absolute right-0 z-40 mt-1 rounded-md border bg-popover text-popover-foreground';

/** The practice switcher, in the header's right: only the practices the actor reaches right now. */
function PracticeSwitcher({ shell }: { readonly shell: Shell }) {
  const current = shell.practices.find((practice) => practice.practiceId === shell.currentPracticeId);
  if (shell.practices.length === 0) {
    return <p className="hidden text-sm text-muted-foreground sm:block">No practice access</p>;
  }
  return (
    <details className="relative">
      <summary className={cn(SUMMARY, 'border px-2 font-medium sm:px-2.5')} aria-label="Practice switcher">
        <span className="max-w-[5rem] truncate sm:max-w-[14rem]">{current?.name ?? 'Choose a practice'}</span>
        <Chevron />
      </summary>
      <div className={cn(DROPDOWN, 'w-72 max-w-[calc(100vw-2rem)] py-1')}>
        <ul className="flex flex-col" aria-label="Practices">
          {shell.practices.map((practice) => (
            <li key={practice.practiceId}>
              <Link
                href={practiceHref(shell, practice.practiceId)}
                aria-current={practice.practiceId === shell.currentPracticeId ? 'page' : undefined}
                className={cn('block px-3 py-1.5 text-sm text-fg no-underline hover:bg-accent hover:text-fg', practice.practiceId === shell.currentPracticeId && 'font-semibold')}
              >
                {practice.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** The account, in the header's right: who is signed in, their platform roles, and sign-out. */
function AccountMenu({ shell }: { readonly shell: Shell }) {
  const initial = shell.email.slice(0, 1).toUpperCase();
  return (
    <details className="relative">
      <summary className={cn(SUMMARY, 'px-1 sm:px-2')} aria-label="Account menu" title={shell.email}>
        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-pill bg-bg-inset text-xs font-semibold text-fg">
          {initial}
        </span>
        <span className="hidden max-w-[12rem] truncate md:inline">{shell.email}</span>
        <Chevron className="hidden sm:block" />
      </summary>
      <div className={cn(DROPDOWN, 'flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3')}>
        <p className="truncate text-sm font-medium" title={shell.email}>
          {shell.email}
        </p>
        {shell.platformRoles.length === 0 ? null : <p className="text-xs text-muted-foreground">{roleNames(shell.platformRoles)}</p>}
        <Separator />
        <form action={signOut}>
          <FormKeys />
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </details>
  );
}

/**
 * A rail link. The active one carries the single brass underline (docs/brand/BRAND.md, section 7: that is
 * Brass's only job in the UI); the rest are plain text in the foreground color.
 */
function RailLink({ href, children, active }: { readonly href: string; readonly children: ReactNode; readonly active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm text-fg no-underline hover:bg-sidebar-accent hover:text-fg',
        active && 'font-medium underline decoration-brass decoration-2 underline-offset-[6px]',
      )}
    >
      {children}
    </Link>
  );
}

export type ShellSection =
  | 'practice'
  | 'uploads'
  | 'remittances'
  | 'claims'
  | 'mapping'
  | 'coverage'
  | 'pricing_runs'
  | 'anomalies'
  | 'cases'
  | 'reconciliation'
  | 'reports'
  | 'packet_reviews'
  | 'notifications'
  | 'contracts'
  | 'abstraction'
  | 'devices'
  | 'notification_preferences'
  | 'organizations'
  | 'support'
  | 'specialist_queue'
  | 'rule_releases'
  | 'billing'
  | 'console_billing'
  | 'settings'
  | 'users'
  | 'prospects'
  | 'terms_versions'
  | 'tickets'
  | 'status_admin'
  | 'compliance'
  | 'console_models'
  | 'console_mail'
  | 'screening_split'
  | 'home';

/** The navigation: the practice's screens (or the specialist's or reviewer's one), the internal console, and the account's own pages. */
function ShellNav({ shell, section }: { readonly shell: Shell; readonly section: ShellSection }) {
  const platformAdmin = shell.platformRoles.includes('platform_admin');
  const specialist = shell.platformRoles.includes('contract_specialist');
  const supportDesk = shell.platformRoles.includes('support');
  return (
    <>
      {shell.currentPracticeId === null ? null : specialistOnly(shell) ? (
        <nav aria-label="Practice" className="flex flex-col gap-1">
          <RailLink href={`/p/${shell.currentPracticeId}/abstraction`} active={section === 'abstraction'}>
            Contract abstraction
          </RailLink>
        </nav>
      ) : reviewerOnly(shell) ? (
        <nav aria-label="Practice" className="flex flex-col gap-1">
          <RailLink href={`/p/${shell.currentPracticeId}/reports`} active={section === 'reports'}>
            Reports
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/packet-reviews`} active={section === 'packet_reviews'}>
            Packets to attest
          </RailLink>
        </nav>
      ) : (
        <nav aria-label="Practice" className="flex flex-col gap-1">
          <RailLink href={`/p/${shell.currentPracticeId}`} active={section === 'practice'}>
            Practice home
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/uploads`} active={section === 'uploads'}>
            Uploads
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/remittances`} active={section === 'remittances'}>
            Remittances
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/claims`} active={section === 'claims'}>
            Claims and lines
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/mapping`} active={section === 'mapping'}>
            Payer and plan mapping
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/contracts`} active={section === 'contracts'}>
            Contracts
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/coverage`} active={section === 'coverage'}>
            Coverage
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/pricing-runs`} active={section === 'pricing_runs'}>
            Pricing runs
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/anomalies`} active={section === 'anomalies'}>
            Anomalies
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/cases`} active={section === 'cases'}>
            Cases
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/reconciliation`} active={section === 'reconciliation'}>
            Reconciliation
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/reports`} active={section === 'reports'}>
            Reports
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/notifications`} active={section === 'notifications'}>
            Notifications
          </RailLink>
          <RailLink href={`/p/${shell.currentPracticeId}/settings`} active={section === 'settings'}>
            Settings
          </RailLink>
        </nav>
      )}
      {platformAdmin || specialist || supportDesk ? (
        <nav aria-label="Internal console" className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium text-muted-foreground">Internal console</p>
          {platformAdmin ? (
            <>
              <RailLink href="/console/organizations" active={section === 'organizations'}>
                Organizations and practices
              </RailLink>
              <RailLink href="/console/support" active={section === 'support'}>
                Support
              </RailLink>
              <RailLink href="/console/rule-releases" active={section === 'rule_releases'}>
                Rule releases
              </RailLink>
              <RailLink href="/console/billing" active={section === 'console_billing'}>
                Billing status
              </RailLink>
              <RailLink href="/console/prospects" active={section === 'prospects'}>
                Audit requests
              </RailLink>
              <RailLink href="/console/terms" active={section === 'terms_versions'}>
                Terms of use
              </RailLink>
              <RailLink href="/console/status" active={section === 'status_admin'}>
                Status and maintenance
              </RailLink>
              <RailLink href="/console/compliance" active={section === 'compliance'}>
                SOC 2 evidence
              </RailLink>
              <RailLink href="/console/models" active={section === 'console_models'}>
                Model features
              </RailLink>
              <RailLink href="/console/mail" active={section === 'console_mail'}>
                Mail streams
              </RailLink>
            </>
          ) : null}
          {platformAdmin || supportDesk ? (
            <RailLink href="/console/tickets" active={section === 'tickets'}>
              Support tickets
            </RailLink>
          ) : null}
          {specialist ? (
            <>
              <RailLink href="/console/specialist-queue" active={section === 'specialist_queue'}>
                Specialist queue
              </RailLink>
              <RailLink href="/console/screening" active={section === 'screening_split'}>
                Place-of-service split
              </RailLink>
            </>
          ) : null}
        </nav>
      ) : null}
      <nav aria-label="Account" className="flex flex-col gap-1">
        <RailLink href="/account/devices" active={section === 'devices'}>
          Devices
        </RailLink>
        <RailLink href="/account/notifications" active={section === 'notification_preferences'}>
          Notification preferences
        </RailLink>
        <RailLink href="/settings/billing" active={section === 'billing'}>
          Billing
        </RailLink>
        <RailLink href={`/support?from=${section}`} active={false}>
          Help and support
        </RailLink>
      </nav>
    </>
  );
}

/**
 * The application shell (PRD 7; docs/brand/BRAND.md, section 7): a header with the PaidWhole lockup on the
 * left and the practice switcher and the account on the right; under it the navigation rail, whose active
 * item carries the single brass underline. Below the md breakpoint the rail folds into the header's Menu.
 */
export function AppShell({ shell, section, children }: { readonly shell: Shell | undefined; readonly section: ShellSection; readonly children: ReactNode }) {
  if (shell === undefined) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8 md:p-10">{children}</main>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 md:px-6" data-slot="app-header">
        <Link href="/" className="shrink-0 no-underline">
          <PaidWholeLockup size={20} />
        </Link>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <PracticeSwitcher shell={shell} />
          <AccountMenu shell={shell} />
          <details className="md:hidden">
            <summary className={cn(SUMMARY, 'border px-2 font-medium')}>Menu</summary>
            <div className="absolute inset-x-0 top-full z-40 flex max-h-[calc(100vh-3.5rem)] flex-col gap-4 overflow-y-auto border-b bg-sidebar p-4 text-sidebar-foreground">
              <ShellNav shell={shell} section={section} />
            </div>
          </details>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 text-sidebar-foreground md:flex" aria-label="Navigation">
          <ShellNav shell={shell} section={section} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:p-8">
          <details className="self-end text-sm" data-help={section}>
            <summary className="cursor-pointer text-muted-foreground underline">Help with this screen</summary>
            <div className="mt-2 flex max-w-md flex-col gap-2 rounded-md border bg-background p-3">
              <p>{HELP[section]}</p>
              <p>
                <Link className="underline" href={`/support?from=${section}`}>
                  Ask support about this screen
                </Link>{' '}
                ·{' '}
                <Link className="underline" href="/status">
                  Service status
                </Link>
              </p>
            </div>
          </details>
          {children}
        </main>
      </div>
    </div>
  );
}

/** The permission state inside the shell: what the role cannot do here, and who can (PRD 7). */
export function Forbidden({ shell, section, roles, message, nextStep }: { readonly shell: Shell | undefined; readonly section: ShellSection; readonly roles: readonly string[]; readonly message: string; readonly nextStep: string }) {
  return (
    <AppShell shell={shell} section={section}>
      <PermissionState role={roleNames(roles)} cannot={`do this here (${message})`} nextStep={nextStep} />
    </AppShell>
  );
}
