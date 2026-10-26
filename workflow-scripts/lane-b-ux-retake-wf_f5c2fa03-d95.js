export const meta = {
  name: 'lane-b-ux-retake',
  description: 'Retake the 22 screen-tour shots the checkers flagged as capture faults, then check the retaken images',
  phases: [
    { title: 'Retake', detail: 'fix their capture steps, re-serve from a fresh prepare under the lock, capture only those ids' },
    { title: 'Check', detail: 'look at every retaken image' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad'
const TOUR = SP + '/screens'
const TOOL = '/home/user/ops/tools/lane-b-screen-tour'
const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context). The UX/UI baseline review's screen tour: ${TOOL} (README); the working directory TOUR_DIR=${TOUR}, with the production build already in /home/user/screens/apps/web/.next.
Rules for you:
- Synthetic data only.
- Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH.
- Heavy commands (the server, Playwright runs, installs, builds) run only under flock /tmp/laneb-heavy.lock, one at a time.
- Change no tracked file in /home/user/PhysicalTherapy or /home/user/screens. In /home/user/ops, change only ${TOOL}/capture/tour.spec.ts and the tour's README. Never run git add, commit, push, checkout, reset or stash: the orchestrator commits.
- No model name in any file. Never write the development master key to a file.
- Long commands run in the background, and you wait for the notification.
- Save as you go: keep ${SP}/progress/<your file> current after each step. If it already exists, an earlier run of yours was interrupted: continue from it.
- Improve as you go: improve the tour tool where it helps, and say so.`

phase('Retake')
const retake = await agent(`${RULES}
Your progress file: retake-2.md.

Task: retake the 22 shots the image checkers flagged as capture faults. Their entries, with each checker's note on what went wrong, are in ${TOUR}/batches/retake-input.json. The kinds of fault:
- At 390 px the sticky header is painted partway down a full-page shot: p.contract.error.390, p.contracts.error.390, p.line.error.390, p.access-log.older.390, p.access-log.record-filter.390, console.compliance.error.390, console.billing.error.390, settings.users.error.390 and the console.organizations 390 shots. Fix: before the full-page shot, scroll to 0, blur the focused field, and wait until the header is at the top and settled.
- The wrong state was shown: p.cases.empty-filtered.* (the filter matches a case), p.anomalies.empty-filtered.* (nothing on screen shows a filter), p.proof-level.default.* and p.support-access.empty.* (use a grant whose read count is 0). Read each note, and choose the URL or the record that really shows the state.
- p.abstraction-ledger.adjust-open.390: the opened Adjust form is cut off at the right edge. Decide from the code whether this is how the product renders (then mark it so, with the reason, and do not retake it) or a capture fault.

Steps:
1. Fix the capture steps in ${TOOL}/capture/tour.spec.ts, then re-run bash ${TOOL}/setup.sh with TOUR_DIR=${TOUR}, so the spec is copied.
2. Re-serve the existing build from a fresh prepare under the lock, as the README says (reserve.sh). The container restarted, so PostgreSQL 18 should be up; check it. Run the populate step, then the capture with TOUR_ONLY set to the ids. Merge the retaken entries into shots.json, replacing the old ones.
3. Leave the machine clean: the server stopped, fuser 3297/tcp empty, tp_e2e_screens dropped, /tmp/tp-e2e-tp_e2e_screens-* removed.
4. Write ${TOUR}/batches/retake.json with the retaken shots' shots.json entries.

Return what you fixed, what you retook, what you judged to be product behaviour and why, the lock minutes, and the clean-up state.`, { label: 'retake', phase: 'Retake', schema: {
  type: 'object',
  properties: { retaken: { type: 'array', items: { type: 'string' } }, productBehaviour: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } }, stillFailing: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } }, lockMinutes: { type: 'number' }, portFree: { type: 'boolean' }, databaseDropped: { type: 'boolean' }, notes: { type: 'string' } },
  required: ['retaken', 'productBehaviour', 'stillFailing', 'lockMinutes', 'portFree', 'databaseDropped', 'notes'],
} })
if (!retake) throw new Error('The retake agent returned nothing.')

phase('Check')
const check = await agent(`${RULES}
Your progress file: check-retake.jsonl, one JSON line per image verdict.

Task: check every retaken screenshot. The list is ${TOUR}/batches/retake.json (shots.json entries). The checkers' earlier notes, saying what was wrong before, are in ${TOUR}/batches/retake-input.json. The route map is /home/user/ops/designs/lane-b-ux-review/route-map.json.

Open every PNG with the Read tool. For each, decide whether the old fault is gone, and whether the shot is now the right page, role, state and theme, settled, and with only synthetic data. Use the verdicts ok, wrong-page, redirected, error-page, blank, wrong-role, not-settled, dark-not-applied, cropped, state-not-shown, not-synthetic or other. Set fixable as before, and write a note.

Write the verdicts to ${TOUR}/verify/retake.json. Return the counts and the ids still flagged.`, { label: 'check:retake', phase: 'Check', schema: {
  type: 'object', properties: { checked: { type: 'number' }, ok: { type: 'number' }, flagged: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'verdict', 'note'] } } }, required: ['checked', 'ok', 'flagged'],
} })
return { retake, check }