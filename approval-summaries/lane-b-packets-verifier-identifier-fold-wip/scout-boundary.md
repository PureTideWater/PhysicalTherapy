# Scout: the package boundary for packets-verifier-identifier-fold

Worktree /home/user/packets-verifier-identifier-fold at 23b25ad0. Nothing tracked was changed. The probes are in
/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pvf/scratch/closure-probe.ts and closure-probe2.ts.

## Verdict
1. **packets cannot import @tp/model-gateway.** The dependency already runs the other way, so the import would make a
   cycle. It would also put the provider SDKs and @tp/db in the browser bundle and break the mutation changes job.
2. **The fold and matcher in redact.ts are self-contained.** The file has no imports at all. So the core can move
   word for word into a pure package that both import, with no change in behaviour.
3. **Two homes work: a new package, or packages/packets.** No rule in the repo forbids either.
   - A new pure package is the cleaner choice. It needs about eight small integration edits (listed below).
   - The repo has a precedent for moving reading code into packets: ADR 0086 / 0054's 2026-10-28 amendment moved
     the role grammar out of the gateway. That option needs no new package.
4. **The cost decision is whether the moved matcher is mutation-tested, not where it lives.** The gate allows no
   unrecorded survivor. Each equivalent mutant needs a reviewer other than its proposer.

## Rules that govern imports, each checked
| Rule | Where | Effect on this item |
|---|---|---|
| Model SDK import ban | eslint.config.js:16-18, 37-39, 46-52, 125-126; the gateway override at :141-148; tested by packages/model-gateway/src/lint.test.ts:30-54 and tools/test/eslint-rules.test.ts:25-73 | Applies only to `@anthropic-ai/*` and `@aws-sdk/client-bedrock*`. It does not stop packets importing @tp/model-gateway or a new package. A fold is not a model call. |
| Money syntax (no Number(), parseFloat or float literals) | eslint.config.js:66-93 (MONEY_PACKAGES, which includes packets and the gateway), applied at :138-140 and :146 | redact.ts already passes it, because the gateway is listed. A new package must be added to MONEY_PACKAGES, or the code moves out from under the rule. MONEY_PACKAGES is used only in eslint.config.js, and no test pins it. |
| No other import-boundary rule | eslint.config.js has no rule on which workspace package may import which. There are no dependency-cruiser or boundaries plugins. | Only package.json dependencies (pnpm strict linking) and the cycle limit what may be imported. |
| Gateway lint.test.ts reachability checks | packages/model-gateway/src/lint.test.ts:65-191 (testing.ts reachable only from tests; patient-records factories); workspacePackages() at :198-213 scans every package under packages/ | A new package is picked up automatically and does no harm, as long as it never imports gateway testing.ts or names the records factories. |
| CLAUDE.md "Call a model outside packages/model-gateway" | CLAUDE.md, Never list | Not engaged: the fold makes no model call. The rule is a reason the gateway's entry point should never be pulled into packets. |
| ADR 0002 (packages export TS source) | docs/adr/0002-workspace-packages-export-typescript-source.md, Decision | Dependencies are declared as `workspace:*`. Packages export `./src/index.ts`. apps/web compiles the packages listed in `transpilePackages`. Pure packages keep database code out. |
| ADR 0001 (one gateway) | docs/adr/0001-*.md:33-34 | Same as the CLAUDE.md rule. |
| CODEOWNERS | .github/CODEOWNERS:9 (`*` for the founder); tools/test/codeowners.test.ts:52+ pins the exact list of patterns | A new package needs no line. Adding one would break the pinned list, so add none. |

## Why packets cannot depend on @tp/model-gateway
- **Cycle.** packages/model-gateway/package.json declares `"@tp/packets": "workspace:*"`. The gateway imports
  packets in these files:
  - permitted.ts:2 (canonicalNumber)
  - figures.ts:3 (canonicalNumber, readableText, scanText)
  - hash.ts:3 (canonicalJson)
  - functions/narrative-roles.ts:1
  - testing.ts:5-6
  - redact.property.test.ts:1 and eval/gate.golden.test.ts:6, both for packets' own `identifierForms`

  A packets → gateway edge would make a workspace cycle. No pnpm setting refuses cycles (there is no .npmrc and no
  cycle setting in pnpm-workspace.yaml), but ESM evaluation order would hang on index.ts re-exports.
