export const meta = {
  name: 'lane-b-ux-capture',
  description: 'UX baseline part 1: map all 83 routes, extend the screen tour to every page at 1280/390 px with dark tokens and states, capture on synthetic data, check every image',
  phases: [
    { title: 'Map', detail: 'four scouts map the 83 page routes: persona, records, the spec that creates them, states' },
    { title: 'Critic', detail: 'completeness and accuracy check of the route map; writes it to designs/lane-b-ux-review/' },
    { title: 'Capture', detail: 'extend tour.spec.ts and the populate list on claude/build-ops, then build, serve and capture under the lock' },
    { title: 'Check', detail: 'every image looked at: right page and role, settled, synthetic, dark applied' },
    { title: 'Retake', detail: 'one round for fixable failures, then a re-check of the retaken shots' },
    { title: 'Manifest', detail: 'manifest, coverage matrix and the reviewer image sets' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad'
const TOUR = SP + '/screens'
const UXD = '/home/user/ops/designs/lane-b-ux-review'
const TOOL = '/home/user/ops/tools/lane-b-screen-tour'

const RULES = `Context: you work for Lane B of the PaidWhole build (CLAUDE.md is in your context; the lane rules are /home/user/ops/LANES.md). This is the UX/UI and brand baseline review, brief /home/user/ops/designs/lane-b-ux-review-brief.md. It changes no product code.
Rules for you:
- Synthetic data only. Never type, paste or invent real-looking patient, claim or payer data; the seed and the repository's e2e journeys make the only records.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (the default node is 22; the repository needs 24).
- Heavy commands (pnpm install, build, typecheck, tests, Playwright runs, the tour's build and server) run only under the shared lock: flock /tmp/laneb-heavy.lock <command>, one at a time. Another workflow shares this 4-CPU machine.
- Change no tracked file in /home/user/PhysicalTherapy or in the tour worktree /home/user/screens. In /home/user/ops, change only the files your task names. Never run git add, commit, push, checkout, reset or stash anywhere: the orchestrator commits.
- No model name or identifier in any file you write. Never write the development master key to a file (the tour's env.sh derives it at run time).
- Long commands: run them with run_in_background and wait for the notification (or a Monitor until-loop); the Bash tool refuses a long foreground sleep.`

const ROUTE = {
  type: 'object',
  properties: {
    file: { type: 'string', description: 'the page.tsx path, repo-relative' },
    route: { type: 'string', description: 'URL pattern, e.g. /p/[practiceId]/cases/[caseId]' },
    personas: { type: 'array', items: { type: 'string' }, description: 'persona keys from apps/web/scripts/synthetic-personas.ts that may open it; the first is the one who uses it most' },
    permission: { type: 'string', description: 'the check that admits them, with file:line' },
    segments: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, record: { type: 'string' }, source: { type: 'string', description: 'seed, or the e2e spec and test that creates it, or none' } }, required: ['name', 'record', 'source'] } },
    populateSpecs: { type: 'array', items: { type: 'string' }, description: 'apps/web/e2e/*.spec.ts files that must run first so the page shows real content; [] when the seed suffices' },
    reachable: { type: 'string', enum: ['seed', 'after-populate', 'not-reachable'] },
    notReachableReason: { type: 'string' },
    states: { type: 'object', properties: {
      empty: { type: 'string', description: 'how to reach its empty state, or "none"' },
      loading: { type: 'string', description: 'its loading.tsx or client loading state and how to hold it (page.route on its data or RSC request), or "none"' },
      error: { type: 'string', description: 'a validation or error state a person can reach and how, or "none"' },
      notFound: { type: 'string', description: 'how an unknown ID of the right shape renders, or "none"' },
    }, required: ['empty', 'loading', 'error', 'notFound'] },
    interactions: { type: 'array', items: { type: 'string' }, description: 'dialogs, tabs, menus or steps worth their own shot, each with how to open it' },
    notes: { type: 'string' },
  },
  required: ['file', 'route', 'personas', 'permission', 'segments', 'populateSpecs', 'reachable', 'notReachableReason', 'states', 'interactions', 'notes'],
}
const MAP_SCHEMA = { type: 'object', properties: { routes: { type: 'array', items: ROUTE }, areaNotes: { type: 'string' } }, required: ['routes', 'areaNotes'] }

