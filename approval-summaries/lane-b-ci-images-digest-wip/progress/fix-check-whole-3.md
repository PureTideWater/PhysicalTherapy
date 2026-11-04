# fix-check-whole-3 (whole-diff adversary, check round 3)
Started 2026-11-04. Live heads: wip 5c01f150..., PR #86 83167b8f..., build-platform 4846f043... (moved past 21fa10df...), #96 50029e64...
Clone: /home/user/fx-imgdigest-whole-3 (read only).
## Checked
- Clone made, at 5c01f150...; a5bc1170..5c01f150 is 21 commits (not 41 as the task says), 08:44-09:18 UTC; touches only workflows.test.ts, ADR 0066, ci.md, reconciliation-001.md.
- Read the repair-2 diff of workflows.test.ts whole.
## Found
- Read: unboundedValueProblems file-command walk, matrix include, container regex, called-workflow secrets, toJsonBytes/needsJsonBytes (hand-counted Newtonsoft indented form: per job about id+58..63 bytes against 64; per output name+value+13..14 against name+6b+14: correct, tight), producersOf (row values only take the 4 forms extraction emits, so no empty resolve), fingerprint inheritance, testTitles rewrite, T5 BUILD_EVENTS, T6 wording regex. Docs (ADR N32, ci.md, reconciliation-001) checked against these: agree; "pin rules refuse a reusable workflow" true (check-action-pins/workflows.ts).
- Base trial merge (with 4846f043...) clean, tree 3183f8c1...; #96 trial merge (50029e64...) conflicts in ADR 0066 and reconciliation-001 only (expected, #96 resolves after), tree a951e496...
- At 5c01f150: vitest unit tools/: 82 files, 1283 passed, 3 skipped, exit 0 (98 s). pnpm typecheck: 22 projects passed, exit 0.
- workflows.test.ts alone: head 124 passed, 29.6 s / 30.8 s; b2a41a00 121 passed, 26.9 s / 26.3 s (+3 s, mostly the Dependabot-rewrite test, 18.7 -> 21.0 s; N32 tests 0.14 -> 0.72 s). Two runs each consistent; no flake seen.
- CI_TREE = base trial merge: 123 passed, 1 skipped (the rewrite test, by design under CI_TREE), exit 0.
- CI_TREE = #96 trial merge, head's test file: 1 failed (mutation canary command, #96's own change, not an N32 rule), 122 passed. Merged test file on the merged tree: 124 passed, 2 skipped, exit 0. Every N32 rule passes on #96's workflows.
- No regression found: every replaced assertion (toJSON job/output naming, toJSON byte sum) is replaced by a stricter one with fixtures; no fixture weakened. Container string-with-expression now read as an image argument (bounded at 131,072) instead of refused: removes an over-reach, still bounded.
## Issues
- nit: testTitles' skip detection misses an aliased context skip ({ skip: s } => s(), ctx['skip']()) and a shadowed it (const it = test.skip); the ADR says "no skip through its context". Fix: also refuse destructured renames and element access, or word the ADR as "a call named skip".
- nit (over-reach): the file-command walk refuses GITHUB_ENV/GITHUB_PATH in any string outside a step's run:, a step's name: or if: included, and every run: line naming GITHUB_PATH, a comment or a harmless tool-dir write included. Red, not unsafe; acceptable until a workflow needs one.
- nit (records): a5bc1170..5c01f150 is 21 commits, not 41 as the task text says.
- nit: needsJsonBytes' 64 bytes a job has about 1 byte of margin over the indented form (id+63 with outputs, "cancelled" result); correct today, tight.
## Verdict
No blocking or should. Clone and trial trees removed.