- **Browser.** The verifier runs in the browser. packages/packets/src/check.ts:1-3 imports
  `./verifier/mismatches`, and apps/web/src/components/packets/narrative-editor.tsx:4 imports
  `@tp/packets/check`. check.ts states "Nothing here reads a Node module, a clock or the network".
  - The gateway's entry point re-exports the providers (packages/model-gateway/src/index.ts:135-137: BedrockProvider,
    AnthropicProvider) and imports @tp/db/runtime (flags.ts:1, patient-records.ts:14), node:crypto (hash.ts:1) and
    node:fs (providers/local.ts).
  - The gateway exports only `.` and `./testing` (its package.json `exports`), so redact.ts cannot be imported on
    its own without a new export, which still leaves the cycle.
- **Mutation changes job.** tools/stryker/affected.ts:30-31 and :55 stop when a closure file reads the file system
  without being listed as a reader. The probe below shows the gateway's entry closure holds an fs reader
  (providers/local.ts). Pulling it into packets' closure would stop the job until DATA_FILES or readers change.

Probe results (importGraph from tools/screening-capacity/watched.ts:128, type-only imports included):
```
packets check.ts (browser)      files 112  [contracts 14, db 37, money 4, packets 21, pricing 9, rules 17, triage 10]
packets verifier/mismatches.ts  files 111  (same, packets 20)
gateway index.ts                files 177  (+ model-gateway 44, observability 4, packets 38)
gateway redact.ts               files 1    (no imports at all)
packets mutation closure (index + every non-db test, tests included): 165 files, 0 gateway files
fs readers in the gateway index closure: ["packages/model-gateway/src/providers/local.ts"]
```

## What there is to share
packages/model-gateway/src/redact.ts has 2,250 lines and 128,891 bytes, and no `import` line. Its matcher core is
lines 75-1760, about 58 KB without comments:
- dates: MONTHS, dateForms at 78, datesIn at 217
- BLANK, IGNORABLE and MARKS at 246-249; BARRIER at 263; PLACEHOLDER at 265
- `fold` at 270; `viewOf` at 329
- NAME_JOINERS and NUMBER_JOINERS at 385 and 395; HYPHENATION at 401
- forms: numberForm, nameWords, nameForm and formsOf at 459-515; initials at 544
- labels at 623-745: IDENTIFIER_LABEL at 639, LINE_OR_SENTENCE_START at 647 (#115), labelsBefore at 686
- `matchesIn` at 746
- SSN and phone patterns at 959-1306 (#127); patternMatchesIn at 1306
- the survivor scan at 1462-1680
- merge at 1685; redactionSpans at 1733

The public checks are holdsIdentifier at 1797 (letters) and holdsNameOrNumber at 1807. The second is the narrative
drafter's input check, reached through functions/narrative.ts:8 and :118, mentionsIdentifier.

Within the gateway, redact.ts is imported by:
- patient-records.ts:16
- index.ts:208
- testing.ts:20
- functions/narrative.ts:8
- functions/denial-letter.ts:9
- functions/contract-terms.ts:12
- test-support/screen-bound.ts:6
- tests: redact.test.ts, redact.property.test.ts, denial-letter.test.ts, contract-terms.test.ts, figures.test.ts and
  eval/gate.golden.test.ts:12

A move keeps redact.ts as a re-exporting or wrapping module, so none of those import paths changes.

Adapter facts the designer needs:
- `masked()` at redact.ts:1790 NFKC-normalizes the text and replaces the gateway's placeholders
  (`[PATIENT_NAME]` … `[CLAIM_n]`) with a one-character BARRIER, which changes positions.
- The verifier works on `readableText(narrative).text` (packages/packets/src/readable.ts: NFKC with hidden characters
  removed). It skips its own placeholders (`{{claim_control_number:1}}`), citation markers (`[1]`) and dated figures
  (mismatches.ts:334, DATED at :291).
- A shared API therefore has to take the text plus spans to skip and return positions in the caller's text. It cannot
  reuse `masked`.
- Today packets exports `identifierForms` (mismatches.ts:253; verifier/index.ts:19; index.ts:150). Tests outside the
  package pin it: verifier.test.ts:303-304 and gateway redact.property.test.ts:306. Keep it or migrate those tests.

## Option A: a new pure package (for example packages/identifier-fold; the name is the designer's)
What the repository requires, each item checked:
1. **package.json** modelled on packages/packets/package.json:
   - `name @tp/…`, `private`, `"type": "module"`, `exports { ".": "./src/index.ts" }`
   - `scripts.typecheck` exactly `tsc --noEmit`. tools/typecheck/run.ts:83-101 refuses anything else.
   - devDependencies `@types/node`, `typescript`, `vitest` and `fast-check`, all as `catalog:`.
     tools/test/no-duplicated-versions.test.ts:52 and :125 read every workspace manifest.
   - No runtime dependencies. A README is optional; packages/triage has none.
2. **tsconfig.json** as packages/packets/tsconfig.json: `extends ../../tsconfig.base.json`, `include ["src"]`. There
   are no project references (ADR 0002, Alternatives).
3. **Workspace.** pnpm-workspace.yaml:2-3 already globs `packages/*`. typecheck projects are derived
   (tools/typecheck/run.ts:53-66 and :107). The only count asserted is `>= 20` (run.test.ts:41), plus the
   projects = dirs + 1 identity at :58. No count to bump.
4. **Dependencies.** Add `"@tp/<new>": "workspace:*"` to packages/packets and packages/model-gateway dependencies.
   - apps/web and apps/worker need no direct entry for transitive use under pnpm, because packets resolves it from
     its own node_modules.
   - `pnpm install` adds an importer to pnpm-lock.yaml. CLAUDE.md then requires `pnpm toolchain:check`
     (BASE=origin/claude/build-platform, networked) after a manifest or lockfile change.
5. **apps/web/next.config.ts:33-51 `transpilePackages`.** This list is kept by hand and no test checks it. The new
   package must be added, because it ships TypeScript source, reached through @tp/packets/check in the browser and
   through the gateway on the server. The worker's esbuild bundle (apps/worker/build.ts:58, externals pg-native and
   playwright-core) picks it up with no change. The Dockerfiles `COPY . .` (apps/web/Dockerfile:20,
   apps/worker/Dockerfile:15), so no change there either.
6. **eslint.config.js:66-78 MONEY_PACKAGES.** Add the new package, so the moved code keeps the money-syntax rule it has
   today under the gateway. Lint groups (tools/lint/groups.ts:35-44) root at `packages`, so nothing changes there.
7. **Vitest.** vitest.config.ts:8 `WORKSPACES = {apps,packages,infra,tools}` and the unit project at :82 pick up
   `packages/<new>/src/**/*.test.ts` automatically. Coverage includes `packages/*/src/**` (:111). Branch-gated globs
   (:16-22) are money, pricing, ledger, edi835 and authz, so the new package is not gated unless the designer adds it.
8. **Screening-capacity watched paths.** tools/screening-capacity/watched-paths.txt is derived (watched.ts:7-26) and
   held equal by watched.test.ts. It already holds `packages/*/package.json` and both packages' sources (redact.ts at
   :413, packets src at :427+). The new package's src files are reached from the worker's main.ts through the
   gateway and packets. Regenerate the list with `pnpm exec tsx tools/screening-capacity/watched.ts --write`;
   watched.test fails otherwise. A change on this path triggers the screening-capacity gate.
