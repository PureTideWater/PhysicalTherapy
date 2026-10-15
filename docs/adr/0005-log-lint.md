# 0005. Lint log calls statically against an ID-only allowlist, and filter fields again at runtime

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 6 (observability acceptance), 16 (logging discipline), test matrix SEC-07

## Context

Logs must never carry a name, date of birth, member ID, claim number or document text, and a log line with a
nine-digit identifier or a name field must fail the lint. The allowlist lives in
`packages/observability/src/fields.ts` (re-exported from `packages/observability/fields.ts`, the path the
house rules name).

## Decision

`pnpm lint:logs` (`tools/lint-logs`) parses every source file under `apps/`, `packages/`, `tools/` and
`infra/` with the TypeScript compiler and inspects every call on a logger-shaped receiver (`console`, `log`,
`logger`, `*Logger`, including `logger.child(...)` chains) and every `createLogger({ base })`. It fails when:

- a field key is not on the allowlist, or matches a forbidden pattern (name, date of birth, member or
  subscriber, claim or control number, document text, body or content), whatever the allowlist says;
- a field object uses a spread or a computed key, or a field value is an object or array;
- an argument is anything but fixed text or an object literal (no `logger.error(err)`, no interpolated
  template messages);
- any log text or literal field value contains a run of nine or more digits.

The allowlist is seeded with opaque identifier and code fields only (`practice_id`, `job_id`, `error_code` and
the like); a test refuses any allowlisted field that matches a forbidden pattern. At runtime,
`@tp/observability`'s logger keeps only allowlisted keys with primitive values, so a value that reaches it
through a cast is dropped (the canary test logs a synthetic patient record and asserts the output).

Test files (`*.test.*`, `*.spec.*`) are not scanned: the canary test must hand the logger forbidden fields on
purpose, and tests only ever see synthetic data. CLI output from tools goes to `process.stdout.write`, not a
logger.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A custom ESLint rule | Equivalent power; a standalone scanner keeps the gate a separate CI step as the plan lists it, with its own tests |
| Runtime redaction only | A leak would be found in production logs, not in review |
| Scanning tests too, with an inline exemption comment | An exemption marker is a bypass someone will copy into production code |

## Consequences

- Adding a log field is a reviewed edit to `fields.ts`.
- Error objects are never logged; code logs an `error_code` and the IDs involved.
