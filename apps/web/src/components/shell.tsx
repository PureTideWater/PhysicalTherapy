import { Button, PermissionState, Separator, cn } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { signOut } from '../app/account/actions';
import type { Shell } from '../lib/http/route';
import { roleNames } from './format';
import { HELP } from './help';
import { FormKeys } from './form-keys';

/**
 * The application shell (PRD 7): a left rail with the practice switcher at the top, listing only the
 * practices the actor reaches right now (resolved by the effective-permission function on this
 * request), the workspace and account links, the internal console for platform administrators, and
 * sign-out. Rendered by each page from its own route's result, never from a cached layout.
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

function PracticeSwitcher({ shell }: { readonly shell: Shell }) {
  const current = shell.practices.find((practice) => practice.practiceId === shell.currentPracticeId);
  if (shell.practices.length === 0) {
    return <p className="text-sm text-muted-foreground">No practice access</p>;
  }
  return (
    <details className="group rounded-md border bg-background" open={current === undefined}>
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium" aria-label="Practice switcher">
        {current?.name ?? 'Choose a practice'}
      </summary>
      <ul className="flex flex-col border-t py-1" aria-label="Practices">
        {shell.practices.map((practice) => (
          <li key={practice.practiceId}>
            <Link
              href={practiceHref(shell, practice.practiceId)}
              aria-current={practice.practiceId === shell.currentPracticeId ? 'page' : undefined}
              className={cn('block px-3 py-1.5 text-sm hover:bg-accent', practice.practiceId === shell.currentPracticeId && 'font-semibold')}
            >
              {practice.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RailLink({ href, children, active }: { readonly href: string; readonly children: ReactNode; readonly active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn('rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent', active && 'bg-sidebar-accent font-medium')}>
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
  | 'home';

export function AppShell({ shell, section, children }: { readonly shell: Shell | undefined; readonly section: ShellSection; readonly children: ReactNode }) {
  if (shell === undefined) {
    return <main className="mx-auto max-w-3xl p-10">{children}</main>;
  }
  const platformAdmin = shell.platformRoles.includes('platform_admin');
  const specialist = shell.platformRoles.includes('contract_specialist');
  const supportDesk = shell.platformRoles.includes('support');
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 text-sidebar-foreground" aria-label="Navigation">
        <PracticeSwitcher shell={shell} />
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
            <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Internal console</p>
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
              </>
            ) : null}
            {platformAdmin || supportDesk ? (
              <RailLink href="/console/tickets" active={section === 'tickets'}>
                Support tickets
              </RailLink>
            ) : null}
            {specialist ? (
              <RailLink href="/console/specialist-queue" active={section === 'specialist_queue'}>
                Specialist queue
              </RailLink>
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
        <div className="mt-auto flex flex-col gap-2">
          <Separator />
          <p className="truncate text-xs text-muted-foreground" title={shell.email}>
            {shell.email}
          </p>
          {shell.platformRoles.length === 0 ? null : <p className="text-xs text-muted-foreground">{roleNames(shell.platformRoles)}</p>}
          <form action={signOut}>
            <FormKeys />
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
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