9. **Stryker workspace aliases** are generated from every package.json (vitest.mutation.config.ts header; tools/stryker/
   workspace.ts), so mutants in the new package would be reached by name. No edit is needed.
10. **CODEOWNERS:** no line (see the table). The CLAUDE.md "Where things are" list could name the package, but that
    file is founder-owned (.github/CODEOWNERS:60). Leave it, or propose the line in the PR.

Upside of A: the letter redaction keeps its home outside a "packet assembly" package, and packets stays as it is
apart from the import. Downside: the lockfile and toolchain:check, a hand-kept transpilePackages entry, and a new
MONEY_PACKAGES entry.

## Option B: move the core into packages/packets (no new package)
- The gateway already depends on packets, so redact.ts would import the core from `@tp/packets` (the 0086 precedent:
  docs/adr/0054-*.md:497-513; gateway functions/narrative-roles.ts:1).
- No manifest, lockfile, transpilePackages, eslint or typecheck change. The money-syntax rule applies already.
- The browser bundle carries the matcher either way, since check.ts → mismatches.ts. There is no bundle-size test in
  apps/web.
- Downside: packets' description ("Packet assembly, the verifier, and PDF and CSV export", packages/packets/
  package.json) would hold the letter reader's PHI redaction. Each change to the redaction then also changes packets,
  which affects all packets mutation shards (below).

## Mutation testing: the cost driver for either option
- stryker/base.mjs:24 `MUTATION_PACKAGES = money, pricing, ledger, packets`. The gateway is not mutated today, so
  redact.ts has never been mutation-tested.
- MUTATE.packets (base.mjs:48-75) lists packets files explicitly. ADR 0066 (docs/adr/0066-*.md:1299) defines it as
  "the verifier and what it reads". A fold the verifier reads falls under that definition. Leaving it out is a
  departure the ADR amendment would have to state.
