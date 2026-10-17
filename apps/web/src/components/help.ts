import type { ShellSection } from './shell';

/**
 * In-app help per screen (PRD 19, Support: "In-app help per screen; a support address that creates a ticket";
 * docs/adr/0053): what the screen is for and what to do next, shown from the help link in every screen's header,
 * which opens a ticket naming the screen. No help text names a record or a person.
 */
export const HELP: Readonly<Record<ShellSection, string>> = {
  home: 'Your starting point: pick a practice in the switcher, or open the console if you work for PaidWhole.',
  practice: 'The dashboard: what the latest runs found, by stage, and the queues waiting on you. Dollar figures carry their stage; only stage-five amounts are recovered.',
  uploads: 'Upload 835 remittances, contracts, posting exports and bank exports. Each file is scanned before it is read; a held file says why.',
  remittances: 'Every remittance loaded, by payer and payment, with what was held and why.',
  claims: 'Claims and their service lines, with the expected amount where a signed-off contract prices them, and the reason where none does.',
  mapping: 'Match each payer and plan in your remittances to its contract, so its lines can be priced.',
  coverage: 'Which payers and codes your contracts price, and which lines go unpriced and why.',
  pricing_runs: 'Each run prices every line under the approved contract versions of a numbered rule release. A run never changes; a new release means a new run.',
  anomalies: 'Patterns triage found across lines. Review one to confirm it, or ask for validation.',
  cases: 'Shortfalls grouped by payer pattern. Work a case into a packet a person approves; the drafter never approves their own.',
  reconciliation: 'Later remittances, postings and deposits matched to approved cases. A line is recovered only with a ledger entry at the practice’s proof level.',
  reports: 'The audit report, coverage report, monthly summary and ROI statements, with their export history.',
  notifications: 'In-app notices: digests, finished runs and cases nearing their deadline. Counts and totals only.',
  contracts: 'Your payer contracts and their versions. A rate is used only once a specialist signs it off with its page and quote.',
  abstraction: 'Abstract a contract into rate records with their evidence; each is signed off before any line is priced with it.',
  devices: 'The browsers you have signed in from. Revoke one you do not recognize; its session ends at once.',
  notification_preferences: 'Which digests and notices you receive, and how often.',
  organizations: 'Organizations, practices, members, invitations and agreements. Directory records only.',
  support: 'Support grants: time-boxed access to one practice for one ticket, with its reason; the practice administrator is told.',
  specialist_queue: 'Contracts waiting for abstraction or questions from customers.',
  rule_releases: 'Numbered rule releases and their contents. Published by CI from reviewed drafts; never edited by hand.',
  billing: 'Your plan, payment method (ACH or card) and invoices.',
  console_billing: 'Billing standing per organization, and audit invoices.',
  settings: 'Your practice’s settings. Sections marked admin are changed by the practice administrator; the access log is read-only.',
  users: 'Invite people, change their roles, end memberships and send expired invitations again.',
  prospects: 'Audit requests from the public form. Convert one to create its practice group.',
  terms_versions: 'Publish a version of the terms of use; every customer accepts it before continuing.',
  tickets: 'Tickets from every screen’s help, answered within the published target.',
  status_admin: 'The public status page’s components and incidents, and the maintenance switch.',
  compliance: 'The SOC 2 Type I evidence checklist: each control’s evidence, the policies, and what people must record.',
};