const AREAS = [
  { key: 'money', title: 'the practice workflow: uploads, remittances, claims and lines, pricing runs, anomalies, cases and packets, reconciliation, reports, digests, the practice home' },
  { key: 'setup', title: 'the practice set-up: contracts and versions, abstraction, mapping, coverage, releases, practice settings, notifications, support access' },
  { key: 'console', title: 'the operator console, organization settings and billing, and the account pages' },
  { key: 'public', title: 'the public and sign-in pages: home, sign-in and its steps, terms, security, status, support, maintenance, request-audit, the free screening and its results' },
]

phase('Map')
const scouted = await parallel(AREAS.map(a => () => agent(`${RULES}

Task: map every page route in ${a.title}, at /home/user/PhysicalTherapy (claude/build-platform 6ddd587). Read-only.
Your files, exactly these ${args[a.key].length}:
${args[a.key].join('\n')}

For each page.tsx, read the page and what it imports, and record (schema fields):
- route pattern; the personas that may open it (apps/web/scripts/synthetic-personas.ts names them; the admitting check is in the page, its layout, or apps/web/src/lib/routes/*.ts and the server helpers it calls; cite file:line). First persona = the one who uses it most.
- each dynamic segment's record, and where a synthetic record comes from: the seed (apps/web/e2e/prepare.ts and what it seeds) or a named apps/web/e2e/*.spec.ts test that creates it through the product. Read the specs to be sure; the screen tour already runs layout-1280, packets, reconciliation, monitoring, billing and contracts (see /home/user/ops/tools/lane-b-screen-tour/screens.config.ts and capture/tour.spec.ts for what it reaches today and how it finds IDs).
- reachable: "seed", "after-populate" (name the specs), or "not-reachable" with the exact reason. Never propose faking a record.
- states: empty (a seeded practice the journeys leave empty, or a filter), loading (a loading.tsx or client loading component, and whether page.route can hold it), error (a validation error a person can trigger, or an error boundary), not-found (an unknown ID of the right shape); write "none" where there is none.
- interactions worth their own shot (dialogs, confirm steps, tabs, expanded rows), each with how to open it.
Be exact; another agent writes the capture from your map without re-reading every page.`, { label: `map:${a.key}`, phase: 'Map', schema: MAP_SCHEMA })))

const merged = scouted.filter(Boolean).flatMap(s => s.routes)
log(`route map: ${merged.length} of 83 entries from ${scouted.filter(Boolean).length} of 4 scouts`)

phase('Critic')
const critic = await agent(`${RULES}

Task: check a route map of the PaidWhole web app for completeness and accuracy, correct it, and write it out.
The four scouts' area notes:
${scouted.filter(Boolean).map((s, i) => `- ${AREAS[i] ? AREAS[i].key : i}: ${s.areaNotes}`).join('\n')}
The merged map (${merged.length} entries):
${JSON.stringify(merged)}

1. Completeness: run find /home/user/PhysicalTherapy/apps/web/src/app -name page.tsx (83 expected). Every file must have exactly one entry; add any missing entry yourself by reading the page.
2. Accuracy, adversarially: re-verify against the code every "not-reachable" (is there truly no seed or spec record? read prepare.ts, the seed and the specs), every persona list and permission citation for the console, settings and support-access routes, and a sample of at least 15 other entries across all four areas (segments, populateSpecs, states). Correct what is wrong.
3. Write the corrected map to ${UXD}/route-map.json (the routes array, sorted by route) and a readable ${UXD}/route-map.md: a short intro (what, at which commit, how to use it for later tours), then one table row per route (route, first persona, reachable, populate specs, states present), then the not-reachable routes with their reasons, then the specs the capture's populate step must run. Create the directory if needed. These files are the only ones you write.
Return the corrected full map and what you changed.`, { label: 'critic', phase: 'Critic', schema: {
  type: 'object',
  properties: { routes: { type: 'array', items: ROUTE }, changes: { type: 'array', items: { type: 'string' } }, populateSpecs: { type: 'array', items: { type: 'string' } } },
  required: ['routes', 'changes', 'populateSpecs'],
} })
if (!critic) throw new Error('The route-map critic returned nothing.')
const routes = critic.routes
log(`route map: ${routes.length} routes; ${routes.filter(r => r.reachable === 'not-reachable').length} not reachable on synthetic data; ${critic.changes.length} corrections`)

