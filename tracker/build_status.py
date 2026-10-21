"""Builds the PaidWhole Build Tracker's data files from the workflow journals, git and the
milestone register below. Run: python3 -I build_status.py <out_dir>. Edit MILESTONES, BLOCKERS,
PLANNED and ETA as the build moves; the running/queued state of every agent comes from the
journals, so it is always current when this runs."""
import json, os, subprocess, sys, datetime as dt

OUT = sys.argv[1]
REPO = "/home/user/PhysicalTherapy"
WF = "/root/.claude/projects/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/subagents/workflows"
# The session of 2026-10-14 to 2026-10-21 kept its journals in a container that is gone. Its last published
# work.json (2026-10-18 17:22 UTC) is kept here; a step whose journal is missing takes its state from it.
FROZEN = {(r["batch"], r["step"]): (r["status"], r["started"], r["finished"])
          for r in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "frozen-work-2026-10-18.json")))}
NOW = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

def iso(t): return t.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
def mtime(p): return dt.datetime.fromtimestamp(os.path.getmtime(p), dt.timezone.utc)

# ---- The plan's fourteen milestones (PRD 17), with the plan's own hour estimates as weights.
# stage: Built | Fixing | In review | Building | Queued
# check: Met | Needs a person | Not yet   (the milestone's own done-check, PRD 17)
MILESTONES = [
  # id, name, release, low, high, stage, check, note
  ("M0", "Repository, configuration, global content", "Audit v0", 35, 50, "Built", "Needs a person", "Real 2026 CMS and X12 files must be loaded for release 1"),
  ("M1", "Tenancy and security foundation", "Audit v0", 90, 130, "Built", "Needs a person", "Restore drill has to run on AWS staging"),
  ("M2", "Synthetic data and the 835 parser", "Audit v0", 90, 130, "Built", "Needs a person", "Code-set check waits on release 1"),
  ("M3", "Intake, documents and mapping", "Audit v0", 40, 60, "Built", "Met", "2 GB zip run passed"),
  ("M4", "Contract repository", "Audit v0", 60, 90, "Built", "Met", ""),
  ("M5", "Expected-payment engine, phase one", "Audit v0", 70, 100, "Built", "Needs a person", "Specialist verifies golden lines"),
  ("M6", "Anomalies, status model, audit report", "Audit v0", 60, 90, "Built", "Needs a person", "Three real audits to reproduce"),
  ("M7", "Engine phase two and monthly runs", "Monitoring v1", 60, 90, "Built", "Needs a person", "Specialist review; real release 2"),
  ("M8", "Workbench, cases and packets", "Monitoring v1", 90, 130, "Built", "Met", ""),
  ("M9", "Recovery ledger and reconciliation", "Monitoring v1", 60, 90, "Built", "Met", ""),
  ("M10", "Model gateway", "Monitoring v1", 50, 70, "Built", "Needs a person", "Evaluation gates need model access"),
  ("M11", "Sign-in, billing, production readiness", "Monitoring v1", 60, 90, "Built", "Needs a person", "Real Stripe test ACH; AWS deploy"),
  ("CO1", "Change order 001: pull requests 1 to 16", "Change order 001", 551, 935, "Building", "Not yet", "Step 0, PRs 1 to 6, PR 5b, governance and the screen fixes merged; PR 6b in design"),
  ("M11b", "Firm grants and minimal portfolio (change order PR 17)", "Change order 001", 34, 60, "Queued", "Not yet", "Inserted by the change order before milestone 12"),
  ("M12", "Firm organizations and portfolio", "Firm v1.5", 60, 90, "Queued", "Not yet", "Starts after the change order's 17 pull requests"),
  ("M13", "Intelligence and hardening", "Intelligence v2", 70, 100, "Queued", "Not yet", "Pen test and SOC 2 Type II are outside work"),
]

