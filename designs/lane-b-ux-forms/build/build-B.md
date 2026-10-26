# Build B progress (slice B: sign-in and the server's words)

Worktree /home/user/ux-forms. Design read in full. None of slice B's files is in pr42-files.txt (checked).

## Assumed slice-A API
- `import { PasswordField } from '<rel>/components/password-field'`:
  `PasswordField(props: { label: string; name: string; showName: string; hint?: string; error?: string; errorName?: string; issueFor?: readonly string[]; id?: string } & Omit<ComponentProps<'input'>, 'type'>)`
  Used props: label, name, showName, autoComplete, required, minLength, hint.
- `Field` (existing export; props used exist today): label, name, hint, inputMode, autoComplete, maxLength, required. Slice A's Field must write data-secret for autoComplete="one-time-code".

## Files DONE (all edits written)
- apps/web/src/lib/routes/schemas.ts (sixDigitCode, requiredText words)
- apps/web/src/lib/copy/words.ts (+listed), words.test.ts
- apps/web/src/lib/routes/sign-in.ts (StepResult issues, settle credentials option, WRONG_CODE, passwordIssue, fill this in, mismatch)
- apps/web/src/lib/auth/cognito-provider.ts (problems: []), cognito-provider.test.ts
- apps/web/src/lib/routes/billing.ts (routing/account/card msgs; digits param renamed message)
- apps/web/src/lib/routes/onboarding.ts, compliance.ts, console-onboarding.ts (10.3)
- apps/web/src/lib/routes/support.ts (componentList undefined/null -> [])
- apps/worker/src/billing/account.ts (10.3)
- app/sign-in/page.tsx, mfa, enroll, new-password pages
- tests: sign-in-routes.db.test.ts (FRM-07 cases), onboarding-routes.db.test.ts (openIncident no component case)

## Test runs (all with PATH=/opt/node24/bin, under flock /tmp/laneb-heavy.lock)
- vitest unit: words.test.ts, cognito-provider.test.ts: 18 passed
- vitest --project db (DATABASE_URL=postgres://postgres:test@localhost:5433/postgres, from repo root): sign-in-routes + onboarding-routes: 25 passed (after fixing the weak sample to 'weakpassword': a hyphen is a symbol)
- db: billing-routes + route-tests/* (generated security program): 14 files, 6877 passed
- db: apps/worker billing.db.test.ts (#42, read only) + lib/auth/sign-in.db.test.ts: 23 passed
- @tp/worker typecheck: clean
- @tp/web tsc: 8 errors, only the expected missing slice-A exports (2 in slice B: password-field import in sign-in/page.tsx and new-password/page.tsx; others are slice C/D's)
- eslint --max-warnings=0 on the 18 slice-B files: clean; pnpm lint:copy: clean
## STATUS: slice B complete