const SHOT_FIELDS = `Each shots.json entry: { "file" (absolute PNG path), "id" (a stable shot name, used by TOUR_ONLY), "path" (the URL actually shown), "routePattern", "role" (persona key or "public"), "width" (1280 or 390), "theme" ("light" or "dark (tokens only)"), "state" ("default", "empty", "loading", "error", "not-found" or "interaction:<name>"), "note" }.`

const CAPTURE_SCHEMA = {
  type: 'object',
  properties: {
    shotsJson: { type: 'string' },
    total: { type: 'number' },
    byKind: { type: 'string', description: 'counts by width, theme and state' },
    routesCovered: { type: 'number' },
    skipped: { type: 'array', items: { type: 'object', properties: { route: { type: 'string' }, shot: { type: 'string' }, reason: { type: 'string' } }, required: ['route', 'shot', 'reason'] } },
    batches: { type: 'array', items: { type: 'string' }, description: 'absolute paths of the batch files for the image checkers' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    populate: { type: 'string', description: 'which specs ran, passed, failed, and any --grep-invert added with why' },
    lockMinutes: { type: 'number' },
    runs: { type: 'number' },
    portFree: { type: 'boolean' },
    databaseDropped: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['shotsJson', 'total', 'byKind', 'routesCovered', 'skipped', 'batches', 'filesChanged', 'populate', 'lockMinutes', 'runs', 'portFree', 'databaseDropped', 'notes'],
}

phase('Capture')
const cap = await agent(`${RULES}

Task: extend the Lane B screen tour so it captures every reachable page of the PaidWhole web app, then run it and leave the machine clean.

Read first: ${TOOL}/README.md and every script and spec beside it; the route map ${UXD}/route-map.json (${routes.length} routes; the populate specs it names: ${JSON.stringify(critic.populateSpecs)}); apps/web/e2e/helpers.ts, journeys.ts, prepare.ts and brand.spec.ts:400-420 (how dark is set) in /home/user/PhysicalTherapy.

Change only these, on claude/build-ops (the orchestrator commits them): ${TOOL}/capture/tour.spec.ts, ${TOOL}/screens.config.ts, ${TOOL}/run.sh, ${TOOL}/README.md, and new small scripts in ${TOOL}/ if they help (for example a reserve.sh that re-serves an existing build with a fresh prepare). Keep the existing shots working.

What the tour must capture, each as the map's first persona (add a second persona only where the map says the page differs materially by role):
- every route the map marks reachable: 1280x800 light, 1280x800 dark (tokens only), 390x844 light. Full page, device scale factor 1, settled as save() does.
- dark: after the light shot at 1280, set document.documentElement.dataset.theme = 'dark' as brand.spec.ts does, settle, shoot, then remove it.
- each state and interaction the map names (empty, loading, error, not-found, interactions): 1280 light and 390 light. Loading: hold the page's data or RSC request with page.route where the map says that works; where it cannot be held, record it as skipped with the reason.
- a route marked not-reachable is not captured; list it in skipped with the map's reason. Never fake a record.
- name every shot with a stable id, and let the env var TOUR_ONLY (comma-separated ids) restrict the capture to those ids, for retakes.
- ${SHOT_FIELDS} Write shots.json and the skipped list as the existing tour does, and keep ids.json.
- populate: add the map's populate specs to screens.config.ts's populate project, unchanged and whole. If one fails, read why: exclude only tests no needed record depends on (run.sh's --grep-invert, with a comment saying why), or record which routes lose their records.

Run it (README, Set-up): export TOUR_DIR=${TOUR}; bash ${TOOL}/setup.sh (re-run it after each change, it copies the files into TOUR_DIR); then from TOUR_DIR: TOUR_MINUTES=90 flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1 in the background; bash run.sh in the background; when it ends, touch $TOUR_DIR/stop. A re-run must start from a fresh prepare (the platform administrator's key registers once per database); to re-serve without rebuilding, run serve.sh under the lock the way build.sh does (write its pid to $TOUR_DIR/server.pid first, clear stop and ready), or add reserve.sh for it. Iterate until every reachable route is captured or has an exact reason, but keep your total time holding the lock under about 150 minutes, and never leave a server running between runs.

At the end, every time: build.log or your serve log says the server stopped; fuser 3297/tcp prints nothing (if it prints a process, fuser -k 3297/tcp and wait); drop the database (PGPASSWORD=test psql -h localhost -p 5433 -U postgres -d postgres -c 'DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)'); rm -rf /tmp/tp-e2e-tp_e2e_screens-*.

Then write batch files for the image checkers: ${TOUR}/batches/batch-NN.json, each a JSON array of shots.json entries, grouped by area (practice workflow, practice set-up, console and account, public and sign-in), at most 45 shots per batch. Return the structured result.`, { label: 'capture', phase: 'Capture', schema: CAPTURE_SCHEMA })
if (!cap) throw new Error('The capture agent returned nothing.')
log(`capture: ${cap.total} shots over ${cap.routesCovered} routes in ${cap.runs} run(s), ${cap.lockMinutes} min under the lock; ${cap.skipped.length} skipped; port free ${cap.portFree}`)

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    batch: { type: 'string' }, checked: { type: 'number' }, ok: { type: 'number' },
    flagged: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, file: { type: 'string' },
      verdict: { type: 'string', enum: ['wrong-page', 'redirected', 'error-page', 'blank', 'wrong-role', 'not-settled', 'dark-not-applied', 'cropped', 'state-not-shown', 'not-synthetic', 'other'] },
      note: { type: 'string' }, fixable: { type: 'boolean', description: 'true when a better capture step could fix it; false when the product itself shows this' },
    }, required: ['id', 'file', 'verdict', 'note', 'fixable'] } },
  },
  required: ['batch', 'checked', 'ok', 'flagged'],
}
const checkPrompt = (batch, routeMap) => `${RULES}

Task: check every screenshot in one batch of the PaidWhole screen tour before reviewers use them. Read-only, except your one output file.
Batch file: ${batch} (a JSON array of shots: file, id, path, routePattern, role, width, theme, state, note).
The route map is ${routeMap} (what each route should show and who uses it).
Open every PNG with the Read tool and look at it. For each shot decide:
- is it the page its routePattern says, as its role (not a sign-in redirect, a 404 or error page unless state says so, not blank)?
- is it settled (no spinner or skeleton unless state is "loading"), not cut off?
- theme "dark (tokens only)": is dark actually applied?
- state: does the image show that state?
- does every name, number and identifier look synthetic (SYNTHETIC practice names, the seed's twins)? Flag anything that looks like a real person's details.
Mark fixable true when a better capture step could fix it; false when this is how the product really renders (that is a finding for the reviewers, not a capture fault; say so in note).
Write your verdicts for every shot (ok ones included) to ${TOUR}/verify/<the batch file's basename>, then return the summary with only the flagged shots.`

