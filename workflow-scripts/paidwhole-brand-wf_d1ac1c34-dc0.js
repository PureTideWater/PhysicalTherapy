export const meta = {
  name: 'paidwhole-brand',
  description: 'Incorporate the PaidWhole brand drop-in (tokens, mark, lockups, fonts, verified seal and badge, icons) into the web app, emails and PDF reports on an isolated branch; then review and fix',
  phases: [
    { title: 'Build', detail: 'copy and adapt the drop-in, wire it through web, email and reports' },
    { title: 'Review', detail: 'brand conformance with screenshots; correctness and safety' },
    { title: 'Fix', detail: 'address findings and verify' },
  ],
}

const WT = '/home/user/pw-brand'
const KIT = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/brand-unzipped'
const ENV = `
ENVIRONMENT AND HOUSE RULES (read carefully before anything else):
- Work ONLY in the git worktree ${WT} (branch brand/paidwhole, created from claude/build-platform at 07d2670; dependencies installed). NEVER touch /home/user/PhysicalTherapy: another workflow (milestones 10-11 review and fixes) is working there at the same time. Commit on brand/paidwhole at checkpoints (the container can restart and lose uncommitted work) with messages "<area>: <summary>", a short body, a blank line and exactly these two trailer lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
  Do NOT push. Never put a model name in code, comments, docs or commit messages.
- The user supplied a brand drop-in for the product name PaidWhole and asked for it to be incorporated into the app. It is extracted (and already checked: no scripts or external references in any SVG; fonts under the SIL Open Font License with license text) at ${KIT}. Its README.md, docs/brand/BRAND.md and .claude/rules/brand.md are the brand specification; read all three first. The drop-in assumes apps/web/app, apps/web/components and apps/web/lib, but this repository uses apps/web/src/app, apps/web/src/components and apps/web/src/lib, and it uses Tailwind v4 (CSS-first, @theme) rather than a tailwind.config.ts preset.
- The product plan (docs/product/*.md, CLAUDE.md, .claude/**) stays the specification for behavior; the brand changes how things look and what the product is called, never what it computes. The plan's Starter kit says to replace the working name with yours, so the product name becomes PaidWhole in user-facing text, README and CLAUDE.md's title line only. Do not modify docs/product/*.md (other than nothing), .claude/settings.json (does not exist; do not create it), ci.yml, migrations already committed, or golden lines.
- Postgres 16 at postgres://postgres:test@localhost:5432/postgres (superuser). If down: su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /root/pgdata -l /root/pgdata/log.txt -o '-p 5432 -k /tmp' start". Use your own scratch databases (unique names starting with brand_, dropped after) and for e2e your own E2E_DATABASE (starting with brand_e2e) and an E2E_PORT in 3300-3399. The machine is shared with the other workflow: do NOT run the full 27-minute database suite; run the database test files your change touches. Typecheck, lint, lint:logs, the unit suite, build and e2e are fine.
- Network: npm works; Google Fonts and other font CDNs must not be used at build time or run time (blocked here, and the plan forbids third-party requests from PHI pages). No Docker, no AWS.
- Playwright Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH set); never run "playwright install".
- Never claim a check passed that you did not run.
`
const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    built: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } },
    decisions: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'absolute paths of screenshots taken' },
    commit: { type: 'string' },
  },
  required: ['summary', 'built', 'checks', 'decisions', 'not_done', 'screenshots', 'commit'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } },
    checks_run: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'checks_run'],
}

