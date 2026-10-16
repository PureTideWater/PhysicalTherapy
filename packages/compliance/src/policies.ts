import type { PolicyId } from './controls';

/**
 * The policies the program keeps in the repository (PRD 16, SOC 2 and HIPAA evidence: "policies live in the
 * repository as Markdown with versions"). Each file's front matter carries the same version as here, which
 * controls.test.ts checks; a policy is in force once the security official's approval of that version is
 * recorded (compliance_record kind policy_approval, subject "<id>:<version>"). Until then it is a draft, and the
 * checklist says so.
 */

export interface Policy {
  readonly id: PolicyId;
  readonly title: string;
  readonly file: string;
  readonly version: string;
  /** How often the security official re-approves it. */
  readonly reviewEveryDays: number;
}

export const POLICIES: readonly Policy[] = [
  { id: 'access-control', title: 'Access control', file: 'docs/policies/access-control.md', version: '0.1', reviewEveryDays: 365 },
  { id: 'incident-response', title: 'Incident response', file: 'docs/policies/incident-response.md', version: '0.1', reviewEveryDays: 365 },
  { id: 'change-management', title: 'Change management', file: 'docs/policies/change-management.md', version: '0.1', reviewEveryDays: 365 },
  { id: 'vendor-management', title: 'Vendor management', file: 'docs/policies/vendor-management.md', version: '0.1', reviewEveryDays: 365 },
  { id: 'data-retention', title: 'Data retention', file: 'docs/policies/data-retention.md', version: '0.1', reviewEveryDays: 365 },
  { id: 'workforce-and-device', title: 'Workforce and device', file: 'docs/policies/workforce-and-device.md', version: '0.1', reviewEveryDays: 365 },
];

/** The compliance_record subject an approval of the policy's current version carries. */
export function policyApprovalSubject(policy: Pick<Policy, 'id' | 'version'>): string {
  return `${policy.id}:${policy.version}`;
}

export function policyById(id: PolicyId): Policy {
  const policy = POLICIES.find((candidate) => candidate.id === id);
  if (policy === undefined) {
    throw new Error(`no policy ${id}`);
  }
  return policy;
}
