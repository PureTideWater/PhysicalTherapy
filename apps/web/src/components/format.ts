/** Dates on screen: UTC, to the minute (PRD 6, Cross-cutting: every date stored and shown in UTC). */
export function utc(date: Date | string | null | undefined): string {
  if (date === null || date === undefined) {
    return '—';
  }
  return `${new Date(date).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** A calendar date, UTC. */
export function utcDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

const ROLE_NAMES: Readonly<Record<string, string>> = {
  practice_admin: 'Practice administrator',
  billing_manager: 'Billing manager',
  analyst: 'Analyst',
  viewer: 'Viewer',
  firm_principal: 'Firm principal',
  firm_analyst: 'Firm analyst',
  platform_admin: 'Platform administrator',
  contract_specialist: 'Contract specialist',
  reviewer: 'Reimbursement reviewer',
  support: 'Support engineer',
};

export function roleName(role: string): string {
  return ROLE_NAMES[role] ?? role;
}

export function roleNames(roles: readonly string[]): string {
  return roles.length === 0 ? 'no role' : roles.map(roleName).join(', ');
}
