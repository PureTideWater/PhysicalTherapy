export const meta = {
  name: 'lane-b-ux-brand-reviewer-build',
  description: 'The UX and brand reviewer checklist (co-001/ux-brand-reviewer): design with one adversarial reviewer, revision, then one builder writes .claude/agents/ux-brand-reviewer.md',
  phases: [
    { title: 'Design', detail: 'one designer: the checklist outline from the brand rules and the baseline review' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Revise', detail: 'every point applied or rejected with its reason' },
    { title: 'Build', detail: 'one builder writes the reviewer file in the worktree and commits' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad'
const OPS = '/home/user/ops'
const WT = '/home/user/ux-brand-reviewer'
const D = OPS + '/designs/lane-b-ux-brand-reviewer.md'
const SAVE = (file) => `Save as you go: keep ${SP}/progress/uxbr-${file} current after each step, so an interruption loses nothing. If it exists when you start, an earlier run of yours was interrupted: read it, trust it unless the files say otherwise, and continue from where it stopped.`
const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context). This is the pull request co-001/ux-brand-reviewer: a reviewer checklist, .claude/agents/ux-brand-reviewer.md, that both lanes' sessions give to a default workflow agent as the UX and brand review of every pull request that changes something a person sees.
- The brief: ${OPS}/designs/lane-b-ux-review-brief.md. Read "What it judges against" and "Then: a UX/UI and brand review of every screen as it is built".
- Rulings that bind it:
  - its frontmatter takes security-reviewer.md's keys, and its model: key follows the other reviewer files (the co-founder's Q4, 2026-10-25 ~21:05 UTC; recorded in ${OPS}/lanes/lane-b.md);
  - Lane A's screen-changing PRs take the same reviewer (the co-founder, acting for the founder, 2026-10-25 ~21:10 UTC; ${OPS}/LANES.md "Handed to Lane A");
  - the PR takes a documentation-only suite.
- The material:
  - the four existing reviewer files in ${WT}/.claude/agents/ (their form, length, voice and frontmatter);
  - .claude/rules/brand.md, docs/brand/BRAND.md, packages/brand/README.md, packages/brand/src/tokens.css;
  - ADR 0056 and ADR 0058 (docs/adr);
  - CO-11 in docs/product/change-order-001.md;
  - apps/web/src/lib/copy/words.ts and tools/brand-copy;
  - docs/product/PRD.md near :256;
  - WCAG 2.1 AA, with combined audit #103's WCAG 2.2 additions (${OPS}/audits/combined/combined-report.md, item #103 only);
  - apps/web/e2e/a11y.ts;
  - the screen tour tool's README (${OPS}/tools/lane-b-screen-tour/README.md: how before and after screenshots are taken).
- The baseline review's findings:
  - ${OPS}/designs/lane-b-ux-review/raw-findings.md: 335 raw findings from eleven reviewers, by lens;
  - ${OPS}/designs/lane-b-ux-review.md, the deduplicated and verified synthesis, if it exists yet. If it does, it wins over the raw list.
  The checklist distils these into checks that would have caught them: the recurring defect classes, not single bugs.
- Rules for you: synthetic data only. Read-only everywhere except the files your task names. Never run git push, checkout, reset or stash. No heavy command (no build, test, install or server). Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. No model name in any file, except the model: frontmatter key that Q4 rules. Plain words and short sentences, the repository's style. In markdown, wrap every shot id and file path in backticks: the push's secret scan reads a bare id such as support-access.1280, followed by a comma and another id, as a key.
- Improve as you go: if you find a better way inside this PR's scope, take it and say so.`

phase('Design')
const design = await agent(`${RULES}

Task: write the design ${D}. ${SAVE('design.md')}
It holds:
1. **Purpose and use.** When a session runs it: any PR touching apps/web/src/app, apps/web/src/components, apps/web/src/lib/copy, apps/worker/src/screening/wording.ts, the report, packet and payer's-copy renderers, or the email templates. What it receives: the diff; before and after screenshots of the changed screens at 1280 and 390 px, light and dark where offered, from the tour tool with TOUR_REF set to the base, then the head; and the baseline's open findings on those screens. What it returns: findings, each with severity (blocking, should fix, polish), the screen, evidence with file:line, the rule broken (file:line or WCAG criterion), and the best fix; or "no findings".
2. **The checklist outline, section by section.** For example: brand tokens and colour (status colour for data only, brass never text on white, no raw colours, dark tokens); type and figures (Plex Mono for money and rates, tabular figures, the scale); words (CO-11, honest claims, "recovered" only posted or deposited, plurals after counts, no build vocabulary or raw codes, labels not schema keys, every error with a next step); forms and errors (values kept after a refusal, field-level errors tied to their control, focus); states (empty, loading, error, permission-refused, not-found, each with words and a way on); 390 px (no page overflow, tables that scroll with a cue or reflow, touch targets, 16 px inputs); accessibility (keyboard, focus visible and not hidden under the sticky header, names that match labels, headings, live regions, alert versus status roles, contrast in both themes); flows per role (what the person sees first, the next step, no dead ends, no state a refresh loses, notices that do not replay); money and status (amounts from cents in the practice's locale; stages never mixed); and print and PDF. Give each item the rule it rests on (file:line), or mark it "baseline finding" with the finding ids that show the defect class. Mark any item where the rules are silent as a recommendation.
3. **Severity rules:** what makes a finding blocking.
4. **The file's form:** the frontmatter (name, description, tools, disallowedTools, model, maxTurns, following security-reviewer.md and Q4); its length (the other reviewer files are 10 to 41 lines; say how long this one should be, and why); its sections.
5. **What the PR changes:** the one file, and anything else needed (for example a pointer in a runbook). Check whether anything enumerates .claude/agents (hooks, tests, docs). The PR changes no product code. No migration.
6. **The suite:** documentation-only (typecheck, lint, lint:copy, unit), per Q4. Check whether lint:copy or another check reads .claude/agents.
Return the outline's section titles and the open points.`, { label: 'design', phase: 'Design', schema: { type: 'object', properties: { sections: { type: 'array', items: { type: 'string' } }, openPoints: { type: 'array', items: { type: 'string' } } }, required: ['sections', 'openPoints'] } })
if (!design) throw new Error('The designer returned nothing.')

phase('Review')
const review = await agent(`${RULES}

Task: you are the design's one adversarial reviewer. Review ${D}: find what is wrong, missing or weak. ${SAVE('review.md')}
Check:
- Every checklist item rests on a written rule, cited correctly (open each file:line), or is plainly marked as a recommendation or a baseline defect class. Taste presented as a rule is a finding.
- The checklist covers every recurring defect class in the baseline's findings. Read raw-findings.md by lens, and the synthesis if it exists. Name any class it would miss.
- It fits the other reviewer files' form and the Q4 ruling, and it is short enough to be used. A checklist nobody can apply in one review pass is a finding.
- Both lanes can use it as written, and it does not ask Lane A for a step that is Lane B's own.
- The PR plan is complete: the suite, nothing that enumerates agents left stale, no model identifier beyond the ruled key.
Write ${OPS}/designs/lane-b-ux-brand-reviewer-review.md: numbered findings (blocking, should fix, nit), each with its evidence and the fix.`, { label: 'review', phase: 'Review', schema: { type: 'object', properties: { blocking: { type: 'number' }, shouldFix: { type: 'number' }, nits: { type: 'number' } }, required: ['blocking', 'shouldFix', 'nits'] } })
if (!review) throw new Error('The reviewer returned nothing.')

phase('Revise')
const revised = await agent(`${RULES}

Task: resolve every point in ${OPS}/designs/lane-b-ux-brand-reviewer-review.md (${review.blocking} blocking, ${review.shouldFix} should fix, ${review.nits} nits) in ${D}. ${SAVE('revise.md')}
- For each point, verify it, then apply it, or reject it with the evidence.
- Add a section "Review dispositions": one line per point with its outcome.
- If ${OPS}/designs/lane-b-ux-review.md now exists, re-check the outline against its ranked findings and add any defect class it names that the outline lacks.
Return the counts applied and rejected.`, { label: 'revise', phase: 'Revise', schema: { type: 'object', properties: { applied: { type: 'number' }, rejected: { type: 'number' } }, required: ['applied', 'rejected'] } })
if (!revised) throw new Error('The reviser returned nothing.')

phase('Build')
const built = await agent(`${RULES}

Task: build the PR in the worktree ${WT} (branch co-001/ux-brand-reviewer, cut from claude/build-platform 4d99df8). ${SAVE('build.md')}
- Write ${WT}/.claude/agents/ux-brand-reviewer.md exactly as the design ${D} specifies, in the voice and form of ${WT}/.claude/agents/security-reviewer.md. Every check names its rule (file:line) or says it is a recommendation.
- Make any other change the design's "What the PR changes" names.
- Re-read every file:line you cite, at the worktree's head.
- Then commit in the worktree: git -C ${WT} add <the files> && git -C ${WT} commit with a message whose first line is under 72 characters, a short body, and these two lines at the end:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CntuGR3wkXMF6kK3at6bGh
  Do not push.
Return the commit hash, the files changed and the line count of the reviewer file.`, { label: 'build', phase: 'Build', schema: { type: 'object', properties: { commit: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, lines: { type: 'number' }, notes: { type: 'string' } }, required: ['commit', 'files', 'lines', 'notes'] } })
return { design, review, revised, built }
