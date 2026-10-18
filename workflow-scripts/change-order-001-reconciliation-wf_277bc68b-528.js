export const meta = {
  name: 'change-order-001-reconciliation',
  description: 'Read-only reconciliation of PaidWhole Change Order 001 against the built repository: inventory by area, draft reconciliation-001.md and domain-model.md, completeness critique',
  phases: [
    { title: 'Inventory', detail: 'five read-only inventories of what exists against the plan and each change-order item' },
    { title: 'Draft', detail: 'reconciliation report and domain model from the live schema' },
    { title: 'Critique', detail: 'completeness and accuracy check, then corrected drafts' },
  ],
}

const CO = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/change-order-001/docs/product/change-order-001.md'
const OUT = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/co-001'
const ENV = `
CONTEXT AND RULES:
- The product is PaidWhole, the therapy contract-payment platform built in /home/user/PhysicalTherapy (branch claude/build-platform) from the Build Plan in docs/product/PRD.md and its tabs (data-dictionary.md, rules-reference.md, test-matrix.md, milestone-prompts.md), plus sessions.md and unpriced-reasons.md. Milestones 0 to 9 are built and reviewed; milestones 10 and 11 are built and in their last fix pass (an agent is committing in /home/user/PhysicalTherapy right now); milestones 12 and 13 are not started. The README's "Milestone N is not complete" notes say which done-checks need a person or an outside account. docs/adr/ holds every decision.
- The PaidWhole brand (the drop-in kit) is built on a separate branch brand/paidwhole in the worktree /home/user/pw-brand (not yet merged); its ADRs there are 0054 and 0055 (they collide with ADR 0054 on the main branch and will be renumbered at merge).
- The owner issued Change Order 001: ${CO}. Read it in full first. It amends the Build Plan; where they conflict the change order wins; it requires a reconciliation report before any code change, and (CO-02) a domain model document generated from the live schema, approved by the founder before any further schema change.
- YOU ARE READ-ONLY with respect to both repositories: never edit, commit, stash or checkout anything in /home/user/PhysicalTherapy or /home/user/pw-brand. To run anything (tests, migrations, scripts), make your own copy: git clone /home/user/PhysicalTherapy <your scratch dir>/repo (and git clone -b brand/paidwhole /home/user/pw-brand <dir>/brand when you need the brand branch), then pnpm install --frozen-lockfile there. Scratch space: ${OUT}/<your area>/. Postgres 16 at postgres://postgres:test@localhost:5432/postgres; create and drop your own scratch databases (names starting co_). No network beyond npm.
- Be exact and cite evidence: file paths, table and column names, test names, ADR numbers, README lines. "Built" is one of: not started, partial, complete. Never guess; if you cannot tell, say what you checked.
`
const INV_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: {
      ref: { type: 'string', description: 'CO item (e.g. CO-06), acceptance clause, Build Plan section or milestone' },
      requirement: { type: 'string' },
      built: { type: 'string', enum: ['not started', 'partial', 'complete'] },
      evidence: { type: 'string' },
      divergence: { type: 'string' },
      proposed_action: { type: 'string' },
      touches_schema: { type: 'boolean' },
      touches_forbidden_area: { type: 'string', description: 'engine arithmetic, ledger semantics, content pipeline, security program, milestones/gates - or "none"' },
      effort_hours: { type: 'string' },
    }, required: ['ref', 'requirement', 'built', 'evidence', 'divergence', 'proposed_action', 'touches_schema', 'touches_forbidden_area', 'effort_hours'] } },
    decisions_needed: { type: 'array', items: { type: 'object', properties: {
      question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' }, why: { type: 'string' },
    }, required: ['question', 'options', 'recommendation', 'why'] } },
    notes: { type: 'string' },
  },
  required: ['area', 'items', 'decisions_needed', 'notes'],
}