phase('Check')
const batches = cap.batches || []
const checks = (await parallel(batches.map(b => () => agent(checkPrompt(b, UXD + '/route-map.json'), { label: `check:${b.split('/').pop()}`, phase: 'Check', schema: CHECK_SCHEMA })))).filter(Boolean)
const flagged = checks.flatMap(c => c.flagged)
const fixable = flagged.filter(f => f.fixable)
log(`check: ${checks.reduce((n, c) => n + c.checked, 0)} images checked in ${checks.length} of ${batches.length} batches; ${flagged.length} flagged, ${fixable.length} fixable`)

let retake = null
let recheck = null
if (fixable.length > 0) {
  phase('Retake')
  retake = await agent(`${RULES}

Task: retake the screen tour's flagged shots. The tour and its tooling: ${TOOL} (README); the working directory TOUR_DIR=${TOUR}, already set up and built; the route map ${UXD}/route-map.json.
The checkers flagged these as fixable capture faults:
${JSON.stringify(fixable, null, 1)}
1. Fix their capture steps in ${TOOL}/capture/tour.spec.ts (the orchestrator commits it), then bash ${TOOL}/setup.sh again with TOUR_DIR=${TOUR} to copy it.
2. Re-serve the existing build from a fresh prepare under the lock (README; serve.sh or reserve.sh, as the tour's README now says), run the populate step, then the capture with TOUR_ONLY set to the flagged ids, so only they are retaken. Merge the retaken entries into shots.json, replacing the old ones.
3. Leave the machine clean as the README says: the server stopped, fuser 3297/tcp empty, the database dropped, /tmp/tp-e2e-tp_e2e_screens-* removed.
4. Write ${TOUR}/batches/retake.json with the retaken shots' entries. Return what you fixed and what still fails, with why.`, { label: 'retake', phase: 'Retake', schema: {
    type: 'object',
    properties: { retaken: { type: 'number' }, stillFailing: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } }, portFree: { type: 'boolean' }, databaseDropped: { type: 'boolean' }, notes: { type: 'string' } },
    required: ['retaken', 'stillFailing', 'portFree', 'databaseDropped', 'notes'],
  } })
  if (retake && retake.retaken > 0) {
    recheck = await agent(checkPrompt(TOUR + '/batches/retake.json', UXD + '/route-map.json'), { label: 'check:retake', phase: 'Retake', schema: CHECK_SCHEMA })
  }
}

