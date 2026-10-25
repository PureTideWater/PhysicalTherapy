export const meta = {
  name: 'lane-b-screen-tour',
  description: 'Screen tour of PaidWhole at 9c57d2d: about 25 key screens captured from the production build on synthetic data, then each image checked and captioned',
  phases: [
    { title: 'Capture', detail: 'build once, seed synthetic data, sign in per role, screenshot about 25 screens at 1280 px and 4 at 390 px' },
    { title: 'Check', detail: 'look at every image: right page, no error, synthetic data only; plain-words captions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/screens'

const SHOT_SCHEMA = {
  type: 'object',
  properties: {
    shots: { type: 'array', items: { type: 'object', properties: {
      file: { type: 'string', description: 'absolute path of the PNG' },
      title: { type: 'string' }, area: { type: 'string', description: 'one of: Getting started, Payments in, Contracts and pricing, Disputes, Recovery and reports, Free screening, Operator console, Account' },
      role: { type: 'string', description: 'who is signed in, or "public"' },
      path: { type: 'string' }, width: { type: 'number' },
      what_it_shows: { type: 'string' },
    }, required: ['file', 'title', 'area', 'role', 'path', 'width', 'what_it_shows'] } },
    how: { type: 'string' },
    skipped: { type: 'array', items: { type: 'string' } },
  },
  required: ['shots', 'how', 'skipped'],
}

phase('Capture')
const cap = await agent(`You capture a screenshot tour of the PaidWhole web app for the co-founder, who wants to see the product as it stands. PaidWhole (CLAUDE.md is in your context) ingests copies of 835 remittances and payer contracts, prices each line under approved contract versions, groups shortfalls into dispute packets a person approves, and proves recovery by reconciling later remittances.

Worktree: /home/user/screens (detached at 9c57d2d, the latest claude/build-platform, installed). Use only what the repository's own e2e setup gives: apps/web/playwright.config.ts, apps/web/e2e/env.ts, prepare.ts (which prepares and seeds a database with synthetic data only), helpers.ts and journeys.ts (how the journeys sign in as each role and reach each page). Never use or type real data. Change no tracked file in the worktree (write your capture script under ${OUT}/, not in the repo; you may import the e2e helpers from it).

Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 at localhost:5433 (postgres:test). Playwright's Chromium (revision 1194) is in /opt/pw-browsers. Use your own database name (for example E2E_DATABASE=tp_e2e_screens) and port (for example E2E_PORT=3297), so nothing collides with the e2e runs of other agents. Two other workflows share this 4-CPU machine: run the build and the server's lifetime under the shared lock, flock /tmp/laneb-heavy.lock <command>, and keep the whole capture within about 30 minutes of holding it. Stop the server and drop your database at the end.

Steps: build the web app once (pnpm build, as the e2e webServer does), prepare and seed your database with e2e/prepare.ts, start the standalone server, then with a Playwright script sign in as the right role for each screen and save full-page PNGs (device scale factor 1) to ${OUT}/png/NN-<slug>.png. Wait for each page's data to finish loading; dismiss nothing that a real user would see.

Choose about 25 screens that tell the product's story in order, using pages the seed actually populates (pick the richest synthetic records). Aim for: sign-in; the practice home; uploading a remittance; the remittance list and one remittance's lines; contracts and one contract version with its rates and their citations; payer and plan mapping; pricing runs and one priced line's explanation (its trace); the findings or anomalies grouped by payer pattern; cases and one case; a dispute packet under review (the approve step) and the payer's copy; reconciliation and the ledger; monitoring; the ROI report with the Verified seal; the free screening's public page, its upload form and a result; the operator console's home and one console page; billing; and settings or the access log. Then the same four at 390 px wide (phone): the practice home, a case, the screening page, the ROI report. If a screen cannot be reached with the seeded data, skip it and say why in "skipped"; do not fake data.

Return the structured list in story order, each with what the screen shows in one plain sentence for a non-technical founder. Write the same list to ${OUT}/manifest.json.`, { label: 'capture', phase: 'Capture', schema: SHOT_SCHEMA })
if (!cap) throw new Error('The capture agent returned nothing.')

phase('Check')
const chk = await agent(`You check a screenshot tour of the PaidWhole web app before it is shown to the co-founder. The capture list:
${JSON.stringify(cap.shots, null, 1)}

Open every PNG with the Read tool and look at it. For each: is it the screen its title says (not a sign-in redirect, an error page, an empty state that hides the feature, or a half-loaded page)? Does every name, number and identifier look synthetic (the seed's twins; flag anything that looks like a real person's details)? Then write a short, plain caption for a non-technical founder: what the user sees and why it matters for the product (one or two sentences, no jargon, no code names). Keep story order. Mark any image that fails with ok: false and the reason. Write the checked list to ${OUT}/gallery.json and return it.`, { label: 'check', phase: 'Check', schema: {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, title: { type: 'string' }, area: { type: 'string' }, role: { type: 'string' }, width: { type: 'number' }, caption: { type: 'string' }, ok: { type: 'boolean' }, problem: { type: 'string' } }, required: ['file', 'title', 'area', 'role', 'width', 'caption', 'ok', 'problem'] } },
    summary: { type: 'string' },
  },
  required: ['items', 'summary'],
} })
if (!chk) throw new Error('The checker returned nothing.')
return { how: cap.how, skipped: cap.skipped, items: chk.items, summary: chk.summary }