phase('Inventory')
const AREAS = [
  { key: 'brand-copy', prompt: `AREA: CO-01 (brand drop-in) and CO-11 (positioning and product copy). Compare the brand/paidwhole branch with CO-01's wiring steps and acceptance (hex lint, Verified gate, no Google font requests, visual tests at 1280 and 390 px and the report cover with and without the seal) and CO-11's copy rules (tagline, descriptor "Contract-verified payment for therapy groups", independence claim "independent of the EMR and the payer", seal text, printed definition, screening wording, "recovered" always labelled posted or deposited, no "AI", "intelligence" or "ProofPack" in product copy, and the required copy lint over apps/web and report templates). Scan the brand branch's apps/web, report and email templates and packages for every forbidden term and for "recovered" without posted or deposited, and list each hit with file and line. Note the ADR number collision and anything the brand branch did that CO-01 does not ask for (for example packets leading with the practice's letterhead, dark mode off, sign-in layout).` },
  { key: 'domain-model', prompt: `AREA: CO-02 (domain model approval gate) and CO-12 (data model changes). Generate the domain model from the LIVE schema: clone the repository at its current HEAD, create a scratch database, run pnpm db:migrate, then introspect the catalog (every table and view in public: columns with types and nullability, primary keys, unique constraints, foreign keys, check constraints and enums, indexes, ENABLE/FORCE row-level security, every policy with its expression, membership of phi_table_registry, triggers that enforce invariants, and the global tables). Write a reusable script for it under ${OUT}/domain-model/ (Node or Python reading the catalog) and run it; save the generated Markdown as ${OUT}/domain-model/domain-model.generated.md. Then compare table by table and field by field with docs/product/data-dictionary.md and list every divergence (missing, extra, renamed, retyped, nullability, policy differences) with the ADR that explains it if one does. Then assess every CO-12 row against the current schema: case.readiness_grade, independent_signoff_required, case_transition_log, packet_version.deadline_verification_status / disclosure_scope / invalidated_by / invalidated_at, packet_export parts with hashes, roles financial_reviewer and auditor, the four screening tables, practice_settings fields - what exists, what must change, and whether any change touches a ledger or pricing table (CO-12 says none may). Also check whether the brand branch adds any migration.` },
  { key: 'intake-screening-firms', prompt: `AREA: CO-03 (EMR export fixtures: WebPT Billing, Prompt, SPRY, Raintree ERA and payment-posting exports as first-class intake formats, FORMAT_UNCONFIRMED marker, Coverage flag, SYNTHSENDER guard), CO-04 (free no-PHI screening layer: aggregate upload, rejection of PHI columns naming the column, Medicare fee schedule and MA non-contracted pricing with standard adjustments, anomalies and missing-contract coverage, never owed/underpaid/recovered, four screening tables outside the RLS catalog with a no-PHI-columns test, 30-day expiry, rate limits by email domain and IP, 50,000 rows in under 60 seconds, conversion event) and CO-08 (firm organizations and memberships, client invitations accepted by the practice administrator, grants with scope, expiry, approval and revocation on the next request, minimal Portfolio screen; milestone 12 keeps per-practice billing, white-label badge, access log, export and deletion). For each, inventory exactly what exists today: the intake kinds and posting-export templates (milestone 9 built a template mapper and a synthetic posting export), the prospect request form from milestone 11 (request-audit page and prospect tables), the pricing engine's MA non-contracted path and whether it can price aggregate rows without claims, rate limiting from milestone 11, the firm/grant code from milestone 1 (organization kinds, grants, effective permission, revocation) and the milestone 12 prompt. Say what can be reused and what is new, and whether screening pricing can reuse @tp/pricing without changing its arithmetic.` },
  { key: 'packets-cases-tests', prompt: `AREA: CO-05 (packet v0 export), CO-06 (packet and case workbench amendments: readiness grades E0-E3 computed and never set by hand, the eight E3 gates enforced by verifier and server, case numbers - allowed-amount variance headline, insurer-payment variance second, patient responsibility shown never counted, five stage totals separate everywhere including invoices, the six-tab case screen with drill-down from case total to line to trace to rule to evidence, the transition states and closed states with case_transition_log and an unverified deadline blocking actionability and export, exports with stable ID, version, hash, created time, disclosure_scope, approving actor and the five parts, neutral language, identifiers minimized to the recipient, invalidated_by on evidence or rule change with sent versions preserved, executive summary and internal audit manifest as separate outputs, roles financial_reviewer and auditor and independent sign-off thresholds, model boundaries), CO-07 (red-team step at milestones 6 and 11 with the qa-fixture-builder agent: 100+ adversarial cases, prioritized defect list), CO-09 (test matrix additions PKT-01..10, CAS-16..25, LED-12..13, SEC-16..17, SCR-01..06 and docs/product/scorecard.md with five moat and nine commercial measures, each with query and owner) and CO-10 (docs/product/gates.md updates). Inventory exactly what milestones 6, 8 and 9 built: packages/packets (verifier, assembly, identifiers, interest, export with hashes), packet_version and submission tables, case states and their derivation in SQL and @tp/triage, the case detail and packet builder screens, two-person approval and the single-user delay, the dispute window and how deadlines are computed and whether any deadline is "verified", the export parts that exist, the persona matrix. Map the change order's transition states onto the current case states and say what the migration path is without losing history. Check whether "insurer-payment variance" can be derived from stored engine outputs (expected allowed, observed allowed, patient share, paid) without changing the engine's arithmetic, and say exactly how. For CO-09, list which proposed cases already have equivalent tests. For CO-10, say whether a gates document exists in the repo and where the Build Plan states the gates.` },
  { key: 'milestones-sections', prompt: `AREA: per-milestone status for the reconciliation table. For each milestone 0 to 13: what is built (complete, partial, not started), its done-check from PRD 17 and docs/product/milestone-prompts.md and whether it is met, met on synthetic data only, or blocked on a person or account (use the README's notes and the latest review results in git history), where the build diverges from the plan (ADRs that depart from it), and which change-order items attach to it (CO-01 to M3 at the latest, CO-02 to M0-1, CO-03 to M3, CO-04 and CO-05 and CO-07 to M6, CO-06 to M8, CO-07 to M11, CO-08 to "11b", CO-09 test matrix, CO-10 gates). Also the amended Build Plan sections: 3 Users, roles and tenancy; 7 Screens; 8 Domain model; 12 Triage, cases and packets; 18 Testing - what the change order changes in each and what exists. Read git log for the milestone commits and fix commits, docs/adr, README, and the test inventory (count tests by project: unit, db, golden, e2e). Note that milestones 10 and 11 are still in their final fix pass.` },
]
const inv = await parallel(AREAS.map(a => () => agent(`${ENV}\n${a.prompt}`, { label: `inventory: ${a.key}`, phase: 'Inventory', schema: INV_SCHEMA })))
const inventories = inv.filter(Boolean)
log(`${inventories.length} inventories, ${inventories.reduce((n, r) => n + r.items.length, 0)} items, ${inventories.reduce((n, r) => n + r.decisions_needed.length, 0)} decisions raised`)

