# Completeness critic: ci-findings-transport (WIP 1322c7cf…)
Clone /home/user/rv-cft-critic (read only; remove after).
## Checked
- (in progress)
## Gaps
- 22:2x: clone at 1322c7cf; base now c7bed0f7 (#117, synth/test-matrix/CI-19); merge-tree with WIP clean (rc 0) but the up-to-date rule needs another base merge.
- Read workflow, index.ts/render.ts diff, workflows.test.ts diff. Over-row exemption, overAlone, FINDINGS rows removed; no other #86 rule loosened in the diff (only `over` code and its tests deleted; refProblems/sites test kept with fixture).
- Upload step pinned exactly (name, path, if-no-files-found, retention 1, overwrite) so name/overwrite/retention mutations are held. MAX_FILE_BYTES env == render.ts, handoff env == notify env, DOWNLOAD string pinned.
- Design §1/§10-§13 read. T-K (≤41 findings) holds structurally: familyDue one item per entry, schema refuses a second entry per family. #96: TRANSPORT_ACTIONS scans mutation.yml pins only; every-upload-overwrites test covers the new upload. No interaction found.
- §7 local proof in designs/.../proof/work still lacks the timeout block (no `timeout` in proposed-*.sh): fix-round to-do from the build summary, not raised by either review.
- Mutations next (C1 handoff predicate weakened, C2 initial truncation removed, C4 head -c MAX, C20 `2>/dev/null || :` dropped from head line, C22 artifact without findings.json).
- Mutations (logs/critic-mutations.log; content-calendar cases, base 12/12): C1 handoff jq gate weakened to `type == "array"`: 12/12 SURVIVES; C2 initial `: > findings.json` removed: survives, harmless (jq on a missing file fails the same); C4 `head -c "$MAX_FILE_BYTES"`: survives (security S1's structural fix kills it); C20 `2>/dev/null || : > findings.json` dropped from the head line: SURVIVES; C23 `sleep 0`: survives (= ci-infra S2); C24 `downloaded=true` dropped: 6 red.
- Scenarios on the real extracted scripts (logs/critic-scen.log): HEAD handoff on `[{"title":"x"}]` exits 1; C1 handoff exits 0 "the notify job reads 1 findings" while notify files "check failing". Artifact with no findings.json: HEAD notify "check failing"; C20 notify exit 1, no issue.
- gh on the runner is 2.103.2 (design R3), reviewers read 2.89.0. Read v2.103.2 source: one -n is not isolated (file lands in -D), zip downloaded to a temp file then extracted, Root.Create(replace=false) opens O_EXCL: ci-infra S1 holds on the runner's gh.
- #86 rule after the merge: only the `over` field, overAlone, the FINDINGS rows/consts and their tests removed; one removed case was the over row counted in ARG_MAX's whole; the whole rule keeps its two var-based cases on the same `strings` total path: not loosened.
- Base moved to c7bed0f7 (#117). Trial merge clean; `pnpm synth --all` on it: 0 written, 708 unchanged (logs/critic-synth-merged.log).
- Docs vs code: workflow header, ADR 0071 Amendment, ADR 0066 N32, ci.md rows, content-updates.md rows match; reconciliation-001:677 (#86's historical entry) still says "recorded over the limit", superseded by :683; no stale 700,000/base64 wording.
- Paths: push run after merge (paths include the workflow), schedule run with `[]` (tested), re-runs (overwrite pinned; every-upload test), handoff skipped on a failed check (implicit success()), empty file (jq -e exit 4 -> check failing).
## Gaps
- G1 (should): handoff's read gate is outside the T-H block; C1 survives; handoff can prove a read notify refuses.
- G2 (nit): head line's `2>/dev/null || : > findings.json` untested; C20 survives; notify would go red with no issue.
- G3 (should): §7 local proof still the pre-timeout block; build summary's "byte-identical" holds only at 872d06ad; PR evidence cites §7.
- G4 (nit): base moved to c7bed0f7 since the reviews; status says 30871f72; merge needed before push (clean, no fixture drift).
- Clone removed.
