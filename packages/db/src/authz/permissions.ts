import { type MembershipRole, MEMBERSHIP_ROLES } from '../schema/tenancy';

/**
 * The persona permission matrix of PRD 3 ("Personas and what each can do"), as data. Each role has
 * the permissions its persona's "Does" column gives it and the "Must not" column as explicit denials.
 * The same matrix is the role_permission table in the database (migration
 * 20261015170000_identity_and_permissions.sql), which app_actor_permitted() reads for the policies on
 * role-specific actions; a database test proves the two are identical (docs/adr/0017).
 *
 * Reading rules (the plan is silent on them; ADR 0017 records them):
 * - Every customer role reads what a viewer reads (dashboards, reports, the ledger, ROI statements):
 *   the persona table lists what each role adds, and the viewer is the minimal reader.
 * - Line-level PHI is read by the roles that work lines (billing manager, analyst, firm roles) and by
 *   a support engineer under a support grant; exporting it by the billing manager and firm principal.
 * - firm_analyst is the Analyst persona in a firm.
 * - The reimbursement reviewer validates a practice's audit findings inside that practice, reached
 *   through a support grant (docs/adr/0038), so audit_finding.validate is a practice permission; signing
 *   the attestation is the only record it writes, and the permission does not count as a write.
 * - The practice administrator and the billing manager sign off contract versions (PRD 5, J5:
 *   contract.sign_off), and so does the firm principal, who does everything a billing manager does.
 *   A contract specialist reaches a practice only under a support grant (docs/adr/0028).
 * - A permission is granted when one of the actor's roles allows it and none denies it (a "must not"
 *   wins). Some "must not" rules are not a single permission; they are kept by the structure of
 *   access (STRUCTURAL_RULES) and each has its own test.
 */

export type PermissionScope = 'practice' | 'organization' | 'platform';

export interface PermissionInfo {
  /** Where the roles that decide it come from: the actor's routes to the practice, a membership, or the internal organization. */
  readonly scope: PermissionScope;
  /** Whether it changes a record (the reviewer edits nothing). */
  readonly writes: boolean;
  readonly description: string;
}

export const PERMISSIONS = {
  'practice.open': { scope: 'practice', writes: false, description: 'open the practice’s workspace' },
  'report.read': { scope: 'practice', writes: false, description: 'read dashboards, reports, the ledger and ROI statements' },
  'phi.read': { scope: 'practice', writes: false, description: 'read line-level PHI (claims, lines and patient references)' },
  'phi.export': { scope: 'practice', writes: false, description: 'export line-level PHI' },
  'agreement.sign': { scope: 'practice', writes: true, description: 'sign the practice’s agreements' },
  'user.invite': { scope: 'organization', writes: true, description: 'invite users to the organization' },
  'grant.approve': { scope: 'practice', writes: true, description: 'approve a grant to the practice' },
  'grant.revoke': { scope: 'practice', writes: true, description: 'revoke a grant to the practice' },
  'export.request': { scope: 'practice', writes: true, description: 'request the practice’s export' },
  'deletion.request': { scope: 'practice', writes: true, description: 'request the practice’s deletion' },
  'access_log.read': { scope: 'practice', writes: false, description: 'read the practice’s access log' },
  'file.upload': { scope: 'practice', writes: true, description: 'upload files' },
  'mapping.edit': { scope: 'practice', writes: true, description: 'map payer plans' },
  'anomaly.work': { scope: 'practice', writes: true, description: 'work anomalies' },
  'case.work': { scope: 'practice', writes: true, description: 'work cases' },
  'packet.draft': { scope: 'practice', writes: true, description: 'build and draft packets' },
  'packet.approve': { scope: 'practice', writes: true, description: 'approve packets' },
  'packet.approve_own_draft': { scope: 'practice', writes: true, description: 'approve a packet you drafted' },
  'submission.log': { scope: 'practice', writes: true, description: 'log submissions' },
  'posting.reconcile': { scope: 'practice', writes: true, description: 'reconcile postings' },
  'rate_record.edit': { scope: 'practice', writes: true, description: 'edit rate records' },
  'contract.sign_off': { scope: 'practice', writes: true, description: 'sign off a contract version' },
  'firm_user.manage': { scope: 'organization', writes: true, description: 'manage firm users' },
  'portfolio.read': { scope: 'organization', writes: false, description: 'see the firm portfolio' },
  'contract.review': { scope: 'platform', writes: false, description: 'review model-proposed contract abstractions' },
  'rate_record.approve': { scope: 'platform', writes: true, description: 'approve rate records for publication' },
  'rate_record.edit_published': { scope: 'platform', writes: true, description: 'edit a published rate version' },
  'pricing.answer': { scope: 'platform', writes: false, description: 'answer pricing questions' },
  'audit_finding.validate': { scope: 'practice', writes: false, description: 'validate audit findings against contracts and sign the attestation' },
  'organization.manage': { scope: 'platform', writes: true, description: 'manage organizations, practices and memberships' },
  'agreement.record': { scope: 'platform', writes: true, description: 'record agreements' },
  'support_grant.create': { scope: 'platform', writes: true, description: 'create a break-glass grant from a ticket' },
  'rule_release.manage': { scope: 'platform', writes: true, description: 'prepare, check and publish rule releases' },
  'feature_flag.manage': { scope: 'platform', writes: true, description: 'manage feature flags' },
  'billing.manage': { scope: 'platform', writes: true, description: 'manage billing' },
} as const satisfies Readonly<Record<string, PermissionInfo>>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.hasOwn(PERMISSIONS, value);
}