# ---- Batches: each a workflow run (journal) or a planned list of steps not yet launched.
# label -> plain-language step name
FRIENDLY = {
  "set up the worktree and split the work": "Set up and plan the work",
  "formats, generators, templates": "Vendor formats, synthetic files, posting templates",
  "fixture guard, check, approval hook": "Fixture guard, CI check, approval-line guard",
  "review: ledger and intake": "Ledger and intake review",
  "review: guard robustness": "Try to get past the guards",
  "review: guardrails and security": "Guardrails and security review",
  "port generator, regenerate, tests, CLAUDE.md": "Domain model tool, document, drift test, CLAUDE.md rule",
  "review: document accuracy": "Check the document against the live database",
  "review: gate robustness": "Check the drift and approval tests",
  "review: guardrails and CLAUDE.md": "Guardrails and CLAUDE.md review",
  "merge brand into the head": "Merge the brand branch into the finished code",
  "CO-01 acceptance gaps and email art": "Brand checks: colors, fonts, email logo from the static host",
  "CO-11 copy constants, labels and copy lint": "Copy: tagline, descriptor, recovered labels, copy check",
  "visual baselines, ADR 0058, docs, full checks": "Screenshot baselines, decision record, docs, full tests",
  "review: brand and copy with screenshots": "Brand and copy review with screenshots",
  "review: guardrails and merge": "Guardrails and merge review",
  "review: copy lint and labels": "Copy check review",
  "fix review findings": "Fix review findings",
  "fresh-clone verification": "Full test run in a clean checkout",
  "privacy: the viewer sees no service date": "Privacy: hide service dates from viewers on every page",
  "numbers: coverage share, dashboard coverage, audit report": "Numbers: coverage share, dashboard coverage, audit report",
  "layout and copy": "Page widths, table headers, wording",
  "review: privacy and security": "Privacy and security review",
  "review: correctness and UI": "Correctness and screen review",
  "fresh-clone verification and re-shot tour": "Full test run and new screenshots",
  "set up the worktree and the contract": "Set up and fix the design both builders follow",
  "schema, normalizer, loading, duplicate rule": "Database change, export reader, loading, one-payment-once rule",
  "Coverage flag, upload and receipts, e2e": "Coverage flag, upload and receipt wording, browser tests",
  "review: loader correctness": "Check exports load exactly like 835s",
  "review: duplicates and idempotency": "Try to load one payment twice",
  "review: security and tenancy": "Security and practice-isolation review",
  "review: guardrails and the domain model": "Guardrails and domain model review",
  "fresh-clone verification and approval summary": "Full test run and your approval summary",
  "deadline rule, window evidence, release 900005, AUDIT-01": "Deadline rule, contract-window evidence, synthetic release, audit check",
  "tp-packet/2, verifier at export, attestation, e2e": "Packet format, check at export, your sign-off, browser tests",
  "review: engine, deadline rule and AUDIT-01": "Engine, deadline rule and audit review",
  "review: attack the verifier and the hash": "Try to export a packet with a made-up figure",
  "review: security, attestation and tenancy": "Security, sign-off and practice-isolation review",
  "screening tables, adapter, jobs, db tests": "Screening tables, pricing adapter, expiry, rate limits",
  "public screening pages, parser, results, e2e": "Public screening pages, upload check, results, browser tests",
  "review: engine and adapter": "Engine and pricing-adapter review",
  "review: privacy, security and abuse": "Privacy, security and abuse review",
  "review: try to upload PHI": "Try to get patient data through the upload",
  "find: decisions-a": "Recheck decisions D1-D12 for the best option",
  "find: decisions-b": "Recheck decisions D13-D24 for the best option",
  "find: decisions-c": "Recheck decisions D25-D36 and PRs 7-17",
  "find: deferred": "Recheck everything deferred or left open",
  "find: accuracy": "Look for any figure that could be wrong or misleading",
  "find: experience": "Walk every role's screens for friction",
  "find: growth": "Look for limits on scale and growth",
  "synthesize the ranked upgrades": "Check every idea, rank the upgrades for you",
  "find: security-privacy": "Security and privacy",
  "find: compliance-legal": "Compliance and legal",
  "find: reliability-operations": "Reliability and operations",
  "find: cost-efficiency": "Cost to serve each practice",
  "find: dispute-success": "Will the packets win disputes",
  "find: time-to-value": "Time to a first finding, and renewals",
  "find: resilience-to-change": "Keeping up with CMS and payer changes",
  "find: ai-safety": "AI safety and model quality",
  "find: maintainability": "Code health and development speed",
  "find: business-readiness": "Business model and due diligence",
  "merge both audits and rank": "Check every idea, merge both audits, rank for you",
  "hooks, approval summary and check, guide": "Governance: hooks on, approval summary and check, your guide",
  "review: try to bypass it": "Try to get past the new protections",
  "review: the founder's guide": "Read your guide as you would",
  "download rule, rulings, domain model": "Sign-off only after both files are downloaded; your rulings recorded",
  "review: forge a download": "Try to sign off without downloading",
  "review: guardrails and rulings": "Guardrails and rulings review",
  "fresh-clone verification and new hash": "Full test run and the new fingerprint",
  "two engine figures, before sequestration, rulings": "Two engine figures, compare before sequestration, your rulings",
  "review: engine and figures": "Engine and figures review",
  "review: guardrails and wording": "Guardrails and wording review",
  "review: guardrails, wording, domain model": "Guardrails, wording and domain model review",
  "R1 model gateway core": "Model gateway",
  "R1 production compute (CDK)": "Production servers in AWS CDK",
  "R2 eval harness + gateway in product": "Model evaluation and AI features in screens",
  "R2 Stripe billing": "Stripe billing",
  "R3 customer sign-in + readiness": "Customer sign-up, settings, security hardening",
  "review: security": "Security review",
  "review: gateway + billing correctness": "Gateway and billing review",
  "review: plan + fresh checkout": "Plan check and full test run",
  "fix A: gateway/eval": "Fixes: gateway and evaluation",
  "fix B: infra/billing/web + verify": "Fixes: billing, sign-up, web; final test run",
  "brand build": "Apply the PaidWhole brand",
  "review: brand conformance": "Brand review with screenshots",
  "review: correctness + safety": "Seal and safety review",
  "brand fix": "Brand fixes",
  "inventory: brand-copy": "Check brand and copy items",
  "inventory: domain-model": "Generate the domain model from the live schema",
  "inventory: intake-screening-firms": "Check intake formats, screening, firm access",
  "inventory: packets-cases-tests": "Check packets, cases, tests and gates",
  "inventory: milestones-sections": "Check every milestone and amended section",
  "draft reconciliation + domain model": "Write the reconciliation and domain model",
  "critique + correct drafts": "Review and correct both documents",
  "design: zip4-settings": "Design: ZIP+4 localities, pricing settings at onboarding",
  "design: consumer-time": "Design: the screening's own consumer, its monthly cost, the 60-second check",
  "design: email-streams": "Design: the screening's email kept apart from customer email",
  "review: zip4-settings": "Design review: ZIP+4 and pricing settings",
  "review: consumer-time": "Design review: consumer, cost and time check",
  "review: email-streams": "Design review: email streams",
  "revise: zip4-settings": "Design revised: ZIP+4 and pricing settings",
  "revise: consumer-time": "Design revised: consumer, cost and time check",
  "revise: email-streams": "Design revised: email streams",
  "plan: pr6b": "One plan: pull requests, migration, your questions in one batch",
}
CO_STEPS = [
  "Step 0: milestones 10-11 green, CI running on GitHub",
  "PR 1: brand merge and copy check (CO-01, CO-11)",
  "PR 2: domain model and your sign-off (CO-02)",
  "PR 3: EMR export fixtures and fixture guard (CO-03)",
  "PR 4: EMR exports as intake (CO-03)",
  "PR 5: packet deadline verification (CO-05)",
  "PR 6: free screening (CO-04)",
  "PR 6b: ZIP+4 localities, so every practice can be priced (your ruling)",
  "PR 7: red team at milestone 6, gates, scorecard (CO-07, CO-10)",
  "PR 8: workbench schema and appeal-level evidence (CO-06)",
  "PR 9: readiness grades and the eight export gates",
  "PR 10: case transitions and their log",
  "PR 11: changed calculations reach cases",
  "PR 12: five-part exports and disclosure scopes",
  "PR 13: six-tab case screen",
  "PR 14: financial reviewer and auditor roles, independent sign-off",
  "PR 15: ledger tests LED-12 and LED-13",
  "PR 16: red team at milestone 11",
  "PR 17: firm grants and minimal portfolio (CO-08)",
]
# Steps not run by a tracked workflow: label -> (status, started, finished), kept by hand.
MANUAL = {
  "You approved the reconciliation": ("Done", "2026-10-17T05:03:00Z", "2026-10-17T05:13:00Z"),
  "Step 0: milestones 10-11 green, CI running on GitHub": ("Done", "2026-10-17T06:15:00Z", "2026-10-17T10:56:00Z"),
  "Open pull request #1 with the change order documents": ("Done", "2026-10-17T06:54:00Z", "2026-10-17T06:55:00Z"),
  "Pin the image scanner to a safe release": ("Done", "2026-10-17T06:56:00Z", "2026-10-17T07:00:00Z"),
  "Make the audit worksheet run on CI's Python 3.12": ("Done", "2026-10-17T07:01:00Z", "2026-10-17T07:06:00Z"),
  "Take security updates into both container images": ("Done", "2026-10-17T07:06:00Z", "2026-10-17T07:12:00Z"),
  "Reproduce CI on Postgres 18 and Node 24, fix the one failing test": ("Done", "2026-10-17T07:40:00Z", "2026-10-17T10:24:00Z"),
  "CI green on GitHub, then merge": ("Done", "2026-10-17T10:24:00Z", "2026-10-17T10:56:00Z"),
  "review: security": ("Done", "2026-10-17T12:31:00Z", "2026-10-17T13:03:00Z"),
  "Pull request #2 on GitHub: CI green, then merge": ("Done", "2026-10-17T14:59:00Z", "2026-10-17T17:49:00Z"),
  "Your name on the approver list (Tyler Williams)": ("Done", "2026-10-17T18:05:00Z", "2026-10-17T19:14:00Z"),
  "You approve the domain model": ("Done", "2026-10-17T19:05:00Z", "2026-10-17T19:16:00Z"),
  "PR 2 on GitHub: CI green, then merge": ("Done", "2026-10-17T19:16:00Z", "2026-10-17T19:51:00Z"),
  "PR 2: domain model and your sign-off (CO-02)": ("Done", "2026-10-17T10:58:00Z", "2026-10-17T19:51:00Z"),
  "You answered PR 5's questions": ("Done", "2026-10-18T11:30:00Z", "2026-10-18T11:37:00Z"),
  "You answered PR 6's questions": ("Done", "2026-10-18T11:38:00Z", "2026-10-18T11:41:00Z"),
  "You decided the four urgent items": ("Done", "2026-10-18T16:10:00Z", "2026-10-18T16:20:00Z"),
  "Repair main (revert #7, Dependabot to the build branch)": ("Done", "2026-10-18T16:24:00Z", "2026-10-18T16:30:00Z"),
  "PR 6: the audit's privacy fix (#6, 11-line floor)": ("Running", "2026-10-18T16:40:00Z", None),
  "PR 5: the audit's critical fixes (#4, #5, #26, #61)": ("Running", "2026-10-18T17:20:00Z", None),
  "Fixes on GitHub: CI green, then merge": ("Done", "2026-10-18T00:15:00Z", "2026-10-18T01:13:00Z"),
  "You approve the domain model (PR 4)": ("Done", "2026-10-18T01:58:00Z", "2026-10-18T02:08:00Z"),
  "PR 4 on GitHub: CI green, then merge": ("Done", "2026-10-18T02:28:00Z", "2026-10-18T03:21:00Z"),
  "PR 4: EMR exports as intake (CO-03)": ("Done", "2026-10-17T21:17:00Z", "2026-10-18T03:21:00Z"),
  "PR 3 on GitHub: CI green, then merge (after PR 2)": ("Done", "2026-10-17T21:16:00Z", "2026-10-17T21:49:00Z"),
  "PR 3: EMR export fixtures and fixture guard (CO-03)": ("Done", "2026-10-17T17:51:00Z", "2026-10-17T21:49:00Z"),
  "PR 1: brand merge and copy check (CO-01, CO-11)": ("Done", "2026-10-17T06:57:00Z", "2026-10-17T17:49:00Z"),
  "Second round: approver list, stricter approval check, test fixes": ("Done", "2026-10-17T14:08:00Z", "2026-10-17T18:22:00Z"),
  "review: guardrails and CLAUDE.md": ("Done", "2026-10-17T13:26:00Z", "2026-10-17T14:05:00Z"),
  "PR 5: the audit's critical fixes (#4, #5, #26, #61)": ("Done", "2026-10-18T17:20:00Z", "2026-10-20T21:25:00Z"),
  "PR 6: the audit's privacy fix (#6, 11-line floor)": ("Done", "2026-10-18T16:40:00Z", "2026-10-20T18:30:00Z"),
  "PR 5: packet deadline verification (CO-05)": ("Done", "2026-10-17T21:50:00Z", "2026-10-21T13:04:31Z"),
  "PR 6: free screening (CO-04)": ("Done", "2026-10-17T21:50:00Z", "2026-10-21T18:16:26Z"),
  "You approve the domain model (PR 5)": ("Done", "2026-10-21T03:30:00Z", "2026-10-21T12:30:00Z"),
  "PR 5 on GitHub: CI green, then merge": ("Done", "2026-10-20T23:58:05Z", "2026-10-21T13:04:31Z"),
  "You approve the domain model (PR 6)": ("Done", "2026-10-21T17:30:00Z", "2026-10-21T17:35:00Z"),
  "PR 6 on GitHub: CI green, then merge": ("Done", "2026-10-21T00:16:27Z", "2026-10-21T18:16:26Z"),
  "merge both audits and rank": ("Done", "2026-10-20T14:20:00Z", "2026-10-20T15:00:00Z"),
  "You decide on the upgrades": ("Done", "2026-10-20T15:00:00Z", "2026-10-20T15:10:00Z"),
  "Design: PR 5 payer's copy and PR 6 screening (19 questions)": ("Done", "2026-10-20T18:30:00Z", "2026-10-20T19:55:00Z"),
  "You answered the 19 design questions": ("Done", "2026-10-20T19:55:00Z", "2026-10-20T20:00:00Z"),
  "CI pinned to ubuntu-24.04 (#24)": ("Done", "2026-10-20T16:20:00Z", "2026-10-20T17:27:18Z"),
  "Governance merged: hooks, pre-push check, approval of record (#25)": ("Done", "2026-10-18T16:40:00Z", "2026-10-20T21:40:16Z"),
  "Main: Dependabot groups and the PR template (#27)": ("Done", "2026-10-20T21:57:00Z", "2026-10-20T22:24:07Z"),
  "Images fix: Node starts as user node (#32)": ("Done", "2026-10-21T12:32:00Z", "2026-10-21T13:04:49Z"),
  "PR 5b: the payer's copy prints the plan type in words (#34)": ("Done", "2026-10-21T13:15:00Z", "2026-10-21T19:01:28Z"),
  "Fresh session: setup script, handoff, machine rebuilt": ("Done", "2026-10-21T18:40:00Z", "2026-10-21T19:50:00Z"),
  "You approve the consumer's monthly cost and the design questions": ("Done", "2026-10-21T22:00:00Z", "2026-10-21T22:31:00Z"),
  "PR 6b-1, ZIP+4 in the engine: build, draft PR, two reviews, fix, verify, merge": ("Running", "2026-10-21T22:55:00Z", None),
}
# Steps whose label repeats across batches ("fix review findings"), kept by hand: (batch, label) -> (status, started, finished).
BATCH_MANUAL = {
  ("Urgent items from the audit", "hooks, approval summary and check, guide"): ("Done", "2026-10-18T16:40:00Z", "2026-10-20T14:20:00Z"),
  ("Urgent items from the audit", "review: try to bypass it"): ("Done", "2026-10-20T14:20:00Z", "2026-10-20T16:00:00Z"),
  ("Urgent items from the audit", "review: the founder's guide"): ("Done", "2026-10-20T14:20:00Z", "2026-10-20T16:00:00Z"),
  ("Urgent items from the audit", "fix review findings"): ("Done", "2026-10-20T16:00:00Z", "2026-10-20T20:30:00Z"),
  ("Urgent items from the audit", "fresh-clone verification"): ("Done", "2026-10-20T20:30:00Z", "2026-10-20T21:30:00Z"),
}
# Change order steps worked by a workflow run: label -> run id. Running while the run is open;
# MANUAL marks a step Done when its pull request merges.
STEP_RUNS = {
  "PR 1: brand merge and copy check (CO-01, CO-11)": "wf_859cecba-6d4",
  "PR 2: domain model and your sign-off (CO-02)": "wf_cbaf37ff-2e0",
  "PR 3: EMR export fixtures and fixture guard (CO-03)": "wf_fd24ff2c-ef4",
  "PR 4: EMR exports as intake (CO-03)": "wf_4afdb8f3-dff",
  "PR 5: packet deadline verification (CO-05)": "wf_4eae97e6-03a",
  "PR 6: free screening (CO-04)": "wf_fb7ce904-a6f",
}
BATCHES = [
  # (batch name, journal run id or None, planned labels in order)
  ("PR 6b: ZIP+4 localities, the screening's own consumer, the 60-second check", "wf_b7b1b9d1-40f", ["design: zip4-settings", "design: consumer-time", "design: email-streams", "review: zip4-settings", "review: consumer-time", "review: email-streams", "revise: zip4-settings", "revise: consumer-time", "revise: email-streams", "plan: pr6b", "You approve the consumer's monthly cost and the design questions", "PR 6b-1, ZIP+4 in the engine: build, draft PR, two reviews, fix, verify, merge", "PR 6b-2, pricing location and onboarding: build, reviews, fix, verify, your approval, merge", "PR 6b-3, the screening's own consumer and the time check: build, reviews, fix, verify, your approval, merge", "PR 6b-4, mail streams: build, reviews, fix, verify, your approval, merge"]),
  ("Since the audit: rulings and small pull requests", None, ["You decide on the upgrades", "Design: PR 5 payer's copy and PR 6 screening (19 questions)", "You answered the 19 design questions", "CI pinned to ubuntu-24.04 (#24)", "Governance merged: hooks, pre-push check, approval of record (#25)", "Main: Dependabot groups and the PR template (#27)", "Images fix: Node starts as user node (#32)", "PR 5b: the payer's copy prints the plan type in words (#34)", "Fresh session: setup script, handoff, machine rebuilt"]),
  ("PR 3: EMR export fixtures", "wf_fd24ff2c-ef4", ["set up the worktree and split the work", "formats, generators, templates", "fixture guard, check, approval hook", "review: ledger and intake", "review: guard robustness", "review: guardrails and security", "fix review findings", "fresh-clone verification", "PR 3 on GitHub: CI green, then merge (after PR 2)"]),
  ("PR 2: domain model", "wf_cbaf37ff-2e0", ["port generator, regenerate, tests, CLAUDE.md", "review: document accuracy", "review: gate robustness", "review: guardrails and CLAUDE.md", "fix review findings", "fresh-clone verification", "Second round: approver list, stricter approval check, test fixes", "Your name on the approver list (Tyler Williams)", "You approve the domain model", "PR 2 on GitHub: CI green, then merge"]),
  ("Urgent items from the audit", "wf_6a5ccaf0-c47", ["You decided the four urgent items", "Repair main (revert #7, Dependabot to the build branch)", "hooks, approval summary and check, guide", "review: try to bypass it", "review: the founder's guide", "fix review findings", "fresh-clone verification", "You: GitHub Pro, private repository, build account, rulesets", "PR 5: the audit's critical fixes (#4, #5, #26, #61)", "PR 6: the audit's privacy fix (#6, 11-line floor)"]),
  ("Best-option audit (your standing rule)", "wf_056e247c-cff", ["find: decisions-a", "find: decisions-b", "find: decisions-c", "find: deferred", "find: accuracy", "find: experience", "find: growth", "synthesize the ranked upgrades"]),
  ("Best-option audit, ten more angles", "wf_8e577203-afb", ["find: security-privacy", "find: compliance-legal", "find: reliability-operations", "find: cost-efficiency", "find: dispute-success", "find: time-to-value", "find: resilience-to-change", "find: ai-safety", "find: maintainability", "find: business-readiness", "merge both audits and rank", "You decide on the upgrades"]),
  ("PR 5: your rulings", "wf_e3d92d32-ee0", ["You answered PR 5's questions", "download rule, rulings, domain model", "review: forge a download", "review: guardrails and rulings", "fix review findings", "fresh-clone verification and new hash"]),
  ("PR 6: your rulings", "wf_d8c22991-041", ["You answered PR 6's questions", "two engine figures, before sequestration, rulings", "review: engine and figures", "review: guardrails and wording", "fix review findings", "fresh-clone verification"]),
  ("PR 6: free screening", "wf_ba7e3e96-840", ["set up the worktree and the contract", "screening tables, adapter, jobs, db tests", "public screening pages, parser, results, e2e", "review: engine and adapter", "review: privacy, security and abuse", "review: try to upload PHI", "review: guardrails, wording, domain model", "fix review findings", "fresh-clone verification and approval summary", "You approve the domain model (PR 6)", "PR 6 on GitHub: CI green, then merge"]),
  ("PR 5: packet deadline verification", "wf_ba5a5838-67c", ["set up the worktree and the contract", "deadline rule, window evidence, release 900005, AUDIT-01", "tp-packet/2, verifier at export, attestation, e2e", "review: engine, deadline rule and AUDIT-01", "review: attack the verifier and the hash", "review: security, attestation and tenancy", "review: guardrails and the domain model", "fix review findings", "fresh-clone verification and approval summary", "You approve the domain model (PR 5)", "PR 5 on GitHub: CI green, then merge"]),
  ("PR 4: EMR exports as intake", "wf_4afdb8f3-dff", ["set up the worktree and the contract", "schema, normalizer, loading, duplicate rule", "Coverage flag, upload and receipts, e2e", "review: loader correctness", "review: duplicates and idempotency", "review: security and tenancy", "review: guardrails and the domain model", "fix review findings", "fresh-clone verification and approval summary", "You approve the domain model (PR 4)", "PR 4 on GitHub: CI green, then merge"]),
  ("Screen-tour fixes", "wf_0291578a-a18", ["set up the worktree and split the work", "privacy: the viewer sees no service date", "numbers: coverage share, dashboard coverage, audit report", "layout and copy", "review: privacy and security", "review: correctness and UI", "fix review findings", "fresh-clone verification and re-shot tour", "Fixes on GitHub: CI green, then merge"]),
  ("Change order 001 pull requests", None, CO_STEPS),
  ("Milestones 12-13", None, ["Firm organizations, grants, invitations", "Export, deletion, legal holds", "Portfolio, per-practice billing, verified-by mark", "Calendar alerts and negotiation workspace", "Payer scorecards, OT and SLP codes, SOC 2 Type II checklist", "Reviews (security, plan, correctness)", "Fixes and full test run"]),
  ("Final pass", None, ["Runbooks", "Phone-width screens and mono figures", "Whole-plan audit", "Final fixes", "Claude Code settings file, final verification, report"]),
]

