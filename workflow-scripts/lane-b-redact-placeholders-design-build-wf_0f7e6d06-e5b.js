export const meta = {
  name: 'lane-b-redact-placeholders-design-build',
  description: 'Design review of the one-pass redaction, then the builder implements it with property tests',
  phases: [{ title: 'Design review' }, { title: 'Build' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2897427-570e-5954-bd7a-54cacd103451/scratchpad'
const WT = '/home/user/redact-placeholders'
const DESIGN = '/home/user/ops/designs/lane-b-redact-placeholders.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RULES = `Rules:
- Every heavy command (install, typecheck, lint, test) runs under \`flock /tmp/laneb-heavy.lock <command>\`, with \`export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH\` first.
- Synthetic data only (names like VANTREE, ZEPHYRA, SYN-prefixed numbers). No model name or identifier in any file you write. Do not commit or push; the session does.
- Long commands: run_in_background and wait for the notification; the Bash tool refuses a long foreground sleep.
- Improve as you go: improvements inside your task, do them and say so; outside it, list them as proposals.`

phase('Design review')
const review = await agent(`You are the one design reviewer for a Lane B item of the PaidWhole build. Review, adversarially, the design at ${DESIGN} for the model gateway's letter redaction (packages/model-gateway/src/redact.ts, its callers functions/denial-letter.ts and functions/narrative.ts, tests functions/denial-letter.test.ts) in the worktree ${WT} (branch co-001/redact-placeholders, the base claude/build-platform). This path is what keeps patient details from the model (CLAUDE.md: no PHI to a model).
Check above all: (1) is the completeness argument (section 3) right, and does the proposed algorithm really leave no identifier, name part, initial or date of birth unredacted, and no inserted placeholder corrupted? Try to break it: construct inputs (synthetic) that would leak or corrupt under the design as written, including fold/position-map edge cases (case expansion like ß, marks, default-ignorables, surrogate pairs, NFKC changes), joiners creating over- or under-matching, overlapping spans and the placeholder choice, the initials rule, date spans on the folded view, the self-check masking, identifierCandidates' tokenization vs compactIdentifier on the stored side (apps/worker/src/packets/letter-records.ts), and mentionsIdentifier's change. (2) Anything the design misses in what can go wrong, or a neighbouring path. (3) Over-redaction that would break the task (dates the reader needs such as the deadline, the payer's reference, claim placeholders). (4) Test plan sufficiency. (5) Conflicts with the parallel branch origin/co-001/contract-phi-check, which appends to redact.ts.
You may run code in a scratch test file under ${SP}/ (not in the worktree) or a temporary file you delete. ${SAVE('design-review.md', 'findings so far')}
${RULES}
Return findings, each with severity (blocking / should fix / nit), what is wrong, a concrete input if any, and the fix you recommend.`, {
  label: 'design-review', phase: 'Design review',
  schema: { type: 'object', required: ['findings', 'verdict'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', required: ['severity', 'title', 'detail', 'fix'], properties: { severity: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } } } } } },
})

phase('Build')
const build = await agent(`You are the builder for a Lane B item of the PaidWhole build, working in the worktree ${WT} (branch co-001/redact-placeholders). Implement the design at ${DESIGN} in full, applying every design-review finding below (take the recommended fix; for security the safer option); where you depart from the design, say why. Also update the design file itself (${DESIGN}) so it states what was built (a short "Review and departures" section listing each finding and how it was applied).

Design review findings:
${JSON.stringify(review, null, 2)}

What to build:
- packages/model-gateway/src/redact.ts: the one-pass redaction over the folded view, the self-check and identifierCandidates as designed. Keep the exported API (redactLetter, holdsIdentifier, identifierCandidates, redactionForms, dateForms, datesIn, compactIdentifier, the types) so callers compile; keep code style: match the surrounding code's comment density, naming and idiom (plain-sentence doc comments). Keep your changes ABOVE any block a parallel branch appends at the file's end (the parallel branch origin/co-001/contract-phi-check appends screenIdentifier/identifierRuns after identifierCandidates; do not add those).
- packages/model-gateway/src/functions/narrative.ts: mentionsIdentifier on the same matcher.
- Tests: a new packages/model-gateway/src/redact.property.test.ts (MOD-13: every placeholder survives and no identifier survives, over adversarial names and writings as the design's section 4 says; MOD-14: identifierCandidates sees every written form of another patient's identifier, never a placeholder) using fast-check with the repository's property-test conventions (look at other *.property.test.ts files for seeds/numRuns conventions, and test-flakes' lessons: no unseeded coverage checks that can fail by chance, no fc.pre that can exhaust). Named examples for each row of the design's section 1 table in functions/denial-letter.test.ts; adapt the identifier_left test as designed. Tests for mentionsIdentifier's new reach in the narrative tests.
- docs: an amendment section to docs/adr/0054-*.md (dated 2026-10-27, its own heading, appended), test-matrix rows MOD-13 and MOD-14 in docs/product/test-matrix.md (see how MOD-07..MOD-12 rows and the note under them are written), and whatever the fixtures/registry test requires for new matrix rows (packages/synth/src/cases registry: no-file entries in module 9 MOD if packages/synth/src/fixtures.test.ts requires one per row; look at how MOD-07..MOD-11 are registered).
- Check what you touch: run the model-gateway package's tests, typecheck and lint (pnpm --filter for the package, and pnpm lint:logs if relevant), the synth fixtures test if you touched the registry, and pnpm verify-content if docs need it. Also run the narrative-related and apps/worker tests that import from @tp/model-gateway's redact exports (letter-records) if they run without a database; note what needs test:db.
- Mutation: check stryker/shards.json for whether model-gateway is a mutation shard; if so, keep its score (run the shard if it is affordable, else note it).
${SAVE('builder.md', 'what is done, what is left, commands run and their results')}
${RULES}
Return: files changed, a summary of the algorithm as built, each review finding and how applied, departures, test results (counts), proposals.`, {
  label: 'builder', phase: 'Build',
  schema: { type: 'object', required: ['filesChanged', 'summary', 'findingsApplied', 'tests', 'departures', 'proposals'], properties: { filesChanged: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, findingsApplied: { type: 'string' }, tests: { type: 'string' }, departures: { type: 'string' }, proposals: { type: 'string' } } },
})
return { review, build }