/** A "must not" the matrix cannot hold as one permission: the structure of access keeps it. */
export type StructuralRule = 'grant_in_force' | 'support_grant_required' | 'support_grant_expiry' | 'two_person_approval';

export const STRUCTURAL_RULES: Readonly<Record<StructuralRule, string>> = {
  grant_in_force:
    'a firm reaches a practice only through a grant in force: effective_practice_access() ignores an expired, revoked or not yet started grant on the next transaction',
  support_grant_required:
    'internal roles have no standing access: the internal organization owns no practice and receives no grant, no internal user holds a group or firm membership (nor grants one to themselves), and the effective-permission function ignores customer routes of internal users, so only a support grant reaches PHI (a support engineer holds support under it, a contract specialist contract_specialist, a reimbursement reviewer reviewer)',
  support_grant_expiry:
    'a support grant reaches its practice for at most four hours, or until it is ended when the ticket closes, and then nothing, on the next transaction',
  two_person_approval: 'the drafter of a packet never holds packet.approve_own_draft; the single-user 24-hour delay is the packet workflow’s (milestone 8)',
};

export interface MustNot {
  /** The plan's words. */
  readonly rule: string;
  /** The permissions it denies. */
  readonly denies: readonly Permission[];
  /** The structural rule that keeps it, when a denial alone cannot. */
  readonly structural?: StructuralRule;
}

export interface Persona {
  readonly persona: string;
  readonly does: readonly Permission[];
  readonly mustNot: readonly MustNot[];
}

const VIEWER_READS: readonly Permission[] = ['practice.open', 'report.read'];

const BILLING_MANAGER_DOES: readonly Permission[] = [
  ...VIEWER_READS,
  'phi.read',
  'phi.export',
  'file.upload',
  'mapping.edit',
  'contract.sign_off',
  'anomaly.work',
  'case.work',
  'packet.draft',
  'packet.approve',
  'submission.log',
  'posting.reconcile',
];

const ANALYST: Persona = {
  persona: 'Analyst',
  does: [...VIEWER_READS, 'phi.read', 'case.work', 'packet.draft', 'file.upload'],
  mustNot: [{ rule: 'Approve packets, change grants', denies: ['packet.approve', 'packet.approve_own_draft', 'grant.approve', 'grant.revoke'] }],
};

const NO_OWN_APPROVAL: MustNot = {
  rule: 'Approve a packet she drafted (two-person rule where the practice has two users; otherwise a 24-hour delay and an audit flag)',
  denies: ['packet.approve_own_draft'],
  structural: 'two_person_approval',
};

/** Every permission that changes a record: what the reviewer, read-only, must not do. */
export const WRITE_PERMISSIONS: readonly Permission[] = PERMISSION_NAMES.filter((name) => PERMISSIONS[name].writes);