- To mutate the moved core:
  - Option A: add `packages/<new>/src/**/*.ts` (less tests) to MUTATE.packets, and add `packages/<new>/src/**/*.test.ts`
    to TEST_SETS.packets (vitest.mutation.config.ts:37-42). pricing already lists tools/ tests, which is a precedent.
  - Option B: add the files to MUTATE.packets.
  - The gate maps files by each shard's `mutate` list, not by path prefix (tools/stryker/gate.ts:308, :326, :391,
    :459). gate.test.ts:435's prefix lookup is test data only.
  - Adding a fifth MutationPackage would be far heavier: affected.ts says "all four" throughout, plus TEST_SETS,
    DATA_FILES, a config per package and the gate. Don't.
- **Shards.** stryker/shards.json has 17 shards. tools/stryker/shards.test.ts:25 pins the exact list of names.
  :34-41 requires every MUTATE file in exactly one shard. mutation.yml:89 sets a 30-minute shard timeout.
  - Size estimate: about 58 KB of regex-dense code, against roles.ts at 16.7 KB = 1,917 mutants and scan.ts at 25 KB =
    939 s of mutant time. That suggests roughly 4,000 to 7,000 mutants, so 4 to 6 new shards at the 7-minute target.
    Each needs a name in shards.json, the pinned list in shards.test.ts:25, the `$comment`, and the ADR 0066 shard
    table (around 0066:1312).
- **Gate.** tools/stryker/gate.ts:24-28 requires a score above 85%. In addition, any Survived or NoCoverage mutant
  that is not recorded in tools/stryker/equivalent/packets.json, with a reviewer other than its proposer and a date,
  fails the gate. tools/stryker/unicode.json pins Unicode/ICU-dependent entries, and the matcher's \p{…} classes will
  produce such mutants.

  So mutating the core means killing or getting review for every survivor of the matcher. That depends on people,
  not only on code.
- **Which shards run.** affected.ts:19-21 and :36-38 measure each package whose closure the PR changes, in all of its
  shards. Today any packets change (mismatches.ts) runs all 13 packets shards:
  - packets-scan, packets-roles, packets-roles-cues, packets-roles-numbers
  - packets-words-labels, packets-words-amounts, packets-words-days, packets-words-dates, packets-words-prose
  - packets-verifier (readable.ts, verifier/index.ts, verifier/mismatches.ts)
  - packets-facts, packets-rest, packets-explain

  Under either option, the new or moved files also join packets' closure (affected.ts:25-29 includes the manifest
  and tsconfig of each workspace package a closure file lies in). A later redaction-only PR would then run the
  packets shards too, which it does not today.
- **Data files.** A new packets or fold test that reads fixtures must be listed in DATA_FILES.packets
  (affected.ts:107-120), with a reader. A synth `none(…)` registry entry with no fixture adds nothing.

## Where the differential property test can live
- It must import both the gateway matcher and the verifier. packets cannot import the gateway (the cycle, and the fs
  reader in packets' mutation closure). So it belongs in packages/model-gateway, as redact.property.test.ts:1 already
  does with `identifierForms` from @tp/packets.
- A test there is not in packets' TEST_SETS, so it kills no packets mutant. Packets' own tests, or the new package's
  tests listed in TEST_SETS.packets, must do the killing.
- If both sides share one core, the test proves agreement at the adapter level: positions in readable text, skip spans
  and placeholder syntax. It does not prove two independent implementations agree. 0054:423 already keeps "today's
  redaction frozen as a second oracle" in the gateway's properties.

## ADRs to amend (no new number needed)
- The verifier's identifier rule is docs/adr/0047-*.md:42-47 ("whole-word occurrence … without regard to case"), with
  Alternatives at :121 and tests at :131. That text changes with the fold.
- docs/adr/0054-*.md has the redaction amendments at :274 (co-001/redact-placeholders) and :516 (co-001/redact-ssn-phone).
  Record the shared core and its new home there.
- If the fold is mutated, or deliberately not mutated, amend 0066 Part 4 (around :1299 for the mutate set, around
  :1312 for the shard table).
- Moving code into a package is covered by ADR 0002's rule, so no new ADR is required. A COUNTER REQUEST is needed
  only if the designer wants a standalone decision record.

## Not affected
- Engine freeze: tools/engine-freeze/check.ts:47-63 covers only packages/pricing, golden and frozen releases.
- Typecheck counts, CODEOWNERS (no line), lint groups, lint-logs (SCAN_ROOTS at tools/lint-logs/scan.ts:32 already
  covers packages), Dockerfiles and migrations.