phase('Build')
const build = await agent(`${ENV}
TASK: Incorporate the PaidWhole brand into the product, faithfully to the drop-in's specification, adapted to this repository.

1. Copy the drop-in into ${WT}: packages/brand as @paidwhole/brand (keep its files; it holds tokens, mark geometry, assets and the bundled fonts with LICENSES.txt); the React components into apps/web/src/components/brand; icon.svg, apple-icon.png and manifest.ts into apps/web/src/app; brand.css beside globals.css; public/brand and public/icons into apps/web/public; docs/brand/BRAND.md; .claude/rules/brand.md (the user supplied it; add it as is). Add "@paidwhole/brand": "workspace:*" to apps/web and apps/worker (and any package that renders brand output), run pnpm install, and make sure the package typechecks and lints under the repo's strict settings (fix only what the strict config requires, keeping the brand's behavior).
2. Fonts: replace the drop-in's next/font/google loader with next/font/local reading the bundled woff2 files from packages/brand/assets/fonts (same CSS variables --font-display, --font-sans, --font-mono, display swap), so nothing is fetched from Google at build or run time. Remove any other font source.
3. Theme: import tokens.css and brand.css in globals.css; expose the preset's utilities in Tailwind v4 (@theme mapping to the CSS variables, same names: bg-ink, text-fg-muted, bg-paper, text-status-short, bg-status-short-bg, font-display, font-mono, ring-focus ...); map @tp/ui's shadcn/ui CSS variables to the tokens (background, foreground, primary, ring, border, destructive, muted-foreground and the rest) so every existing component is on brand without per-component styling; dark mode through the semantic tokens.
4. Product chrome: the app header uses <PaidWholeLockup size={20}/> with the practice switcher and account on the right and a single brass underline on the active navigation item; sign-in uses the stacked lockup on Paper; empty and loading states use the mark alone, never animated (loading uses a plain progress bar); dashboard tiles use the brand's tile rules; every money figure, code, unit count and rate renders in the mono font with tabular numerals; status chips use text on tint with their labels (map the five line stages and unpriced to the whole/short/unpriced tints or neutral tokens sensibly, never color alone; record the mapping in an ADR); "Recovered" never appears without "posted" or "deposited" in its label where it shows money; replace every hard-coded hex color in apps/web components with tokens.
5. The name: user-facing "PaidWhole" everywhere the working name or a placeholder appears - page titles and metadata, the manifest, the status page, terms page, onboarding and invitation pages, email subjects and sender name, PDF report titles, the README's title (keep the README's content), and CLAUDE.md's first line only ("# PaidWhole: therapy contract-payment platform"). Do not rename packages, tables, roles or environment variables.
6. Email templates (the mail interface in the worker and web): the header uses markSvg({ size: 24, fills: { ring: palette.ink, keystone: palette.brass } }) or the outlined lockup, with hex taken from @paidwhole/brand's tokens.ts (email cannot use CSS variables); links only, never PHI, as before.
7. PDF reports (the worker's Playwright pipeline: audit report, packets, ROI statement, coverage report, monthly summary): inline tokens.css and the report brand.css into each template with the bundled fonts loaded without the network (file URLs or data URLs that Chromium accepts in setContent); convert the report brand.css's hex values to the tokens (tokens.css is inlined, so the variables resolve), keeping @font-face; Paper cover with the outlined lockup top left; white inside pages with the 16 px mark in the running header; the seal bottom right of the cover and the definition line only when earned; for billing-firm white-label reports the badge in the footer only when earned (the white-label flow itself is milestone 12; build the gate and the slot).
8. The Verified gate: implement a function in the ledger layer (for example reportReconciliation in @tp/worker/ledger or @tp/ledger) that derives reconciledToCash for a report from its ledger entries (every line in the report's recovered total has a posted or deposited entry net of recoupment and reversal, under the practice's proof level; a report with no recovered total does not earn the mark) and names its source; the seal and badge render only through that function's result, never a literal true, in web and PDF alike. Record the rule in an ADR with the brand's definition line.
9. Tests: a check that fails on any hex color outside packages/brand/src/** and the email templates (wire it into pnpm lint or pnpm test); unit tests that VerifiedSeal and VerifiedBadge render nothing when reconciledToCash is false, and that the PDF cover omits the seal when the ledger says not reconciled and includes it when it does; a Playwright check that no page requests fonts.googleapis.com, fonts.gstatic.com or any third-party origin; Playwright screenshots of the header at 1280 and 390 px wide, the sign-in page, a table with status tints, a dashboard tile row, and the report cover with and without the seal (save the PNGs under ${WT}/brand-screenshots/ - gitignored - and list their paths in "screenshots"); existing tests updated only where they asserted the old name or old colors.
10. Run pnpm typecheck, lint, lint:logs, test, test:golden, build, test:e2e (own database and port), and the database test files your change touches; fix what fails; commit at checkpoints on brand/paidwhole. Look at your own screenshots (Read the PNGs) and fix anything that is off-brand before finishing.`, { label: 'brand build', phase: 'Build', schema: BUILD_SCHEMA })