# Finished batches, for the history chart (wall-clock hours, measured).
HISTORY = [
  ("Milestone 0", 3.1), ("Milestone 1", 4.0), ("Milestones 2-5", 9.4), ("Milestones 6-7", 8.7), ("Milestones 8-9", 13.0), ("Milestones 10-11", 14.5), ("Step 0: first CI run", 4.7), ("PR 1: brand and copy", 10.9), ("PaidWhole brand", 2.4), ("Change order review", 2.0), ("PR 2: domain model", 8.9), ("PR 3: EMR export files", 4.0), ("Screen-tour fixes", 5.9), ("PR 4: ERA exports as intake", 6.1),
  ("PR 5b: plan type in words", 5.8),
]
# PR 5, PR 6 and governance ran across the weekly-limit pause of 2026-10-19 and several container restarts, and
# their journals are gone with the old container, so their wall-clock hours are not measured here.

# ---- Estimate of the finish, in UTC (update when a batch ends).
# Re-estimated 2026-10-17T05:15Z after the reconciliation: change order 001 is 585-995 plan hours,
# at the recent 8-15 plan hours per wall-clock hour, plus milestones 12-13 and the final pass.
# Re-estimated 2026-10-18T11:45Z: PRs take 6-9 hours, two at a time, plus waits for approvals; 11 PRs, M12-13, final pass left.
# Re-estimated 2026-10-21T20:00Z after the switch: the founder adopted the combined audit (4,750-7,590 added plan
# hours), so about 5,000-8,100 plan hours remain (PRs 6b-17, the audit's new PRs, 11b, 12, 13, final pass). At the
# measured 8-15 plan hours per wall-clock hour and about 12 build hours a day under the ~11%-a-day usage pace:
# about 28 to 81 days.
ETA = {"low": "2026-11-18T18:00:00Z", "high": "2027-01-10T18:00:00Z"}