phase('Draft')
const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    reconciliation_path: { type: 'string' },
    domain_model_path: { type: 'string' },
    generator_path: { type: 'string' },
    pull_requests: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, title: { type: 'string' }, items: { type: 'string' }, acceptance: { type: 'string' }, schema_change: { type: 'boolean' }, effort_hours: { type: 'string' } }, required: ['n', 'title', 'items', 'acceptance', 'schema_change', 'effort_hours'] } },
    decisions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' }, why: { type: 'string' } }, required: ['question', 'options', 'recommendation', 'why'] } },
    summary: { type: 'string' },
  },
  required: ['reconciliation_path', 'domain_model_path', 'generator_path', 'pull_requests', 'decisions', 'summary'],
}
const draft = await agent(`${ENV}
TASK: Write the two documents the change order requires, as drafts in ${OUT}/ (not in either repository).
Inventories from five read-only agents (JSON): ${JSON.stringify(inventories)}

1. ${OUT}/reconciliation-001.md in exactly the change order's format: a title, one short paragraph saying what this is and its date (2026-10-17), then the table | Build Plan section or milestone | Built | Diverges from plan | Change order items that touch it | Proposed action | Effort | with one row for every milestone 0 to 13 and for sections 3, 7, 8, 12 and 18 (Built is not started, partial or complete; Effort in hours). After the table: a short "Change order items" table (CO-01 to CO-12: status today, where it lands, schema change yes/no); then "Proposed pull requests, in order" - numbered, each with its title, the change-order items and milestones it covers, its acceptance check (the change order's own wording where it gives one) and effort - ordered by the rules: milestone order; CO-01 and CO-11 together in the first pull request (the brand branch merge plus the copy lint) before any further screen work; CO-02 (the approved domain model plus a generator and a test that the document matches the schema) before any further schema work; then the follow-ups against completed milestones (CO-03 at M3, CO-04/CO-05/CO-07 at M6, CO-06 at M8) before milestone 12 starts; CO-07 red team at M11 and CO-08 as "11b" before milestone 12; CO-09 and CO-10 with the work they test. Then "Decisions needed from the owner" (each question, the options, a recommendation and why) and "What must not change" restated as checks (engine arithmetic, ledger semantics, content pipeline, security program, milestones and gate dates). Vocabulary: packet, rate record, rule release, readiness grade; never ProofPack. Plain, specific sentences; no filler.
2. ${OUT}/domain-model.md: the domain model generated from the live schema (use the domain-model inventory's generated file and script; re-run the script on a fresh clone and migrated scratch database if anything is missing), organized by area (tenancy and access; documents and remittances; payers, contracts and rates; global content; pricing, triage and cases; packets; ledger; model gateway; billing and onboarding; operations), each table with its columns, keys, PHI flag (registered in phi_table_registry or not), RLS (enabled, forced, policies) and the invariants enforced by triggers or constraints; a "Divergences from the Data dictionary" section listing each with its ADR; and at the end an approval block: "Approved by: ________  Date: ________" left blank for the founder. Copy the generator script to ${OUT}/domain-model/ and report its path.
Report the paths, the ordered pull requests and the decisions.`, { label: 'draft reconciliation + domain model', phase: 'Draft', schema: DRAFT_SCHEMA })

