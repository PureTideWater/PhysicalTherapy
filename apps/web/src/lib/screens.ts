/**
 * The customer workspace screens of PRD section 7, in left-rail order. Sign-in sits outside the
 * workspace shell at /sign-in. URLs carry no identifiers beyond opaque IDs (none yet).
 */
export interface WorkspaceScreen {
  readonly slug: string;
  readonly title: string;
  /** What the screen shows, from section 7. */
  readonly shows: string;
  /** The empty state: what the user does next. */
  readonly empty: { readonly title: string; readonly nextStep: string };
}

export const WORKSPACE_SCREENS = [
  {
    slug: 'dashboard',
    title: 'Practice dashboard',
    shows: 'Data freshness (last file, last run), coverage, open cases by stage, deadlines in 14 days, recovered this quarter and last run status.',
    empty: { title: 'No remittances yet', nextStep: 'Upload your first 835 files.' },
  },
  {
    slug: 'uploads',
    title: 'Uploads',
    shows: 'A drop zone, a receipt per file with its status and reasons, batch progress and the error report.',
    empty: {
      title: 'Uploads open once the agreements are on file',
      nextStep: 'A practice administrator confirms the BAA and engagement letter in Settings; then 835 files, contracts and exports can be uploaded here.',
    },
  },
  {
    slug: 'remittances',
    title: 'Remittances',
    shows: 'Loaded remittances with payer, payment date, trace, amount, claims, balanced flag and source file; reversals linked to their originals.',
    empty: { title: 'No remittances loaded', nextStep: 'Upload 835 files on the Uploads screen; each balanced remittance appears here.' },
  },
  {
    slug: 'claims',
    title: 'Claims and lines',
    shows: 'Claims and service lines with charge, paid, patient share, observed and expected allowed, status and reason.',
    empty: { title: 'No claims or lines yet', nextStep: 'Claims and their service lines appear once a remittance loads. Start on the Uploads screen.' },
  },
  {
    slug: 'mapping',
    title: 'Payer and plan mapping',
    shows: 'Unmapped payer and plan combinations with claim counts and dollars, and mapped ones with their contract version.',
    empty: {
      title: 'No payer and plan combinations yet',
      nextStep: 'Combinations appear as remittances load; map each to a contract version or mark it as no agreement.',
    },
  },
  {
    slug: 'contracts',
    title: 'Contracts',
    shows: 'Payer, plan, version, effective window, method, status and coverage share, with the contract calendar.',
    empty: {
      title: 'No contracts on file',
      nextStep: 'Upload a contract PDF or fee-schedule exhibit and tag it to a payer; the contract specialist abstracts it into rate records.',
    },
  },
  {
    slug: 'rate-review',
    title: 'Rate record review',
    shows: 'The cited page beside the abstracted fields, each with its quote and page, and the approval controls.',
    empty: {
      title: 'No rate records awaiting review',
      nextStep: 'Rate records appear here when the specialist abstracts a contract; a version is signed off after every field is approved.',
    },
  },
  {
    slug: 'coverage',
    title: 'Coverage',
    shows: 'The share of lines and dollars priced, the unpriced reasons by count, and what to obtain to raise coverage.',
    empty: { title: 'Nothing to measure yet', nextStep: 'Coverage appears once remittances are loaded and payer plans are mapped.' },
  },
  {
    slug: 'pricing-runs',
    title: 'Pricing runs',
    shows: 'Runs with period, rule release, contract versions, coverage and variance by payer pattern.',
    empty: {
      title: 'No pricing runs',
      nextStep: 'Create a run once remittances are loaded and payer plans are mapped to signed-off contract versions.',
    },
  },
  {
    slug: 'anomalies',
    title: 'Anomalies',
    shows: 'Investigatory cohorts with counts, dollars, and modal and observed amounts.',
    empty: {
      title: 'No anomaly cohorts',
      nextStep: 'Cohorts appear after a pricing run where at least 30 comparable lines exist. They are investigatory, never contract variance.',
    },
  },
  {
    slug: 'cases',
    title: 'Cases',
    shows: 'Cases by stage, payer, owner, deadline and actionable total, with their lines, traces, pursuit cost and timeline.',
    empty: { title: 'No cases', nextStep: 'Open a case from a payer pattern of validated discrepancies after a pricing run.' },
  },
  {
    slug: 'packets',
    title: 'Packet builder',
    shows: 'Citation, line table, traces, narrative with verifier results, interest, evidence list, approval panel and export history.',
    empty: { title: 'No packets', nextStep: 'Open a case and build its dispute packet; a second person approves it before export.' },
  },
  {
    slug: 'submissions',
    title: 'Submissions and responses',
    shows: 'Per case: submissions, payer responses, follow-ups and documents.',
    empty: {
      title: 'No submissions logged',
      nextStep: 'After exporting an approved packet, log its submission here with the date, channel and reference.',
    },
  },
  {
    slug: 'reconciliation',
    title: 'Reconciliation',
    shows: 'ERA to posting to EFT linkage per case line, unmatched adjusted payments, recoupments and ledger entries.',
    empty: {
      title: 'Nothing to reconcile',
      nextStep: 'Upload posting and EFT exports to match payer-approved amounts to posted and deposited cash.',
    },
  },
  {
    slug: 'reports',
    title: 'Reports',
    shows: 'The audit report, monthly summary, ROI statement and coverage report, with export history.',
    empty: { title: 'No reports yet', nextStep: 'Reports can be generated once a pricing run completes.' },
  },
  {
    slug: 'settings',
    title: 'Settings',
    shows: 'Users and roles, grants and agreements, notification preferences, materiality defaults, the access log, export and deletion requests, and billing.',
    empty: {
      title: 'No users or grants yet',
      nextStep: 'Invite users, confirm the agreement chain and approve any firm grant. Administrator-only actions are marked.',
    },
  },
] as const satisfies readonly WorkspaceScreen[];

export type WorkspaceScreenSlug = (typeof WORKSPACE_SCREENS)[number]['slug'];

export function screenHref(slug: WorkspaceScreenSlug): string {
  return `/${slug}`;
}

export function findScreen(slug: WorkspaceScreenSlug): WorkspaceScreen {
  const screen = WORKSPACE_SCREENS.find((candidate) => candidate.slug === slug);
  if (screen === undefined) {
    throw new Error(`unknown workspace screen: ${slug}`);
  }
  return screen;
}