# ---- Things only a person can do (the README holds the detail).
BLOCKERS = [
  ("Load the real 2026 CMS fee schedule and X12 code lists into release 1", "M0, M2", "You or your team", "Download the files listed in content/sources/README.md; run the import commands; verify to L2"),
  ("Reimbursement specialist verifies the golden pricing lines", "M5, M7", "Specialist", "Answer fixtures/golden/QUESTIONS.md (45 questions); check the worksheets"),
  ("Deploy to AWS staging and run the restore drill", "M1, M11", "You or your team", "AWS account with the BAA accepted; follow the deploy runbook"),
  ("Run the model evaluation gates with model access", "M10", "You or your team", "Bedrock access in AWS; run the evaluation harness"),
  ("Complete a test ACH payment through real Stripe test mode", "M11", "You or your team", "Stripe account and test keys in Secrets Manager"),
  ("Reproduce the three real audits", "M6", "Founder and reviewer", "Run the first three practices through the app"),
  ("SOC 2 reports and a penetration test", "M11, M13", "Outside firms", "Engage an auditor and a testing firm"),
  ("A GitHub identity for the build (runbook 3i), then APPROVAL_REVIEW_REQUIRED", "CO1", "You", "docs/runbooks/github-governance.md, step 3i; until then the build merges on green CI (D4 a)"),
  ("Counsel: decisions 3, 4, 7 and 17, the cookie notice, the 11-line floor, the screening terms, the campaign-code wording", "CO1", "Counsel", "Before the first real packet and before the screening opens"),
  ("Specialist: Q21 on sequestration", "M5, CO1", "Specialist", "fixtures/golden/QUESTIONS.md"),
]