phase('Manifest')
const manifest = await agent(`${RULES}

Task: write the screen tour's manifest, its coverage matrix, and the image sets each reviewer will get.
Inputs: ${TOUR}/shots.json (the tour's skipped list beside it), the checkers' verdicts in ${TOUR}/verify/*.json (retake.json's verdicts replace the earlier ones for the retaken ids), the route map ${UXD}/route-map.json.
Write:
1. ${UXD}/manifest.json: one entry per shot { id, file (basename only), routePattern, path, role, width, theme, state, verdict ("ok" or the flag), note }. No absolute scratchpad paths; the PNGs stay in ${TOUR}/png and go to a private gallery, never the repository.
2. ${UXD}/coverage.md: what the tour covers at which commit (claude/build-platform 6ddd587, synthetic data); a table of every route (rows) by 1280 light, 1280 dark (tokens only), 390 light and states (each cell the shot id, or why not); the not-reachable routes with reasons; the flagged shots still standing and why.
3. The reviewer image sets as JSON arrays of absolute PNG paths with their manifest entries, in ${TOUR}/review-sets/:
   - narrow.json: every 390 shot and every state shot (the 390 px and states reviewer);
   - brand.json: one 1280 light shot per distinct layout (shell, console shell, public, sign-in, document-style pages) plus every 1280 dark shot;
   - flows.json: for each persona, the 1280 light shots of the routes it uses, ordered as that person would move through them;
   - words.json: one 1280 light shot per route, plus every error, empty and not-found state;
   - a11y.json: one 1280 light and one 1280 dark shot per route, plus every interaction and error state.
   Leave out shots whose verdict is a capture fault (not-settled, blank, redirected and the like); keep shots that show how the product really renders.
Return the counts.`, { label: 'manifest', phase: 'Manifest', schema: {
  type: 'object',
  properties: { shots: { type: 'number' }, ok: { type: 'number' }, standingFlags: { type: 'number' }, routesWithShots: { type: 'number' }, notReachable: { type: 'number' },
    sets: { type: 'object', properties: { narrow: { type: 'number' }, brand: { type: 'number' }, flows: { type: 'number' }, words: { type: 'number' }, a11y: { type: 'number' } }, required: ['narrow', 'brand', 'flows', 'words', 'a11y'] },
    pngBytes: { type: 'number', description: 'total size of the PNGs in bytes' }, notes: { type: 'string' } },
  required: ['shots', 'ok', 'standingFlags', 'routesWithShots', 'notReachable', 'sets', 'pngBytes', 'notes'],
} })

return {
  map: { routes: routes.length, notReachable: routes.filter(r => r.reachable === 'not-reachable').map(r => ({ route: r.route, why: r.notReachableReason })), changes: critic.changes, populateSpecs: critic.populateSpecs },
  capture: cap,
  check: { batches: checks.map(c => ({ batch: c.batch, checked: c.checked, ok: c.ok, flagged: c.flagged.length })), flagged },
  retake, recheck, manifest,
}