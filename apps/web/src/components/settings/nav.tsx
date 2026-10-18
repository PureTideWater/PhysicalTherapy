import { Badge, cn } from '@tp/ui';
import Link from 'next/link';

export type SettingsSection = 'overview' | 'users' | 'agreements' | 'defaults' | 'proof_level' | 'access_log' | 'data' | 'notifications' | 'billing';

/**
 * The Settings screen's sections (PRD 7, Settings), each its own page and route. Sections only an administrator
 * may change are marked (PRD 7: "Administrator-only actions marked"); the access log is read-only.
 */
export function SettingsNav({
  practiceId,
  organizationId,
  current,
}: {
  readonly practiceId: string;
  readonly organizationId: string | null;
  readonly current: SettingsSection;
}) {
  // A practice no group owns yet has no organization-wide sections.
  const organization = organizationId ?? '';
  const sections: readonly { readonly key: SettingsSection; readonly href: string; readonly label: string; readonly admin: boolean }[] = [
    { key: 'overview', href: `/p/${practiceId}/settings`, label: 'Overview', admin: false },
    { key: 'users', href: `/settings/organizations/${organization}/users`, label: 'Users and roles', admin: true },
    { key: 'agreements', href: `/p/${practiceId}/settings/agreements`, label: 'Grants and agreements', admin: true },
    { key: 'notifications', href: '/account/notifications', label: 'Notification preferences', admin: false },
    { key: 'defaults', href: `/p/${practiceId}/settings/defaults`, label: 'Materiality and pursuit', admin: false },
    { key: 'proof_level', href: `/p/${practiceId}/settings/proof-level`, label: 'Proof level', admin: true },
    { key: 'access_log', href: `/p/${practiceId}/settings/access-log`, label: 'Access log', admin: true },
    { key: 'data', href: `/p/${practiceId}/settings/data`, label: 'Export and deletion', admin: true },
    { key: 'billing', href: `/settings/billing/${organization}`, label: 'Billing', admin: true },
  ];
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">
      {sections.filter((section) => organizationId !== null || (section.key !== 'users' && section.key !== 'billing')).map((section) => (
        <Link
          key={section.key}
          href={section.href}
          aria-current={section.key === current ? 'page' : undefined}
          className={cn('rounded-md border px-2 py-1 hover:bg-accent', section.key === current && 'bg-accent font-medium')}
        >
          {section.label}
          {section.admin ? (
            <Badge variant="outline" className="ml-1 text-[10px]" title="Changes here are for the practice administrator">
              admin
            </Badge>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** The organization that owns the shell's current practice, for the organization-wide sections. */
export function currentOrganization(shell: { readonly practices: readonly { readonly practiceId: string; readonly organizationId: string | null }[]; readonly currentPracticeId: string | null } | undefined): string | null {
  return shell?.practices.find((practice) => practice.practiceId === shell.currentPracticeId)?.organizationId ?? null;
}
