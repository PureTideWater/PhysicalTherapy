/** Dates on screen: UTC, to the minute (PRD 6, Cross-cutting: every date stored and shown in UTC). */
export function utc(date: Date | string | null | undefined): string {
  if (date === null || date === undefined) {
    return '—';
  }
  return `${new Date(date).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** A moment to the second, UTC: what tells two runs of one minute apart in a run's name. */
export function utcSeconds(date: Date | string): string {
  return `${new Date(date).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** A calendar date, UTC. */
export function utcDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** A calendar quarter's key, as `@tp/ledger`'s quarterOf writes it ("2026-Q4"). */
const QUARTER_KEY = /^\d{4}-Q[1-4]$/;

/**
 * A calendar quarter on screen ("2026-Q4"), beside utc() and utcDate() so the screens' date style changes in one
 * place. It takes `@tp/ledger`'s quarter key and refuses any other shape, so a period never reads as something else.
 */
export function quarter(key: string): string {
  if (!QUARTER_KEY.test(key)) {
    throw new Error(`Not a quarter key: ${key}`);
  }
  return key;
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
