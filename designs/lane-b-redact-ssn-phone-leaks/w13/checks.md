Run once in the build's container on the merged tree (the base 91bc6b7c merged in; 052ff9e5), output kept in files; the
two steps that failed there were fixed in d06e772d and run again on it, as the rows say. The base moved once more while
the suite ran (#145, the migration runner, no file of this change): it is merged at 7bb7e7ac, where typecheck, lint, the
log, copy, fixture and content checks, the generators (the tree stays clean), the redaction tests, the worker's bundle
test and the runner's unit test pass. CI on this page is the suite of record.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 24 projects |
| `pnpm lint` | passed, 1,934 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | passed, 1,200 files scanned |
| `pnpm lint:copy` | passed, 605 files read |
| `pnpm check:fixtures` | passed, 393 files read by the guard |
| `pnpm verify-content` | passed, every content set |
| `pnpm synth --all` | 338 cases, 0 files written, 790 unchanged; the tree stays clean |
| `tools/screening-capacity/watched.ts --write` | on 052ff9e5 it added `packages/redact/src/confusables.ts`; committed in d06e772d, clean on it |
| `pnpm test` (unit and property) | on 052ff9e5: 14,203 passed, 4 skipped, 1 failed: the worker's test that pins the modules the packets verifier's server entry bundles from `@tp/redact` did not list the look-alike table. Fixed in d06e772d (the list names it; the browser's packet check still bundles nothing of `packages/redact`): the worker's tests pass on it |
| `pnpm test:golden` | passed, 381 tests |
| `pnpm test:oracle` | passed: pyx12 4.0.0 agrees with all 738 synthetic 835 fixtures |
| `pnpm --filter @tp/model-gateway eval` | gate passed |
| `pnpm test:db`, four shards on PostgreSQL 18 | passed: 3,352 (1 skipped), 2,843, 2,938 and 1,089 tests |
| `tools/stryker/affected.ts` | packets affected (the matcher's package is in its closure); the `mutation` check runs its shards |
| `tools/engine-freeze/check.ts` | no problems |
| `pnpm build`, `pnpm test:e2e` | on 052ff9e5 the end-to-end server refused to start on a tree the regenerated watched list had left uncommitted; on d06e772d: build passed, 87 of 87 passed |
| The redaction files under eight fixed seeds (`redact.property.test.ts`, `redact.leaks.test.ts`) | 734 passed under each, on the tree before the base merge |
| The differential gate, 975,489 synthetic letters, against ef3e8d20 and against cc3dd7f6, on the merged tree | no letter in which the older tree redacted or refused an identifier and this one sends it; slowest letter 1,137 ms (budget 3,000 ms) |
| The reviews' fuzzers with fresh seeds, on the last change to what is sent | no letter ef3e8d20 refuses sent but the month-named patient's (ruling B); none showing what ef3e8d20's redaction replaced |