phase('Critique')
const critique = await agent(`${ENV}
You are a demanding reviewer of two drafts written for the owner: ${OUT}/reconciliation-001.md and ${OUT}/domain-model.md (generator under ${OUT}/domain-model/). Draft agent report: ${JSON.stringify(draft)}

Check, with your own evidence from the repositories (read-only; clone to run anything):
- Completeness: every milestone 0-13 row and sections 3, 7, 8, 12, 18 present; every CO item CO-01..CO-12 and every acceptance clause covered by a proposed pull request; every forbidden area respected (no proposal changes engine arithmetic, ledger semantics, the content pipeline, the security program, the milestones or gate dates except CO-10) - flag any proposal that would; the ordering rules (CO-01+CO-11 first, CO-02 before schema work, follow-ups against completed milestones before milestone 12).
- Accuracy: spot-check at least fifteen "built" claims and ten domain-model tables against the code and a migrated scratch database; any wrong claim is a finding.
- Decisions: are the owner decisions real decisions (not things the change order already answers), with sensible options and a recommendation?
- Writing: plain, specific, no filler, the change order's vocabulary.
Then FIX the drafts in place in ${OUT}/ (you may edit those two files and the generator; still never touch the repositories) and report what you changed and any issue you could not resolve.`, { label: 'critique + correct drafts', phase: 'Critique', schema: {
  type: 'object',
  properties: { changes: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } }, accuracy_checks: { type: 'array', items: { type: 'string' } } },
  required: ['changes', 'unresolved', 'accuracy_checks'],
} })

return { inventories, draft, critique }
