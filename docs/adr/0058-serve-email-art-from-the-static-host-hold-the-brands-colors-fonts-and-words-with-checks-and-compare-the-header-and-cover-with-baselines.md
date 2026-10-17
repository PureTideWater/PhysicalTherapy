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
findings) parses `apps/web/src`, `apps/worker/src/report`, the ROI statement and packet templates and the stage labels
(`packages/triage/src/headline.ts`) with the TypeScript compiler and reads string literals, template literals and JSX
text, a label split across inline elements as one, each sentence on its own. It fails on "ProofPack" or "proof pack" in
any case, "AI" as a word, "intelligence", "independent verification platform", "recovered" in a sentence without posted
or deposited, the brand's words typed out instead of imported, and, in any path with a `screening` directory, owed,
underpaid, recovered and the tagline. Codes are exempt and never renamed (D10): a one-token lowercase string such as the
stage value `recovered`, SQL, module paths, types, object keys, code-valued attributes and comments are not read, so
`line_status.stage`, CSV column codes and API codes keep their values. An exception is a comment
`brand-copy-exempt: <reason>` on the string's line or the line above; one without a reason, or one that no longer
covers a finding, is itself a finding, and the tree passes with none (a test pins that). Tests, test support and `e2e`
are not read.

**Visual baselines, and CI on the same Chromium.** The brand journey (`apps/web/e2e/brand.spec.ts`) compares four
regions with `toHaveScreenshot` against baselines committed in `apps/web/e2e/brand.spec.ts-snapshots/`: the app header at
1280 px and at 390 px, and the ROI statement's printed cover with the seal (the ledger's `reconciledToCash` true) and
without it (false). The data is synthetic and fixed (the journey's practice and persona, the statement's
`generatedAt`); animations are off, the caret hidden, pixels are CSS pixels and any `<time>` is masked. A pixel counts
as changed past Playwright's default color threshold (0.2), and at most 1% of pixels may change (`maxDiffPixelRatio:
0.01`): enough for antialiasing at glyph edges, the one thing a machine's font configuration moves under the same browser
and the same self-hosted faces, and less than a moved or recolored lockup, underline, switcher or line of the cover
changes. The seal and its definition line are about 0.5% of the cover, under that tolerance, so the seal's absence is
not left to it: the cover's foot, where the seal prints, must be Paper and nothing else in the run's picture and in the
committed baseline, and with the seal earned the same box holds thousands of ink and brass pixels. Checked by mutation:
the frame printing the seal with its definition for `false` fails the comparison (2% of pixels); the seal art alone,
without its `data-verified` marker or caption, passes the comparison and the DOM check and fails the foot check. The
baselines are Playwright's Chromium (141.0.7390.37 for `@playwright/test` 1.56.1) on Ubuntu 24.04. CI ran Google Chrome
where Playwright's Chromium was not installed, so `ci.yml` now runs `pnpm --filter @tp/web exec playwright install
--with-deps chromium` right before the unit tests (so the worker's print checks below run there too, and a test fails in
CI if Chromium is missing rather than skipping) and the config takes that build. The screenshots for people stay in
`brand-screenshots/`, and CI uploads them with the Playwright report and test results (the diffs of a failed
comparison included) after the e2e step, failed runs included.

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
| Run the e2e step in Playwright's container image | A larger change to CI for the same browser build |

## Consequences

- `pnpm test` runs the hex check, the font-host scan and its ESLint fixture tests, and the copy lint; `pnpm lint`
  refuses Google's font loader; `pnpm test:e2e` runs the font-host journey, the copy journey (`e2e/copy.spec.ts`, the D11
  placements and the undecorated sign-in) and the brand journey with its baselines. `tools/test/workflows.test.ts` pins
  the Chromium install step right before the unit tests (and so before the e2e step), the artifact upload right after
  the e2e step, and the four baselines.
- A deliberate change to the header or the cover, or an upgrade of `@playwright/test` (which moves Chromium; Dependabot
  proposes one weekly), may need new baselines: on Linux with Playwright's Chromium, run
  `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots`, look at the four images (the
  journey itself refuses a without-seal baseline whose foot is not blank Paper) and commit them in the same pull request.
  On macOS, on Windows or under Google Chrome the comparisons do not apply: Playwright names baselines by platform, so a
  missing one fails the journey there; run it on Linux or in CI.
- The image build is not checked here (no Docker daemon). The first deploy should confirm that
  `https://<StaticDomainName>/brand/paidwhole-lockup-horizontal-tagline-1200w.png` answers 200 with
  `Cross-Origin-Resource-Policy: cross-origin`. CloudFront caches `/brand/*` under the build output's policy; Next serves
  public files with `max-age=0`, so CloudFront keeps them for its one-second minimum, and a changed lockup shows almost
  at once although the names are not content-hashed.
- `.claude/rules/brand.md` still says `tokens.css` is the only file with brand hex apart from the email template; this
  ADR is the record until the rule's owner aligns it. BRAND.md section 1 lists only the tagline; adding the descriptor
  and the independence claim there is the brand owner's call.
- The response headers, the schema, the engine, the ledger's semantics, the content pipeline and the catalog are
  unchanged; `packages/ledger` gains only the branch's pure `reportReconciliation()` and `recoveredLabel()`.

## Revisit when

The brand owner answers (2) or (6); a dark-mode setting is offered; the static host or the application's response
headers change; screening is built (PR 6) and its paths fall under the copy lint's screening rules; the packet's neutral
wording lands (PR 12); or a Playwright upgrade moves the rendering past the tolerance.