def journal(run):
    path = os.path.join(WF, run, "journal.jsonl")
    started, done, agents = {}, set(), {}
    if not os.path.exists(path): return started, done, agents
    for line in open(path):
        d = json.loads(line)
        if d.get("type") == "started" and d.get("label"):
            started[d["label"]] = d["agentId"]; agents[d["agentId"]] = d["label"]
        if d.get("type") == "result": done.add(d.get("agentId"))
    return started, done, agents

work = []
seq = 0
for batch, run, labels in BATCHES:
    started, done, _ = journal(run) if run else ({}, set(), {})
    for label in labels:
        seq += 1
        aid = started.get(label)
        status, s_at, f_at = "Queued", None, None
        if (batch, label) in BATCH_MANUAL:
            status, s_at, f_at = BATCH_MANUAL[(batch, label)]
        elif label in MANUAL:
            status, s_at, f_at = MANUAL[label]
        elif label in STEP_RUNS and os.path.isdir(os.path.join(WF, STEP_RUNS[label])):
            d = os.path.join(WF, STEP_RUNS[label])
            metas = [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".meta.json")]
            status = "Running"
            s_at = iso(min(mtime(m) for m in metas)) if metas else iso(mtime(d))
        elif aid:
            meta = os.path.join(WF, run, f"agent-{aid}.meta.json")
            log = os.path.join(WF, run, f"agent-{aid}.jsonl")
            s_at = iso(mtime(meta)) if os.path.exists(meta) else None
            if aid in done:
                status = "Done"; f_at = iso(mtime(log)) if os.path.exists(log) else None
            else:
                status = "Running"
        elif (batch, FRIENDLY.get(label, label)) in FROZEN:
            status, s_at, f_at = FROZEN[(batch, FRIENDLY.get(label, label))]
        work.append({"seq": seq, "batch": batch, "step": FRIENDLY.get(label, label), "status": status,
                     "started": s_at, "finished": f_at})

