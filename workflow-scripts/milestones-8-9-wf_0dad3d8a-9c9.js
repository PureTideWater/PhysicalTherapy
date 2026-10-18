export const meta = {
  name: 'milestones-8-9',
  description: 'Milestones 8-9: packets, verifier, two-person approval, export, submissions; recovery ledger, matching, recoupments, ROI, reconciliation; dashboard, reports and journeys; then review and fixes',
  phases: [
    { title: 'Round 1', detail: 'packets backend || ledger backend' },
    { title: 'Round 2', detail: 'workbench + packet screens || reconcile job + reconciliation screens' },
    { title: 'Round 3', detail: 'dashboard, reports, journeys J8-J10' },
    { title: 'Review', detail: 'money, security, plan conformance' },
    { title: 'Fix', detail: 'two fix passes and a fresh-clone verification' },
  ],
}

const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Repository: /home/user/PhysicalTherapy (git, branch claude/build-platform). Work only inside it. When done, commit with a message "<area>: <summary>", a short body, a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  Do NOT push. Never put a model name or model identifier in code, comments, docs or commit messages.
- The specification is the plan in docs/product/: PRD.md (sections 1-21), data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md (opening prompt and done-check per milestone), unpriced-reasons.md, sessions.md. CLAUDE.md and .claude/rules/*.md are house rules; .claude/skills and .claude/agents describe the expected workflow. Milestones 0-7 are built (content pipeline; tenancy, RLS, audit, identity, route wrapper and registry; synth and the pyx12 oracle; the 835 parser, loader and intake; mapping, coverage and the contract repository; the pricing engine with golden lines, pricing runs, re-run diffs; triage, the five-stage line status, cases, anomalies and the audit report; monitoring jobs and digests). Read docs/adr/*.md and the README first and keep their conventions (@tp/* packages exporting TypeScript source; Vitest projects unit/db/golden; forward-only migrations <YYYYMMDDHHMMSS>_<name>.sql, never edit or rename one that an earlier commit added; roles tp_owner, tp_app, tp_operator, tp_app_dev; withPracticeScope / withJobScope / readWithAudit; the route wrapper and registry with generated cross-tenant route tests; the catalog test and catalog-driven cross-tenant tests for every new PHI table; envelope encryption and sealed objects; @tp/money for every amount; ObjectStore, mail and provider interfaces with local implementations; the audit report's Playwright PDF pipeline in the worker; the monitoring chain whose reconcile step is the seam milestone 9 fills; fixtures from packages/synth, including its posting-export and EFT-export generators and the LED and CAS cases). Follow the plan exactly: nothing it does not ask for, nothing it requires skipped. When the plan is silent, choose the simplest option consistent with it, list it under decisions, and write an ADR when non-obvious.
- Never modify CLAUDE.md, .claude/**, docs/product/PRD.md, data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md, docs/product/diagrams, or .github/workflows/ci.yml. Do not create .claude/settings.json. Never write under content/releases/. Never change an existing golden line's expected values.
- Postgres 16 runs at postgres://postgres:test@localhost:5432/postgres (superuser; CI uses postgres:18). If down: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". ALWAYS run migrations and database tests against your own freshly created scratch database (unique name, dropped after); never migrate the shared "postgres" database by hand. For e2e use your own E2E_DATABASE name and E2E_PORT so you never collide with another agent.
- Network: npm and PyPI work; cms.gov, x12.org, ncdoi.gov are blocked (403) - do not retry. No Docker, no MinIO, no AWS credentials: AWS/Stripe services sit behind interfaces with local implementations and SDK implementations tested with mocked clients. pyx12 is in /root/.venvs/tp-oracle (TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python).
- Toolchain: Node 22 locally (CI Node 24), pnpm 10.28, Python 3.13. Playwright Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH set); never run "playwright install".
- Data: synthetic only (ISA06 SYNTHSENDER, GS02 SYNTH; SYNTHETIC labels on reference data). Never real PHI or real files; never CMS/X12/statute values typed from memory (for example the North Carolina prompt-pay interest rate is not in the plan, so the real rule record leaves it null; tests use a SYNTHETIC fixture value).
- Decisions already taken: a job is attempted at most three times and the third failure raises the operator alert (ADR 0019). Golden lines stay specialist_verified false.
- Quality bar: strict TypeScript; no float on any amount; every behavior has a test; the 100% branch gates on packages/pricing, packages/ledger, packages/edi835 and packages/db/src/authz stay green. Before finishing, run the checks your work touches (pnpm typecheck, lint, lint:logs, test, and as relevant test:db on a fresh scratch database, test:golden, test:oracle, synth --all with a clean git status after, build, test:e2e) and report real outcomes. Never claim a check passed that you did not run.
`
const PARALLEL_NOTE = (mine, theirs) => `
ANOTHER AGENT IS WORKING AT THE SAME TIME on: ${theirs}. You own: ${mine}. Do not edit the other agent's paths. If you must touch a shared file (root package.json, pnpm-lock.yaml, a shared index, the route registry, the nav rail, the case-state derivation), re-read it immediately before editing and keep the edit minimal. Run pnpm install only at the very start if you need new dependencies. Commit only your own paths (git add <paths>, never git add -A); if git reports an index.lock, wait and retry. If a repo-wide check fails only because of the other agent's uncommitted work, verify your own work in a clean git worktree of your commit instead, and say so.
`
const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    built: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    interfaces: { type: 'string', description: 'public APIs, file formats and table names later agents must use' },
    commit: { type: 'string' },
  },
  required: ['summary', 'built', 'checks', 'decisions', 'not_done', 'interfaces', 'commit'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      area: { type: 'string', enum: ['packets', 'verifier', 'approval', 'ledger', 'matching', 'roi', 'web', 'db', 'other'] },
      file: { type: 'string' }, issue: { type: 'string' }, plan_reference: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'area', 'file', 'issue', 'plan_reference', 'fix'] } },
    checks_run: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checks_run'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, reason: { type: 'string' } }, required: ['finding', 'reason'] } },
    checks: BUILD_SCHEMA.properties.checks,
    commit: { type: 'string' },
  },
  required: ['fixed', 'rejected', 'checks', 'commit'],
}
const brief = r => r ? JSON.stringify({ summary: r.summary, interfaces: r.interfaces, decisions: r.decisions, not_done: r.not_done }) : 'null (agent failed)'

// ---------------- Round 1
phase('Round 1')
const [packets, ledger] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('packages/packets, packages/db migrations with timestamps 20261023090000-20261023119999 for packet, packet_version, submission, payer_response, the packet export code in apps/worker (PDF through the existing Playwright pipeline, CSV), the case-state derivation for submissions, and their tests; no web screens', 'packages/ledger, migrations 20261023120000-20261023149999 for ledger_entry, posting_row, eft_row, roi_statement, and the ledger matching code')}

TASK: Milestone 8, part A - packets, the verifier, approval and export (backend). Read the Milestone 8 prompt; PRD 1 (rules), 3 (billing manager "must not approve a packet she drafted"; the two-person rule), 5 (J9, J10 first sentence), 6 (Packet builder, Submissions and payer responses rows), 8 (packet, packet_version, submission, payer_response; Invariants: "a packet_version with verifier_passed = false cannot have an approval"), 12 (The packet, Approval, Submission response and follow-up, Write-offs and reopening, the headline), 14 (draftPacketNarrative's verifier rules - the model arrives in milestone 10, but the verifier is a milestone 8 hard gate), 16 (Threats: a wrong identifier in a packet; a narrative inventing a number), 20 (two-person approval for single-user practices: 24-hour delay with an audit flag); docs/product/rules-reference.md (state prompt-pay; interest is its own packet line, never in expected allowed); .claude/rules/money-and-contracts.md; the data dictionary rows for packet, packet_version, submission, payer_response; test-matrix CAS-08..CAS-15.

Build:
1. Migrations and Drizzle schema per the data dictionary (PHI tables). Enforced in SQL for every role: a packet_version is immutable once written (a new edit creates a new version and clears approval - CAS-13); approval requires verifier_passed = true; the person who drafted or last edited a version cannot approve it (CAS-09), checked through the milestone 1 permission function; a practice with one user gets a 24-hour delay from the last edit before self-approval and an audit flag shown in reports (CAS-10); approval records user, time and the version's hash.
2. packages/packets: assemble a packet version from a case and approved records only - practice and payer identification; the contract citation (version, document, page, quoted clause) and the rule release; the pattern statement (what the contract requires, what the remittances show, the delta and the count); the line schedule (claim control numbers, service dates, codes, units, expected, observed, variance, each with its trace reference); interest where a state prompt-pay rule applies, computed by code from the state_prompt_pay record as its own line and never in expected (CAS-15; when the record's rate is null the line says interest cannot be computed and lists it as an evidence gap); the evidence list; the requested action (reprocess the listed claims at the contract rate); reviewer name and approval record. The narrative is entered by a person in v1-before-the-gateway (a deterministic code-built draft of the pattern statement from the facts is allowed; no model).
3. The deterministic verifier (hard gate, no bypass anywhere): every date, code, unit, amount, count and identifier in the narrative must match the inputs exactly; any figure not in the input fails (CAS-08); any sentence without a citation marker fails; the result and a report of each mismatch are stored on the version.
4. Identifiers: patient name, member ID and claim numbers are placeholders in drafts (CAS-11) and are inserted by code from the canonical record only at export, so no draft ever holds the wrong patient's identifiers.
5. Export: PDF (the worker's Playwright pipeline) and CSV schedule, stored sealed with the practice key, their SHA-256 hashes recorded on the version (CAS-12) and carried into the submission log; exporting needs an approved version.
6. Submissions (logged by the customer: date, channel such as payer portal, fax, mail or provider-relations email, reference, user, the exported hash; the product never submits) and payer responses (accepted, partial, denied, info_requested, reprocessed_no_change, with amounts and a document; a denial with a reason can reopen the case for a second-level dispute within the next window), follow-ups defaulting to 45 days (CAS-14). Case states submitted, awaiting_response, partially_resolved and resolved now derive from lines and submissions (only closed_written_off is set by hand). Recording a payer response never creates a ledger entry and never moves a line to recovered (LED-01); the ledger agent owns ledger entries and the payer_approved and recovered stages - expose a function they call.
7. Tests (db and unit with fast-check for the verifier) for CAS-08..CAS-15 and the invariants. Report the APIs in "interfaces".`, { label: 'R1 packets backend', phase: 'Round 1', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('packages/ledger, packages/db migrations with timestamps 20261023120000-20261023149999 for ledger_entry, posting_row, eft_row, roi_statement, the matching code, posting-export template mapping, and their tests; no web screens', 'packages/packets, migrations 20261023090000-20261023119999 for packet, packet_version, submission, payer_response, packet export, and the submission-driven case states')}

TASK: Milestone 9, part A - the recovery ledger and matching (backend). Read the Milestone 9 prompt; PRD 1 ("nothing is called recovered until the money has posted"), 5 (J10), 6 (Recovery ledger and reconciliation row), 8 (ledger_entry, posting_row, eft_row; The status machine: payer approved and recovered), 13 (all of it: Entries, Matching steps 1-4, Recoupments and reversals, ROI statement, Tests that gate the ledger), 18 (the ledger oracle), 20 (proof level: posted, with deposited where exports exist; posting-export templates: one per practice-management system, mapped at onboarding); .claude/rules/money-and-contracts.md ("Recovered = sum(posted or deposited) - recouped - reversed"); .claude/agents/payment-engine-reviewer.md; the data dictionary rows for ledger_entry, posting_row, eft_row, roi_statement and practice.settings (proof level); test-matrix LED-01..LED-11; packages/synth's posting-export and EFT-export generators and LED fixtures.

Build:
1. Migrations and Drizzle schema per the data dictionary (PHI tables). ledger_entry is signed and append-only: triggers reject UPDATE and DELETE for every role (LED-10: a direct UPDATE or DELETE by the application role fails); corrections are new entries; stages approved, posted, deposited, recouped, reversed, adjusted, interest; evidence kind and id; allocated flag; created_by user or system; reason.
2. packages/ledger (100% branch coverage gate): pure functions for totals - recovered for a case, practice, period or report = sum of posted or deposited entries (by the practice's configured proof level) minus recouped and reversed; approved shown as its own stage and never summed into recovered; interest its own category beside recovered principal; forward balances (PLB FB) recorded and not counted until resolved; fast-check properties (a reversed manual match nets to zero; a recoupment reduces recovered by exactly its amount; totals never mix stages).
3. Matching services, each under withJobScope for one practice:
   a. Remittance to case line: each new claim against open case lines by payer claim control number first, then patient control number plus service date plus code; a higher observed allowed than the original creates an approved entry for the difference, attaches the new claim to the line and moves the line to payer_approved; same or lower is recorded as a payer response of kind reprocessed_no_change (through the packets agent's function); an adjusted payment matching no case is listed for manual matching and creates no entry (LED-03).
   b. Posting export: templates per practice-management system (column mapping stored once per practice at onboarding; one built-in template matching packages/synth's synthetic posting export), rows into posting_row, matched to remittances by check or trace number and amount with zero tolerance; line-level where the export has lines, otherwise check-level with the case's share allocated pro rata and flagged allocated (LED-09); posted entries (LED-04); duplicate uploads of the same export create no duplicate matches (LED-08).
   c. EFT or bank export: rows into eft_row, matched by TRN02 and amount; batch-level matches flagged; deposited entries (LED-05).
   d. Unmatched items listed with evidence side by side; manual matching records the user; reversing a match writes an exactly offsetting reversed entry (LED-07). Nothing unmatched counts.
   e. Recoupments: a PLB WO or a reversal claim against a case line creates a recouped entry at once, reduces recovered, reopens the case with a note and notifies the owner (LED-06); PLB L6 or line interest becomes an interest entry.
   Lines move to recovered only when the proof level is met and back (with a negative entry, never an edit) on recoupment.
4. The ROI statement: quarterly and on demand per practice - fees paid in the period (from billing, zero until milestone 11 wires Stripe; keep the seam), recovered principal and interest net, approved but not posted, actionable in open cases, pursuit hours logged, the ratio of net recovered to fees - every figure linked to its entries; a test recomputes it from entries (LED-11).
5. The ledger oracle (PRD 18): synthetic posting and EFT exports with known outcomes (a recovery, a partial, a recoupment after deposit, a reversed match, a duplicate export) whose totals must equal the known outcomes; and the flagged-as-recovered shortcut test (anything that would count a dollar as recovered without a posted or deposited entry fails - the milestone's "the flagged-as-recovered test fails as it should").
Report the APIs in "interfaces".`, { label: 'R1 ledger backend', phase: 'Round 1', schema: BUILD_SCHEMA }),
])

// ---------------- Round 2
phase('Round 2')
const [workbench, recon] = await parallel([
  () => agent(`${ENV}${PARALLEL_NOTE('apps/web Cases list and detail (the full workbench), the Packet builder, Submissions and responses screens and their routes; small additions to packages/packets or packages/triage queries the screens need', 'the worker reconcile job, posting and EFT export uploads, the Reconciliation screen and the ROI statement report')}

TASK: Milestone 8, part B - the workbench. Packets backend report: ${brief(packets)} Ledger backend report (for the stage numbers the screens show): ${brief(ledger)}

Read PRD 5 (J8, J9, J10), 7 (Cases, Packet builder, Submissions and responses screens; the information architecture rules: every destructive action confirms with the consequence stated; dollar figures carry their stage label; "recovered" only beside stage-five amounts), 12 (all), the Milestone 8 prompt and test-matrix CAS-03..CAS-15.

Build, through the route wrapper and registry, server-side pagination and filters in the URL, opaque IDs, readWithAudit, and every empty, loading, error and permission state:
1. Cases: list by stage, payer, owner, deadline and actionable total, with deadline colors; detail with lines (a line past its window struck through with WINDOW_PASSED and out of the actionable total), traces, deadline, pursuit cost, notes and a timeline; create a case from a payer pattern; assign an owner; set materiality; write off a line with a reason from the closed list (confirm with the consequence); reopen with a reason; open the packet. Cases nearing deadline and overdue follow-ups feed the dashboard.
2. Packet builder: citation, line table with traces, narrative editor with live verifier results (mismatches shown; approval blocked while any fail), interest line, evidence list, approval panel (request approval; approve as a second person; the drafter is refused with the reason; the single-user 24-hour delay shown with its countdown and audit flag), export (PDF and CSV; identifiers appear only in the export, shown as placeholders on screen), export history with hashes.
3. Submissions and responses: per case, log a submission (date, channel, reference; the exported hash attached), log a payer response with its document (accepted, partial, denied, info requested), follow-ups with the 45-day default and overdue ones surfaced; a denial with a reason can reopen for a second-level dispute.
4. Playwright e2e: draft a packet with a figure not in the input and see approval blocked; the drafter cannot approve; a second user approves; export and see the hash in the submission log (the milestone 8 done-check, end to end in the browser).`, { label: 'R2 workbench + packet screens', phase: 'Round 2', schema: BUILD_SCHEMA }),
  () => agent(`${ENV}${PARALLEL_NOTE('apps/worker reconcile job (replacing the monitoring seam), intake handling for posting_export and eft_export documents, apps/web Reconciliation screen, posting-template mapping screen, ROI statement report (PDF and CSV) and their routes', 'apps/web Cases, Packet builder and Submissions screens')}

TASK: Milestone 9, part B - reconciliation in the product. Ledger backend report: ${brief(ledger)} Packets backend report: ${brief(packets)}

Read PRD 5 (J10, J11, J12 quarterly ROI), 7 (Reconciliation and Reports screens), 13 (all), 20 (proof level; posting-export templates), the Milestone 9 prompt, test-matrix LED-01..LED-11 and JOB-01.

Build:
1. The reconcile job in the monitoring chain (replacing the milestone 7 seam): after parse, match new remittances to open case lines; after a posting or EFT export is uploaded, match its rows; recoupments from PLB and reversals; idempotent by its data (JOB-01), one practice per job, three attempts then the alert.
2. Uploads of posting exports and EFT or bank exports through the existing intake (kinds posting_export and eft_export; scanned and sniffed like every upload), parsed with the practice's mapped template; the template mapping screen used once at onboarding (column mapping preview on a sample, saved per practice-management system).
3. The Reconciliation screen: ERA to posting to EFT linkage per case line; unmatched adjusted payments, postings and deposits with evidence side by side; recoupments; ledger entries; upload posting and EFT exports; match manually (records the user); reverse a match with a reason (confirm with the consequence); unmatched items never count and every match shows its evidence.
4. The ROI statement report (quarterly and on demand): PDF through the worker's Playwright pipeline and CSV, every figure linked to its entries, the proof level stated (a practice that cannot supply deposit data says "posted"), fees from billing (zero until milestone 11, stated).
5. Digest and notifications: recoveries posted now real (counts and totals only); the case owner notified on recoupment.
6. Integration tests through the job chain on synthetic files for every LED case, and Playwright e2e: an adjusted remittance creates a payer-approved amount; a posting export moves it to posted; an EFT export to deposited; a recoupment reduces recovered; the ROI statement recomputes from entries (the milestone 9 done-check in the browser).`, { label: 'R2 reconcile + reconciliation screens', phase: 'Round 2', schema: BUILD_SCHEMA }),
])

// ---------------- Round 3
phase('Round 3')
const dash = await agent(`${ENV}
TASK: The practice dashboard, the Reports screen and the end-to-end journeys for milestones 6 to 9. Reports - packets: ${brief(packets)} ledger: ${brief(ledger)} workbench: ${brief(workbench)} reconciliation: ${brief(recon)}

Read PRD 5 (J4 to J12), 6 (Reports and exports row; cross-cutting requirements), 7 (Practice dashboard and Reports screens; information architecture rules), 12 (What a customer sees as the headline), 18 (Layers: end to end with Playwright, journeys J2, J4 to J12 on synthetic data: upload to packet export to recovery; "the journey passes on a fresh database").

Build:
1. Practice dashboard: data freshness (last file, last run), coverage, open cases by stage, deadlines in 14 days, overdue follow-ups, recovered this quarter (stage five only), last run status with the "run failed" banner and its job reference; jump to any queue; the empty state "Upload your first 835 files"; every number links to the stage it came from; headline totals never mix stages (three numbers: actionable, payer approved, recovered; flagged and validated below with their labels).
2. Reports: the audit report (from milestone 6), the monthly summary (from milestone 7), the ROI statement (from milestone 9) and the coverage report (new: PDF and CSV of the Coverage screen); generate, download, share within the organization; export history; line-level exports available only to roles with PHI access and logged; a viewer cannot export line-level PHI (PRD 6 acceptance); every total links to its stage.
3. Playwright journeys on a fresh database with synthetic data, one spec per journey where not already covered: J4 (uploads with receipts and a held file showing its segment and position), J5 (contract upload, abstraction, approval, sign-off), J6 (mapping), J7 (pricing run), J8 (triage to case, write-off and reopen), J9 (packet, verifier, approval, export, submission), J10 (payer response, adjusted remittance, posting, deposit, recovered, recoupment), J11 (monthly monitoring through the digest outbox), J12 (reports, attestation, downloads, viewer refused line-level export). Reuse existing specs; do not duplicate them.
4. Accessibility on the screens touched (keyboard navigation, labels, contrast) with an automated check in the e2e suite (axe-core or an equivalent npm package).
Run the full check list before committing. Commit with area "web".`, { label: 'R3 dashboard + reports + journeys', phase: 'Round 3', schema: BUILD_SCHEMA })

const reports = { packets: brief(packets), ledger: brief(ledger), workbench: brief(workbench), recon: brief(recon), dash: brief(dash) }

// ---------------- Review
phase('Review')
const REVIEW_BASE = `${ENV}
You are a READ-ONLY reviewer: run any commands, write only under /tmp/claude-0/review-m8-9-<your lens>, never edit tracked files. The work under review is git diff 5cf4636..HEAD (milestones 8 and 9 plus the dashboard, reports and journeys). Confirm every finding with a probe (a throwaway test, SQL as the application role, a crafted fixture, an HTTP request) before reporting it. Build reports: ${JSON.stringify(reports)}
`
const reviews = await parallel([
  () => agent(`${REVIEW_BASE}
LENS: money and approval. Apply .claude/agents/payment-engine-reviewer.md to packages/ledger, packages/packets (verifier, interest, line schedule), the matching services and the ROI statement: floats; ledger totals that include approved-but-unposted entries; recovered computed any way except sum(posted or deposited by proof level) - recouped - reversed; interest mixed with principal; forward balances counted; pro-rata allocation that does not sum exactly to the check (rounding residue); duplicate matches from a re-uploaded export; reversed matches that do not net to zero; a recoupment that does not reduce recovered by exactly its amount; any path where a payer response, a submission or a model output creates a ledger entry or moves a stage; the verifier passing a narrative with a figure, date, code, count or identifier not in the input (fuzz it); identifiers present in drafts; approval by the drafter or last editor through any path (SQL as the application role, the server action, a crafted request); the single-user delay; an approval surviving an edit; an export without approval.`, { label: 'review: money + approval', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW_BASE}
LENS: security. Apply .claude/agents/security-reviewer.md to everything added: new PHI tables (practice_id, forced RLS, exact tenant policy, registry, generated tests), exports (sealed with the right practice key, opaque keys, hashes, role-gated and logged; a viewer refused line-level PHI), CSV injection in every CSV export, identifiers in URLs, filenames, emails, notifications, digests and errors, jobs spanning practices, posting and EFT uploads (scan, sniff, limits; formula injection in parsed cells), manual matching across practices, routes missing from the registry, role checks only outside the handler, actions without audit events, append-only ledger and immutable packet versions under every role.`, { label: 'review: security', phase: 'Review', schema: FINDINGS_SCHEMA }),
])
const plan = await agent(`${REVIEW_BASE}
LENS: plan conformance and fresh checkout. First: git clone /home/user/PhysicalTherapy /tmp/claude-0/review-m8-9-plan/repo and run pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all (git status clean after), test, test:golden, test:oracle, a fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff; record each failure with output. Then compare with the done-checks of milestones 8 and 9 (docs/product/milestone-prompts.md and PRD 17), PRD 4 (Monitoring v1 includes), 5 (J8-J12), 6 (Packet builder, Submissions, Recovery ledger, Reports rows), 7 (every screen built), 8, 12, 13, 18 (ledger oracle, end-to-end journeys), 20, the data dictionary (every field of every new table), and every CAS and LED case in the test matrix. Report what is missing, wrong, beyond the plan, or a faked check.`, { label: 'review: plan + fresh checkout', phase: 'Review', schema: FINDINGS_SCHEMA })
const findings = [...reviews, plan].filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} findings (${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} major)`)

// ---------------- Fix
phase('Fix')
const FIX_TASK = (label, list) => `${ENV}
TASK: Fix review findings for ${label}. Independent reviewers produced these findings (JSON):
${JSON.stringify(list, null, 1)}

For each: verify it against the code and the plan first. Fix every real blocker and major finding (security findings take the safer fix), and every real minor one that is cheap and in scope. Do not widen scope beyond the plan. For any finding you judge wrong or out of scope, say why. Run the affected checks and report them. Commit with area "fix".`
const A = findings.filter(f => ['ledger', 'matching', 'roi'].includes(f.area))
const B = findings.filter(f => !['ledger', 'matching', 'roi'].includes(f.area))
const fixA = await agent(FIX_TASK('the ledger, matching and the ROI statement', A), { label: 'fix A: ledger', phase: 'Fix', schema: FIX_SCHEMA })
const fixB = await agent(`${FIX_TASK('packets, the verifier, approval, web, database and everything else', B)}

After committing, verify the whole repository from a fresh clone (git clone /home/user/PhysicalTherapy /tmp/claude-0/fix-m8-9-verify; pnpm install --frozen-lockfile, typecheck, lint, lint:logs, verify-content, synth --all with a clean git status after, test, test:golden, test:oracle, fresh database db:migrate + test:db, db:seed, build, test:e2e, cdk:diff) and report each result. If something fails, fix it and commit again.`, { label: 'fix B: packets/web + verify', phase: 'Fix', schema: FIX_SCHEMA })

return { reports, findings, fixA, fixB, raw: { packets, ledger, workbench, recon, dash } }
