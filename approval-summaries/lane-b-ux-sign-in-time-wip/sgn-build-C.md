# sgn-build-C progress

- started; reading design
- design read; slices A (sgn-api.md) and B (step-timer.tsx, arrival-focus.tsx) already present and match design 2.2/2.4/2.6
- written: step-heading.tsx, notice.tsx, page.tsx, hardware-key/page.tsx, mfa, enroll, new-password, register-key pages
- next: notice.test.tsx, then prettier/eslint/tsc/vitest
- notice.test.tsx written (7 tests: notice words both surfaces, arrival focus wrap, no address; StepHeading marker)
- vitest notice.test + client-boundary + type-scale + step-timer.test: 4 files, 20 tests pass
- eslint on 9 files: exit 0; tsc -p apps/web --noEmit: exit 0 (A and B present); lint:copy: pass
- prettier --check warns on every file incl. untouched ones (no prettier config in repo; not the formatter) - ignored
- DONE (slice C complete)