phase('Review')
const REVIEW = `${ENV}
You are a READ-ONLY reviewer: run any commands, write only under /tmp/claude-0/review-brand-<lens>, never edit tracked files in ${WT}. The work under review is git -C ${WT} diff 07d2670..brand/paidwhole. Build report: ${JSON.stringify(build)}
`
const reviews = await parallel([
  () => agent(`${REVIEW}
LENS: brand conformance. Check the product against docs/brand/BRAND.md and .claude/rules/brand.md, every section and every "Do not": the mark drawn only through PaidWholeMark or markSvg (no copied paths, no PNG of the mark in the app), the small cut at 32 px and below, minimum sizes, the lockup's wordmark one word in the display face 700 at -0.03em, the header lockup and the single brass underline, Brass never as text on white, a button fill or a background, status as text on tint with labels, money in mono with tabular numerals, expected/paid/short order, "Recovered" labels, empty and loading states (no spinner mark), dark mode through tokens, fonts only from the bundled files, the report cover (Paper, lockup top left, 16 px mark in running headers, seal only when earned with its definition), email headers with hex from tokens.ts, accessibility (contrast at least 4.5:1, visible focus, aria on lone and decorative marks). Start the built app yourself (own E2E_DATABASE brand_e2e_rev1 and a port in 3300-3399) and take your own Playwright screenshots at 1280 and 390 px of the header, sign-in, dashboard, a table with status chips, and a generated report PDF cover; Read the images and judge them as a demanding brand designer would. Report every deviation.`, { label: 'review: brand conformance', phase: 'Review', schema: FINDINGS_SCHEMA }),
  () => agent(`${REVIEW}
LENS: correctness and safety. The Verified gate: is reconciledToCash derived from ledger entries exactly as the definition says (posted or deposited, net of recoupment and reversal, proof level respected), can any path render the seal or badge with a literal or an approved-but-unposted amount, does a report with nothing recovered refuse it? Fonts: any request to a third-party origin at build or run time (inspect next build output and the PDF renderer's requests), any font loaded over the network in the worker? Hex check: does it really fail on a hex in a component (prove it with a throwaway file), and does it exempt only what it should? PHI: do email templates or report headers now carry anything they did not before? Regressions: run pnpm typecheck, lint, lint:logs, test, test:golden, build in a fresh clone of brand/paidwhole (git clone -b brand/paidwhole ${WT} /tmp/claude-0/review-brand-safety/repo; pnpm install --frozen-lockfile) and the e2e suite with your own database and port; report failures with output. Did any change alter what the product computes or the plan's behavior?`, { label: 'review: correctness + safety', phase: 'Review', schema: FINDINGS_SCHEMA }),
])
const findings = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${findings.length} brand findings (${findings.filter(f => f.severity !== 'minor').length} blocker or major)`)

phase('Fix')
const fix = await agent(`${ENV}
TASK: Fix the brand review findings on brand/paidwhole in ${WT}. Findings (JSON):
${JSON.stringify(findings, null, 1)}

Verify each against the code and the brand specification first; fix every real blocker and major finding and every cheap real minor one; say why for any you reject. Retake the screenshots for anything visual you changed and Read them. Then run pnpm typecheck, lint, lint:logs, test, test:golden, build and test:e2e (own database and port) and the touched database test files; commit at checkpoints on brand/paidwhole.`, { label: 'brand fix', phase: 'Fix', schema: {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, reason: { type: 'string' } }, required: ['finding', 'reason'] } },
    checks: BUILD_SCHEMA.properties.checks,
    screenshots: { type: 'array', items: { type: 'string' } },
    commit: { type: 'string' },
  },
  required: ['fixed', 'rejected', 'checks', 'screenshots', 'commit'],
} })

return { build, findings, fix }