def git(*a): return subprocess.run(["git", "-C", REPO, *a], capture_output=True, text=True).stdout.strip()
commits = int(git("rev-list", "--count", "HEAD") or 0)
brand_commits = int(subprocess.run(["git", "-C", "/home/user/pw-brand", "rev-list", "--count", "07d2670..HEAD"], capture_output=True, text=True).stdout.strip() or 0)
adrs = len([f for f in os.listdir(os.path.join(REPO, "docs/adr")) if f.endswith(".md") and not f.startswith("0000")])

summary = [{
  "as_of": iso(NOW),
  "eta_low": ETA["low"], "eta_high": ETA["high"],
  "commits": commits + brand_commits,
  "adrs": adrs,
  "golden_lines": 326,
  "unit_tests": 3845, "db_tests": 8587, "e2e_journeys": 49,
}]

milestones = [{"id": m[0], "seq": i, "name": m[1], "release": m[2], "hours_low": m[3], "hours_high": m[4],
               "stage": m[5], "check": m[6], "note": m[7]} for i, m in enumerate(MILESTONES)]
history = [{"batch": b, "hours": h} for b, h in HISTORY]
blockers = [{"item": b[0], "milestones": b[1], "who": b[2], "next_step": b[3]} for b in BLOCKERS]

os.makedirs(OUT, exist_ok=True)
for name, rows in [("milestones", milestones), ("work", work), ("summary", summary), ("history", history), ("blockers", blockers)]:
    with open(os.path.join(OUT, f"{name}.json"), "w") as f: json.dump(rows, f, indent=1)
print(json.dumps({"as_of": iso(NOW), "running": [w["step"] for w in work if w["status"] == "Running"],
                  "done": sum(w["status"] == "Done" for w in work), "queued": sum(w["status"] == "Queued" for w in work)}))