export const PERSONAS: Readonly<Record<MembershipRole, Persona>> = {
  practice_admin: {
    persona: 'Practice administrator',
    does: [...VIEWER_READS, 'agreement.sign', 'user.invite', 'grant.approve', 'grant.revoke', 'export.request', 'deletion.request', 'access_log.read', 'contract.sign_off'],
    mustNot: [{ rule: 'Edit rate records (that is the specialist’s job)', denies: ['rate_record.edit'] }],
  },
  billing_manager: { persona: 'Billing manager', does: BILLING_MANAGER_DOES, mustNot: [NO_OWN_APPROVAL] },
  analyst: ANALYST,
  firm_analyst: { ...ANALYST, persona: 'Analyst (firm)' },
  viewer: {
    persona: 'Viewer (CFO, owner)',
    does: VIEWER_READS,
    mustNot: [{ rule: 'Export line-level PHI', denies: ['phi.export'] }],
  },
  firm_principal: {
    persona: 'Firm principal',
    does: [...BILLING_MANAGER_DOES, 'firm_user.manage', 'portfolio.read', 'user.invite'],
    mustNot: [NO_OWN_APPROVAL, { rule: 'Act in a practice whose grant has expired', denies: [], structural: 'grant_in_force' }],
  },
  contract_specialist: {
    persona: 'Contract specialist',
    does: ['contract.review', 'rate_record.edit', 'rate_record.approve', 'pricing.answer'],
    mustNot: [{ rule: 'Edit a published rate version (a new version supersedes it)', denies: ['rate_record.edit_published'] }],
  },
  reviewer: {
    persona: 'Reimbursement reviewer',
    does: ['report.read', 'phi.read', 'audit_finding.validate'],
    mustNot: [{ rule: 'Edit anything; read-only with a signed attestation', denies: WRITE_PERMISSIONS }],
  },
  platform_admin: {
    persona: 'Platform administrator',
    does: ['organization.manage', 'agreement.record', 'support_grant.create', 'rule_release.manage', 'feature_flag.manage', 'billing.manage'],
    mustNot: [{ rule: 'Read PHI without a support grant', denies: ['phi.read', 'phi.export'], structural: 'support_grant_required' }],
  },
  support: {
    persona: 'Support engineer',
    does: [...VIEWER_READS, 'phi.read'],
    mustNot: [{ rule: 'Retain access after the ticket closes', denies: [], structural: 'support_grant_expiry' }],
  },
};

export type Effect = 'allow' | 'deny';

export interface MatrixRow {
  readonly role: MembershipRole;
  readonly action: Permission;
  readonly effect: Effect;
}

/** The matrix as role_permission rows, sorted by role then action. */
export function matrixRows(): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const role of MEMBERSHIP_ROLES) {
    const { does, mustNot } = PERSONAS[role];
    const denied = new Set(mustNot.flatMap((entry) => entry.denies));
    for (const action of new Set(does)) {
      rows.push({ role, action, effect: 'allow' });
    }
    for (const action of denied) {
      rows.push({ role, action, effect: 'deny' });
    }
  }
  return rows.sort((a, b) => a.role.localeCompare(b.role) || a.action.localeCompare(b.action));
}

/**
 * Whether the roles together hold the permission: one allows it and none denies it. An empty role set
 * holds nothing.
 */
export function rolesPermit(roles: readonly string[], permission: Permission): boolean {
  let allowed = false;
  for (const role of roles) {
    const persona = PERSONAS[role as MembershipRole] as Persona | undefined;
    if (persona === undefined) {
      continue;
    }
    if (persona.mustNot.some((entry) => entry.denies.includes(permission))) {
      return false;
    }
    allowed ||= persona.does.includes(permission);
  }
  return allowed;
}

/** The "must not" that denies the permission to one of the roles, if any. */
export function denyingRule(roles: readonly string[], permission: Permission): MustNot | undefined {
  for (const role of roles) {
    const found = (PERSONAS[role as MembershipRole] as Persona | undefined)?.mustNot.find((entry) => entry.denies.includes(permission));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Every permission the roles hold together. */
export function permissionsOf(roles: readonly string[]): Permission[] {
  return PERMISSION_NAMES.filter((name) => rolesPermit(roles, name));
}
