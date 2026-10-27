# 0058. Serve the email art from the static host, hold the brand's colors, fonts and words with checks, and compare the header and the cover with baselines

- **Status:** accepted; amends [0056](0056-wear-the-paidwhole-brand-from-one-token-source-self-hosted-fonts-and-status-as-text-on-tint.md)
  (where the email art is served from, and which files may hold hex)
- **Date:** 2026-10-17
- **Deciders:** owner (reconciliation-001, decisions D6 to D11, approved 2026-10-17); founder (engineering)
- **PRD sections:** 6 (Cross-cutting: accessibility; PHI pages make no third-party requests), 7 (the shell; "recovered"
  only beside stage five), 13 (ROI statement), 15 (Documents; Stack: compute), 18 (Testing and release);
  docs/product/change-order-001.md, CO-01 and CO-11; docs/product/reconciliation-001.md, D6 to D11 and "What must not
  change, as checks"; docs/brand/BRAND.md; ADRs 0053, 0055, 0056, 0057

## Context

Change Order 001 makes the brand drop-in (CO-01) and the product's positioning and copy (CO-11) one pull request, a
follow-up to milestone 3. The `brand/paidwhole` branch built most of CO-01 and recorded its own choices in two ADRs,
which this pull request merges unchanged apart from their numbers: main's 0054 and 0055 exist and applied migrations
cite them, so the brand's became 0056 (the brand from one token source) and 0057 (the Verified gate) (D6).

The approved reconciliation decided what the branch could not, and the branch had left four of CO-01's and CO-11's
acceptance items unbuilt:

- CO-01: "a lint check fails on any hex color outside `packages/brand/src/tokens.css` and email templates; `VerifiedSeal`
  and `VerifiedBadge` render nothing when `reconciledToCash` is false; no page requests `fonts.googleapis.com` or
  `fonts.gstatic.com`; visual tests of the header at 1280 and 390 px and the report cover with and without the seal".
  The branch allowed hex anywhere under `packages/brand/src/`, had no static guard on the font hosts and saved
  screenshots without comparing any.
- CO-11: the descriptor, the independence claim, the seal and badge text, "recovered" always labelled posted or
  deposited, no "AI", "intelligence" or "ProofPack" in product copy, and "a copy lint fails on the forbidden terms in
  `apps/web` and report templates". The branch had the tagline and the printed definition only.
- Email art needs `Cross-Origin-Resource-Policy: cross-origin`, so that a web mail client on its own origin may embed
  it. The application answers `same-origin` on every response (ADR 0053), and the branch's answer was a header rule in
  `apps/web/next.config.ts` that turned `/brand/*` to `cross-origin`. Every option changes the security program, so
  the owner chose (D7).

ADR 0056 still records the branch's reading of email and of the hex check; where this ADR differs, this ADR holds.

## Decision

**Email art from the static host; the application's headers unchanged (D7, option (b)).** CloudFront serves `/brand/*`
beside `/_next/static/*` (`BRAND_PATH_PATTERN` and `STATIC_PATH_PATTERNS` in `infra/lib/constructs/edge.ts`), fetched
from the application with the same cache policy and the same response headers policy, whose
`Cross-Origin-Resource-Policy: cross-origin` lets a web mail client embed the art; every other path is still refused at
the edge. The web image now copies `apps/web/public`, which Next's standalone output leaves out, so the art exists to be
fetched. The worker and platform tasks receive `STATIC_ASSET_ORIGIN` as the web task does (`infra/lib/constructs/compute.ts`);
the worker reads it under the web app's https-origin rule, and the mail template (`apps/worker/src/mail/template.ts`)
builds the lockup's address from it: the 1200 px PNG of the outlined horizontal lockup with its tagline, drawn at 160 px
with the alternative text "PaidWhole". With no static host configured (a local build) a message goes without the art,
and the wordmark is never typed in its place. The application's own response headers stay exactly as ADR 0053 and ADR
0055 set them: the branch's rule (`PUBLIC_BRAND_ASSET_HEADERS`) is gone, `security-headers.ts` is as `9ad1680` left it,
and `/brand/*` from the application answers `same-origin` like every other response. This replaces ADR 0056's
"Email" paragraph, which serves the art from the application under its own `cross-origin` rule.

**Dispute packets (D8).** A packet carries the practice's name as letterhead and no PaidWhole lockup, as ADR 0056
records. Their neutral wording is PR 12's.

**The branch's six brand choices are accepted (D9).** (1) The stacked lockup on Paper at sign-in; BRAND.md section 3
now lists sign-in under the stacked lockup, and section 4 gives Paper the sign-in ground beside covers and print. (2)
Unpriced chips set their text in Slate, with the unpriced gray as the chip's border. (3) Dark mode is wired through the
tokens and stays off. (4) Hex colors stand in four exact files (below). (5) Pixel baselines are committed and CI keeps
its artifacts (below). (6) `tokens.css` keeps the two colors the branch added: `--pw-input-border` (#808996, #5A6E8E in
dark mode) for form-field outlines (WCAG 1.4.11) and the alias `--pw-danger-bg`. Two of these are the brand owner's,
who alone changes the palette, and are sent to the brand owner as these questions:

- (2) `--pw-unpriced` (#7A8594) is 3.7:1 on white and 3.3:1 on `--pw-unpriced-bg`, under the brand's 4.5:1 text minimum
  (BRAND.md section 9). Will the brand darken it to at least 4.5:1 on its tint? Until then unpriced text stays Slate.
- (6) BRAND.md section 4 does not list `--pw-input-border` or `--pw-danger-bg`. Does the brand adopt them, or give
  others? Until then they stay as the branch set them; nothing in this pull request changes the palette.

**Hex colors in four exact files (D9 item 4).** `tools/brand-colors` (in `pnpm test`) reads every source file and
stylesheet under `apps`, `packages`, `tools` and `infra` and the root configuration, and allows a hex color only in
`packages/brand/src/tokens.css`, `packages/brand/src/tokens.ts`, `packages/brand/src/mark.ts` and
`apps/worker/src/mail/template.ts`, each by its exact path (`ALLOWED`); no directory is allowed by prefix. That is wider
than CO-01's words ("outside `tokens.css` and email templates"), because the drop-in's own `tokens.ts` (the typed
mirror the manifest, the viewport and email read) and `mark.ts` (the mark's fallbacks) carry hex. Any other file in
`packages/brand/src`, a new one included, is read like the rest. This replaces ADR 0056's "outside `packages/brand/src`
and the email template".

**No Google font host, three ways.** The faces stay self-hosted through `next/font/local` (ADR 0056). ESLint refuses
`next/font/google` and `@next/font/google`, with their subpaths, re-exports, `import()` and `require()`, in every
workspace, `packages/model-gateway` included (its override now lifts only the model SDK rule). `tools/brand-fonts` (in
`pnpm test`) fails on either host, in any case, in the source, stylesheets, SVG, JSON and YAML of `apps`, `packages`,
`tools` and `infra`; `docs/` is not read, since it names the hosts to forbid them. `apps/web/e2e/font-hosts.spec.ts`
loads 8 public pages and 14 pages of a signed-in practice and finds no request to either host, no refusal of one by the
Content-Security-Policy and no mention of one in a page or its stylesheets, with both hosts blocked so nothing leaves
the machine. Each static check is shown to fail on a committed fixture.

**The product's words, from one place (CO-11, D11).** `packages/brand/src/tokens.ts` holds the tagline, the descriptor
("Contract-verified payment for therapy groups"), the independence claim ("independent of the EMR and the payer"), the
seal's two lines ("VERIFIED BY PAIDWHOLE", "RECONCILED TO CASH"), the badge text ("Verified by PaidWhole"), the seal's
accessible label and the printed definition; the web components and the report frame read them, and a test checks the
outlined seal and badge art against them glyph by glyph (the same glyph wherever a letter repeats, a different one
wherever the letters differ), so changed words fail it. Placements (D11, option (a)): the descriptor is the root page
metadata's description, the web manifest's description and the request-audit page's lede; the independence claim is on
the request-audit page and the audit report's cover, never under a white label. Sign-in stays undecorated. Screening
does not exist yet; when it does it shows the lockup without the tagline, whose first sentence says owed. Every
user-facing "recovered" now says posted or deposited, either by the practice's proof level (`recoveredLabel` in
`@tp/ledger`, the per-proof-level phrases in `apps/worker/src/report/recovered-words.ts`) or as "posted or deposited";
a report that stored a bare "Recovered" shows today's stage label from code.

**The copy lint, and codes are not copy (D10).** `tools/brand-copy` (in `pnpm test`; `pnpm lint:copy` prints its
findings) parses, with the TypeScript compiler, the words the product shows wherever they are written: `apps/web/src`;
the report templates (`apps/worker/src/report`, the ROI statement, the packet's template, narrative and refusals in
`apps/worker/src/packets` and `packages/packets/src`); the email (the digest's sentences, which the digest page shows
too, the mail template, dunning, support notices and support mail); the notes a line's stage keeps when the ledger
moves it back (`apps/worker/src/reconcile/stages.ts`); and the packages whose words the screens show (`packages/ui/src`'s
states, all of `packages/triage/src`, the contract calendar). It reads string literals, template literals and JSX
text, a label split across inline elements as one, a choice of words shown in place (`{done ? 'Recovered' : 'Open'}`,
`??`, `||`, `&&`, in JSX or a template's span) one branch at a time in its context, the words an HTML template's tags
carry (aria-label, title, alt, placeholder), and each sentence on its own; in an HTML template a line break is only
whitespace. It fails on "ProofPack" or "proof pack" in any case, "AI" as a word, "intelligence", "independent
verification platform", the brand's words typed out instead of imported (a phrase matched whole; a seal line only in its
capitals or as the whole string, so "reconciled to cash" in plain wording passes), and, in any path with a `screening`
directory, owed, underpaid, recovered and the tagline. "Recovered" must be labelled by its cash: posted or deposited in
parentheses right after it ("Recovered (posted)", "Recovered principal, net (deposited)"), or posted or deposited said
and not denied in its own clause (cut at a semicolon or a colon: "recovered is the cash posted or deposited" passes,
"Recoveries posted: 3, recovered $1,200.00" and "recovered $5; 2 not yet posted" fail), or a "Posted:" or "Deposited:"
label heading the clause. Codes are exempt and never renamed (D10): a one-token lowercase string standing alone such as
the stage value `recovered` or a comparison's operand, SQL, module paths, types, object keys, code-valued attributes
(className, id, href, data-* and the like; on a component, variant, size, name and the like only when the value is one
lowercase token; an input's value only when a person does not read it) and comments are not read, so
`line_status.stage`, CSV column codes and API codes keep their values. A word shown as a JSX child or in a template's text
is copy whatever its case. An exception is a comment `brand-copy-exempt: <reason>` on the string's line or the line
above; one without a reason, or one that no longer covers a finding, is itself a finding, and the tree passes with none
(a test pins that). Tests, test support and `e2e` are not read. The digest's recovered sentence now reads "Recovered
(posted or deposited), net of recoupments and reversals: $X on N lines" (its code key `recoveries_posted` unchanged), the
audit report's page says recovered is cash posted or deposited at the practice's proof level as its PDF does, and the
ledger's move-back notes name the cash.

**Visual baselines, and CI on the same Chromium.** The brand journey (`apps/web/e2e/brand.spec.ts`) compares four
regions, and three bands inside them (below), with `toHaveScreenshot` against baselines committed in `apps/web/e2e/brand.spec.ts-snapshots/`: the app header at
1280 px and at 390 px, and the ROI statement's printed cover with the seal (the ledger's `reconciledToCash` true) and
without it (false). The data is synthetic and fixed (the journey's practice and persona, the statement's
`generatedAt`); animations are off, the caret hidden, pixels are CSS pixels and any `<time>` is masked. A pixel counts
as changed past Playwright's default color threshold (0.2), and at most 1% of pixels may change (`maxDiffPixelRatio:
0.01`): enough for a stray antialiased glyph edge under the same browser, the same self-hosted faces and the fixed text
rendering below, which a machine's font configuration no longer moves. That catches a region's layout changing (the
switcher, the account, the cover's lockup removed), but not a small element changing inside a mostly empty picture, as a review showed by mutation: the keystone
or the wordmark recolored, the wordmark set in IBM Plex Sans, the lockup moved 6 px (12 px on the cover), the practice
name in Plex Sans 400 and the cover's whole ground turned White all stayed under 1% of the 1280 x 56 header or the
816 x 1056 cover, and the brass underline is on the rail, outside the header's picture. So the journey also compares
the regions that hold the brand at a strict tolerance (`STRICT`: a pixel counts as changed past a color threshold of
0.05, and at most 6 may change): the header's lockup band (its first 152 px, at 1280 and at 390 px) and the cover's top
band (the lockup on Paper, the same with the seal and without it), in three more committed baselines. And it checks in
computed values what a picture's threshold cannot see: the lockup's ring Ink and keystone Brass, the wordmark Ink, in
the display face at 700 and -0.03em, and its place in the header (`expectLockupOnBrand`); the cover's ground Paper, the
outlined lockup present with its keystone Brass and every other path Ink, in its place 0.85 in and 0.9 in from the
corner, and the practice's name in Schibsted Grotesk 600 (`expectCoverOnBrand`); the cover's ground Paper to the pixel
above the lockup and across its lower left; and, as before, the active rail item's underline Brass. Checked by mutation,
each in a run against the committed baselines: the keystone recolored Ink, the wordmark recolored Slate or set in Plex
Sans, and the lockup moved 6 px each fail the header's lockup band and the computed check at both widths; the underline
recolored Ink fails its computed check; on the cover, the lockup removed, its keystone recolored Ink and the lockup moved
12 px each fail the top band and the computed check, the practice's name in Plex Sans 400 fails the computed check, and
the ground turned White fails the computed check and the ground's pixels (White is within the strict threshold of Paper,
so the band's comparison alone would pass it). Unmutated, every check passes. The seal and its definition line are about
0.5% of the cover, under the whole cover's tolerance, so the seal's absence is not left to it: the cover's foot, where
the seal prints, must be Paper and nothing else in the run's picture and in the committed baseline, and with the seal
earned the same box holds thousands of ink and brass pixels. Checked by mutation: the frame printing the seal with its
definition for `false` fails the comparison (2% of pixels); the seal art alone, without its `data-verified` marker or
caption, passes the comparison and the DOM check and fails the foot check. The baselines are Chrome for Testing 156.0.8078.4 (revision 1248), Playwright's Chromium for `@playwright/test` 1.64.1, which `apps/web/e2e/browser.json` records file by file; they were made on Ubuntu 24.04 and are proved on ubuntu-26.04 by CI's baseline step, which regenerates all seven from nothing on every pull request and push run (amendment below; first made with Chromium 141.0.7390.37 under 1.56.1). CI ran Google Chrome
where Playwright's Chromium was not installed, so `ci.yml` now runs `pnpm --filter @tp/web exec playwright install
--with-deps chromium` right before the unit tests (so the worker's print checks below run there too, and a test fails in
CI if Chromium is missing rather than skipping) and the config takes that build. The same build was not enough: Chromium
on Linux takes its text rasterization (hinting, subpixel antialiasing) from the host's fontconfig, the self-hosted faces
included, and the machine that made the baselines rasterizes text unhinted and in grayscale, while GitHub's runner
starts the stock Chromium under Ubuntu's stock fontconfig, which hints slightly with RGB subpixel order. The first CI run
with the build failed the 1280 px header by 1130 pixels (2%); that build under a copy of the stock configuration, here,
differs from the baselines by the same 1130 pixels, by 231 in the strict lockup band, and by 6336 and 5257 on the covers.
So the e2e browser's text rendering no longer comes from the host: `playwright.config.ts` starts it with
`--font-render-hinting=none` and `--disable-lcd-text` (Chromium 141 honours both, and with either alone the text still
differs) and gives it its own fontconfig, `apps/web/e2e/fonts.conf`, which takes the host's font directories and then
assigns grayscale antialiasing, no hinting and no subpixel rendering over whatever the host sets (whether text is
antialiased at all is left to fontconfig by the switches). With both, the header and the two covers render byte for byte
as the baselines under four host configurations (the machine's own, Ubuntu's stock, full hinting with the autohinter and
RGB, and antialiasing off), and the seven baselines regenerated under them are byte for byte the ones committed, which
that machine had made with the same two switches. `--disable-font-subpixel-positioning`, which Chromium 141 also
honours, is not passed: subpixel positioning did not vary with the host, and the switch would move every glyph. Every
text the baselines hold is drawn in the brand's web faces (Chromium's record of the fonts each text node used, with the
host preferring Inter for sans-serif or not, and a glyph check of the faces for each character shown, the truncation's
ellipsis included), so the host's installed fonts do not enter them either. The screenshots for people stay in
`brand-screenshots/`, and CI uploads them with the Playwright report and test results (the diffs of a failed
comparison included) after the e2e step, failed runs included. A failed run also prints each diff and actual picture
under `apps/web/test-results` smaller than 300 KB into the job's log, as its SHA-256 and then its base64 in numbered
lines of 8,000 characters (amendment below; first as one line), so a comparison can be read where the artifact cannot
be fetched.

**Printed documents print at full size.** Chromium shrinks a whole PDF to fit when anything is wider than the inside
pages' content box (8.5 in less the stylesheet's 0.75 in margins: 672 CSS px), the full-bleed Paper cover and the 16 px
running-header mark with it. The audit report's ten-column cases table did, because every amount and date column was
kept on one line, mixed cells ("3 lines, $90.00", "not estimated") included; the dispute packet's thirteen-column line
schedule did too. The report frame (`FIGURE_COLUMN_STYLES` in `apps/worker/src/report/brand.ts`, `brand.css`) now keeps
only date columns on one line; an amount column's cells wrap between words while an amount itself, which has no break
opportunity, stays whole; a new `data-id` column kind (IDs, claim control numbers, trace references, plan keys) breaks
inside an identifier where it must, while short codes ("97110") stay whole. The audit report's and the packet's tables
take 4 pt of side padding instead of 6. `apps/worker/src/report/print-layout.test.ts` lays out every printed template
(audit report, ROI statement, coverage report, monthly summary, packet), with its tests' figures and with the widest a
practice's documents plausibly hold, under print media at 672 px and requires nothing wider and no amount or date broken
across lines; it then prints each with `ChromiumPdfRenderer` and reads the PDF's text layer (pdf.js) for the cover's
headline at its 26 pt and the running header's title at its 10 pt, which hold only when nothing shrank. Both checks
are shown to fail on a table kept on one line, and fail on the frame as it stood before this change.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| D7 (a): the application answers `cross-origin` on `/brand/*` (the branch's rule) | Changes the application's own headers that ADR 0053 and 0055 fix; the static host already carries the one tested exception |
| D7 (c): embed the lockup in each email (attachment or data URL) | Many clients block data-URL images, and an attached image shows as an attachment in some; revisit if the static host goes away |
| Make `STATIC_ASSET_ORIGIN` required for the worker in production | A missing value would stop mail rather than send it plainly; infra always sets it. Switch if a deploy is ever found without it |
| Allow hex in `packages/brand/src/` by prefix (the branch) | A new file in the package could carry hex unchecked |
| Read CO-01 literally: hex only in `tokens.css` and email templates | The drop-in's own `tokens.ts` and `mark.ts` would fail |
| A regular-expression copy lint over whole files | Reads comments, identifiers and codes, so the stage code `recovered` and every CSV column would be findings |
| Rename the stage code `recovered` (D10 (b)) | Changes the five-stage status model and a CHECK on a triage table, which the change order does not ask for |
| An exact pixel match, or a tolerance of several percent | Exact breaks on antialiasing; several percent lets a lockup or underline change pass |
| Leave the seal's absence to the cover's comparison | The seal is about 0.5% of the cover's pixels, under any useful tolerance |
| Keep CI on Google Chrome with baselines of its own | The runner image moves Chrome's version without a commit here; the installed Chromium moves only with `@playwright/test` in the lockfile |
| Run the e2e step in Playwright's container image | A larger change to CI for the same browser build, and the text would still follow that image's fontconfig; it would also change the rendering host the baselines depend on, and compose Postgres would need Docker in Docker (amendment below) |
| Install the browser jobs' system packages from a hand-kept `.deb` set with `dpkg -i` (amendment below) | Loses apt's check against the signed index and goes stale with every security update |
| Drop `--with-deps` to avoid the mirror's stalls | CI-05 requires it, and the fonts it installs are part of the rendering host |
| Another Ubuntu mirror | Moves the throttle; does not remove it |
| Hold the browser by its binary's SHA-256 alone | The build's other files draw the pictures too (the software GL, the ICU data, the resources), and Playwright verifies no download |
| The worker image installs playwright-core from the registry at a version read from the manifest | An unpinned fetch beside the lockfile's integrity-checked one, and the manifest says `catalog:` |
| Loosen `VISUAL` and `STRICT` until the runner's hinted text passes | The runner's text moved 2% of the header and 231 pixels of the lockup band, past what the mutations above are caught within |

## Consequences

- `pnpm test` runs the hex check, the font-host scan and its ESLint fixture tests, and the copy lint; `pnpm lint`
  refuses Google's font loader; `pnpm test:e2e` runs the font-host journey, the copy journey (`e2e/copy.spec.ts`, the D11
  placements and the undecorated sign-in) and the brand journey with its baselines. `tools/test/workflows.test.ts` pins
  the Chromium install step right before the unit tests (and so before the e2e step), the browser build check right after
  every install, the baseline step in the first e2e shard, the artifact upload right after
  the e2e step, the print of a failed run's pictures after it, the seven baselines, and the e2e browser's text
  rendering switches and `e2e/fonts.conf`.
- A deliberate change to the header or the cover, or an upgrade of `@playwright/test` (which moves Chromium; Dependabot
  proposes one weekly), may need new baselines: follow `docs/runbooks/ci.md`, "Upgrading the browser": on Linux with
  Playwright's Chromium, run `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all`
  (`=all` rewrites every snapshot; Playwright 1.64 renamed the bare flag's modes), look at the seven images (the
  journey itself refuses a without-seal baseline whose foot is not blank Paper) and commit them in the same pull request.
  On macOS, on Windows or under Google Chrome the comparisons do not apply: Playwright names baselines by platform, so a
  missing one fails the journey there; run it on Linux or in CI.
- The image build is not checked here (no Docker daemon). The first deploy should confirm that
  `https://<StaticDomainName>/brand/paidwhole-lockup-horizontal-tagline-1200w.png` answers 200 with
  `Cross-Origin-Resource-Policy: cross-origin`. CloudFront caches `/brand/*` under the build output's policy; Next serves
  public files with `max-age=0`, so CloudFront keeps them for its one-second minimum, and a changed lockup shows almost
  at once although the names are not content-hashed.
- The hex rule is D9 item 4, which the owner approved: hex in `packages/brand/src/tokens.css`, `tokens.ts` and `mark.ts`
  and `apps/worker/src/mail/template.ts`, each by its exact path. `tokens.css`'s header and `packages/brand/README.md`
  say so. `.claude/rules/brand.md`, which applies from this pull request on (CO-01), still says `tokens.css` is the only
  file with brand hex apart from the email template. It is Claude Code's own instruction file, which a session changes
  only on a person's word, so its sentence waits for the owner; the wording proposed is "No hex values in components:
  brand hex stands only in packages/brand/src/tokens.css, tokens.ts and mark.ts, and in the email template
  (apps/worker/src/mail/template.ts), which takes its hex from tokens.ts; tools/brand-colors holds the list." Until then
  this ADR and `tools/brand-colors` (`ALLOWED`) are the record. BRAND.md section 1 lists only the tagline; adding the
  descriptor and the independence claim there is the brand owner's call.
- The response headers, the schema, the engine, the ledger's semantics, the content pipeline and the catalog are
  unchanged; `packages/ledger` gains only the branch's pure `reportReconciliation()` and `recoveredLabel()`.

## Revisit when

The brand owner answers (2) or (6); a dark-mode setting is offered; the static host or the application's response
headers change; screening is built (PR 6) and its paths fall under the copy lint's screening rules; the packet's neutral
wording lands (PR 12); or a Playwright upgrade moves the rendering past the tolerance.

## Amendment (`co-001/ci-browser`, 2026-10-26): the browser build recorded and checked, the baselines proved on CI, and the header named by what it shows

Playwright 1.64.1 pins Chrome for Testing 156.0.8078.4 (revision 1248) for both Chromium and its headless shell, where
1.56.1 pinned 141.0.7390.37 (revision 1194); with `@axe-core/playwright` 4.14.0 it is the first of the two versions to
support Ubuntu 26.04, where every job but the release's capacity chain now runs (ADR 0066, Part 3). Four things change
with it (designs/lane-b-ci.md §3.3; test matrix CI-18 and CI-19).

**The build is recorded, every file of it.** `apps/web/e2e/browser.json` records the revision, the Chrome for Testing
version and, for each build (`chrome-headless-shell-linux64`, which renders the baselines and prints the worker's PDFs,
and `chrome-linux64`, which `playwright.config.ts` probes for), its directory, its binary's path, its tree SHA-256, its
binary's SHA-256, and Google's zip with its SHA-256 (the local layout's pin). It names no Playwright version: the
manifests and the lockfile do. The tree SHA-256 is the SHA-256 of the lines `"<sha256>  <path>\n"` of every regular
file under the build's directory, sorted by path bytes (`cd <revision dir> && find <dir> -type f -print0 | LC_ALL=C sort
-z | xargs -0 sha256sum | sha256sum`), and those lines are committed beside it as `browser-builds/<dir>.sha256`, whose
own SHA-256 is the tree SHA-256. The headless shell's build is 287 files and Chromium's 301, among them the software GL
that draws the pictures (`libvk_swiftshader.so`, `libGLESv2.so`, `libEGL.so`), the ICU data and the `.pak` resources, all
of which affect rendering. Playwright verifies no download, and CI restores its browsers by cache key alone, so a binary's
hash alone would let any of them move.

**The build is checked after every install.** `tools/ci/browser-build.ts` (Node's own modules only, run by Node 24 with
no install) finds the installed playwright-core through `@playwright/test` → `playwright` → `playwright-core` (pnpm
hoists none of them), requires its `browsers.json` to pin the recorded revision and version, computes both builds' tree
and binary SHA-256s, and fails on any difference, naming what it found, what is recorded, ADR 0058's procedure and,
when the build is the recorded revision, every file that differs; a build that fails it has its every file's line
printed, as `--list` prints them, so one run gives a new record. With `--image <ref>` it checks the worker image's
headless shell inside the image. It runs right after every `playwright install` in every workflow, before any test and
before any cache is saved, so a build that fails it is never cached, and on the worker image in every job that builds
it into a local tag before the tag is measured, saved or pushed: `ci.yml`'s `images`, the release's build, and both
measuring jobs (`release-capacity.yml`'s and `screening-capacity.yml`'s `capacity`). The steps after it still run when it fails (their condition is the install's
success), so a Playwright upgrade's pull request shows everything the new browser does. **That pull request is red here
by design**: every upgrade brings a new build, and a new browser under unchanged baselines is what this ADR forbids. It
turns green when a person runs the procedure (`docs/runbooks/ci.md`, "Upgrading the browser"): the new build laid out
locally, the baselines regenerated, CI's baseline step read, `browser.json`'s hashes updated. This is the one exception
to ADR 0066's rule that a Dependabot pull request passes unaided.

**CI proves the bytes.** The comparisons carry tolerances (`VISUAL`, `STRICT`), so a green journey does not prove that
CI renders the committed bytes, and CI's host is not the machine that made them. A baseline step in the first e2e shard,
on every pull request and every push run with no condition on what changed (the pictures are drawn by application code
as much as by the browser: a change under 1% would pass the journey and leave the baselines stale), regenerates them
with `--update-snapshots=all --retries=0` into an empty directory outside the repository (`E2E_BASELINES_DIR`, which
`playwright.config.ts` turns into the snapshot path), so each is written from nothing while the tracked tree stays as
committed, which the prebuilt build's stamp requires; it requires the run to pass and the pictures present after it to
be exactly the committed set, and fails on any byte that differs from the commit, printing each differing picture's
SHA-256 and then the picture as numbered lines of 8,000 base64 characters (`<path> <i>/<n> <chunk>`),
so a log reader that cuts long lines still gets it whole and proves the decode; the failed comparisons' pictures
print the same way, through the same `tools/ci/print-pictures.sh`. The pull request that moved to 1.64.1
records its first passing run, with the seven SHA-256s, as this ADR's proof that ubuntu-26.04 renders the committed
bytes; if the local host and CI ever disagree, CI's bytes are committed and the difference is recorded here. For 1.64.1
the seven were regenerated on Ubuntu 24.04 with the 1248 build laid out from Google's zips and held to `browser.json`,
and a second run wrote nothing. Six are the 141 baselines pixel for pixel and changed bytes only because 1.64.1's PNG
encoder picks other scanline filters, so any Playwright upgrade may rewrite every file. On `report-cover-without-seal`
Chrome 156 draws the title 'ROI statement' 1 px lower (1,611 pixels in 234 x 27 at 83, 418, 0.19% of the picture
against the journey's 1%; shifted down one pixel, the old title matches exactly; nothing else on the cover moves). Every new set of baselines is inspected against this ADR's brand points,
image by image, before it merges (for 1.64.1, by an adversarial visual-inspection agent, whose record the pull request
links).

**The worker image takes the lockfile's playwright-core.** Its build stage, which installs with
`pnpm install --frozen-lockfile` and so checks every tarball against the lockfile's integrity, copies the resolved
`playwright-core` out with `cp -RL`, and the runtime stage installs the headless shell with that package's own CLI. The
image names no version, so it cannot drift from the manifests as it did in #38, where the manifest moved and the image's
literal did not; `tools/test/browser-version.test.ts` holds the manifests, the catalog line and the lockfile to one
version and the Dockerfile to this form.

**The header is named by what it shows.** axe-core 4.14.0 enables `label-content-name-mismatch` (WCAG 2.5.3, Label in
Name), which every `expectAccessible` scan now runs. The practice switcher was named "Practice switcher" while it shows
the practice's name, and the account control "Account menu" while it shows the address and an initial. Both are now
named from their content, in the words the co-founder's ruling took for them (UX-094 in the UX baseline,
`designs/lane-b-ux-review.md` section 6.1 on `claude/build-ops`): the practice's name, then a visually hidden ", switch
practice"; the address, visually hidden below `md` where only the initial shows, then a visually hidden ", account and
sign out". Neither summary has an `aria-label` or a `title`, so Chromium does not also read the practice or the address
as the control's description, and tests reach the two by `data-slot` (`practice-switcher`, `account-menu`). The span
that holds the hidden words is their containing block (`relative`), so its truncation clips them instead of letting
their position widen the page. The initial is drawn as CSS generated content (`data-initial`,
`before:content-[attr(data-initial)]`), not a text node. The pictures are unchanged: the first names (an `aria-label`
each) were byte for byte under 1.56.1 and pixel for pixel under 1.64.1, and with these names the seven regenerated under
1.64.1 into an empty directory are the committed files byte for byte. The brand journey holds every header control's
accessible name to start with its visible text and contain each other piece of it, generated content included, at 1280
and 390 px (at 390 px the account shows only its initial, for which axe answers "incomplete" rather than a violation),
and reads Chromium's own name and description of the switcher and the account.
