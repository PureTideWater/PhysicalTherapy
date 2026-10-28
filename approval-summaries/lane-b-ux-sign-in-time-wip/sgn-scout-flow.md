# Scout A (sign-in flow and time limits) progress
Started 2026-10-28. Checkout /home/user/ux-sign-in-time.
## Status
- [ ] pending.ts  - [ ] routes/sign-in.ts  - [ ] auth providers  - [ ] pages+layout  - [ ] http/next.ts  - [ ] infra identity.ts  - [ ] dev repro
## Facts
- pending.ts:6-11 doc: pending sealed, 5 min, 15 for register_key; adapters set HttpOnly, Secure, SameSite=Lax, path /.
- pending.ts:15-17 pendingSeconds: register_key 15*60 else 5*60 (local fn, not exported). pending.ts:23-26 writePending: seal expiry now+seconds AND cookie maxAge=seconds; re-written (fresh 5 min) on every settle 'pending' and invalid_password.
- pending.ts:19-21 readPending: sealer.open returns undefined when expired. Cookie name SIGN_IN_COOKIE from sessions.ts.
- seal.ts:80-87 AES-256-GCM, AAD v1:purpose, body {e: expiresAt ms, p: payload}; open() returns undefined if e<=now (seal.ts:104). So email inside pending is ENCRYPTED+authenticated.
- sign-in.ts(auth):44-50 Pending union: every variant carries email; new_password/mfa_setup/mfa/key carry challenge; mfa_setup has totp {secret,uri}; register_key carries userId+grant(+challenge). NO start/issued time field.
- routes/sign-in.ts:23-35 SIGN_IN_REASONS includes 'step_expired'. :48 StepResult {redirect}|{error,locked?,final?,issues?}. :58-64 STEP_PAGES.
- routes/sign-in.ts:86-132 settle: pending->writePending+redirect STEP_PAGES; refused 'expired' -> clearPending + redirect '/sign-in?reason=step_expired' (:114-116).
- routes/sign-in.ts:134-140 pendingOf: readPending; wrong/missing step -> undefined; RESTART = {redirect:'/sign-in?reason=step_expired'}. Pages :166-176 new-password, :195-205 enroll, :222-232 mfa, :313-323 register-key return RESTART when no pending; else {email[, secret, uri]}.
- routes/sign-in.ts:145-152 signInPage handle returns {reason} only. No email prefill.
- Two expiry detections: (a) pending cookie gone/expired (5 min) -> pendingOf undefined -> RESTART; (b) provider says expired (Cognito stale session, 3 min) -> settle refused expired -> clearPending + step_expired.
- cognito-provider.ts:90-91 STALE = NotAuthorizedException, ExpiredCodeException -> {kind:'expired'}; :89 WRONG_CODE includes ExpiredCodeException, checked first for stage!=password (:176) so on mfa steps ExpiredCodeException = wrong code, NotAuthorizedException = expired.
- cognito-provider.ts:61-67 Challenge {s: Cognito Session, u: USERNAME, email} JSON (inside sealed pending). No timestamp.
- cognito-provider.ts:224 beginTotpSetup replaces s with AssociateSoftwareToken's new Session. :244 VerifySoftwareToken session.
- dev-provider.ts:25-26,47-48 CHALLENGE_MS=3*60_000 ("the user pool's sign-in session"), GRANT_MS=15*60_000. :88-90 challenge sealed with expiry now+3min; :92-95 open -> undefined when expired -> callers return {kind:'expired'} (:134-136,:147-150,:156-160,:171-175,:194-198). Dev provider DOES model expiry. options.now injectable (:43,:84).
- infra/lib/constructs/identity.ts:10-15 TOKEN_LIFETIMES {accessToken 15m, idToken 15m, refreshToken 12h, authSession 3m}; :108 authSessionValidity: TOKEN_LIFETIMES.authSession. :82 tempPasswordValidity 7 days (INVITATION_DAYS :23); doc :41-42 says "three days" (stale comment).
- dev-provider.ts:47-48 also: services.ts:113-118 dev provider built with NO now (real clock) and sealer.derive('dev-provider'); createServices now default new Date (services.ts:183). No clock injection in the dev/e2e server -> e2e cannot fast-forward server time; tests move DB clocks (helpers.ts:7) - pending cookie has no DB row.
- sessions.ts:18-20 cookies tp_session, tp_device, tp_sign_in. next.ts:23 COOKIE_OPTIONS httpOnly, secure, sameSite lax, path /; :30 maxAge from maxAgeSeconds; :33 delete = maxAge 0.
- next.ts:139-148 loadPublicPage: redirect when data has redirect (RESTART). :249-263 runSignInStep: redirect on {redirect}; non-ok outcome -> 'Sign-in could not continue. Start again.' final:true.
- pages: page.tsx:15-31 /sign-in (Field email autoComplete username, no defaultValue; SignInNotice reason); new-password/page.tsx:13-21 shows email as CardTitle; enroll/page.tsx:13-27 email in description + secret; mfa/page.tsx:12-20 email CardTitle. None says a time limit. layout.tsx:9-17 lockup only.
- notice.tsx:14 step_expired: title 'Start again', text 'That sign-in step expired. Start again from your email and password.' Alert role=status.
- hardware-key.tsx:20-24 post(); :92-95 verify redirect -> window.location.assign (RESTART -> /sign-in?reason=step_expired, the PASSWORD page, even for a key user). :146-148 register options redirect.
- ActionForm (action-form.tsx:22-50) keeps typed values in browser; ActionState never carries typed values (next.ts:150-153, ADR 0077).
- Requirements read: lane-b-ux-review.md:1800-1824 UX-012 fix: 'This step stays open for 3 minutes.', warning at 1 min left 'This step closes in 1 minute. Start it again to get more time.' + 'Start again' button -> password step with email filled; constant beside pendingSeconds = shorter; email in sealed HttpOnly cookie outliving step by 15 min, never URL, prefill on /sign-in after expiry. UX-128 :3928-3946 step marker 'Step 1 of 2: choose a password', 'Step 2 of 2: set up two-step verification'. flows-other-18 said 'Step 2 of 3'. flows-other-19 (raw-findings.md:1250) wants a sealed cookie naming account after key registration (reuse).
- #42 OPEN (gh api pulls/42: state open, merged false, head co-001/pr-06b-mail-streams). pr42-files.txt: identity.ts (:97), identity.test.ts (:112), docs/product/test-matrix.md (:86) are #42 files. None of the sign-in app files are. (#74/#79 appended FRM/TBL sections to test-matrix.md anyway: test-matrix.md:320,:338.)
- infra/test/identity.test.ts:109 pins AuthSessionValidity toBe(3). identity.test.ts:12-13 reads docs/product/sessions.md for limits.
- Pattern for mirroring infra in web without importing CDK: primitives.test.ts:65-77 readFileSync infra/lib/constructs/identity.ts and toContain('export const PASSWORD_MIN_LENGTH = 12;'), password.ts:10 mirrors. Use the same for authSession: Duration.minutes(3) (identity.ts:14).
- sessions.md:19,49 only idle/absolute; nothing on sign-in step lengths.
## Status: code read done; dev repro done; report written
- Expiry tests exist: dev-provider.test.ts:82-90 (3 min, advance(181) -> expired); cognito-provider.test.ts:83-93 (NotAuthorizedException 'Invalid session for the user, session is expired.' -> expired); sign-in.db.test.ts:138-152 (flow refused expired after clock+10min).
- invited->active only when a session opens: tenancy_hardening.sql:482-494 record_sign_in_with_mfa. So after new password saved but enrol expired, user still 'invited' in DB but Cognito/dev asks MFA_SETUP (dev-provider.ts:142-144 saves password before secondFactor). Restart then uses the NEW password; the path shrinks to enrol only.
- invalid_password (routes :106-108) rewrites pending cookie (fresh 5 min) without a new provider challenge (cognito-provider.ts:201-204 checks policy locally): cookie clock and challenge clock diverge -> deadline must come from a stamp in Pending, not the cookie write.
- mfa_setup: settle calls beginTotpSetup (routes :93-99) -> Cognito AssociateSoftwareToken new Session (cognito-provider.ts:222-224) / dev new 3-min challenge (dev-provider.ts:153): enrol window starts at that call.
- Wrong code (refused credentials, routes :123-124) does NOT rewrite pending: windows keep running.
- register_key: grant = access token 15 min from TOTP success (identity.ts:11; dev GRANT_MS); register options rewrites pending with fresh 15 min cookie (routes :346) keeping {...pending} -> cookie can outlive grant.
- Next: page renders cannot set cookies (only actions/handlers); page routes only read (pendingOf). CookieJar.set has only maxAgeSeconds (route.ts:34-38); path fixed '/' in next.ts:23 and handler.ts setCookieHeader :44.
- totp.ts:12-13,26-28 otpauth label = email, issuer TOTP_ISSUER: a restarted enrolment issues a NEW secret under the same label -> authenticator may hold a stale duplicate entry.
- Internal (hardware_key_required) invited path: /sign-in(temp pw) -> new-password -> enroll -> register-key (sign-in.ts:146-149) -> /sign-in/hardware-key?reason=key_registered (routes :109-111) -> key sign-in.
- dev repro: scratch spec at scratchpad/sgn-repro (config imports base, testDir scratch); E2E_DATABASE=tp_e2e_sgnscout E2E_PORT=4781; not started yet
- repro run 1 failed: config loaded as CJS (import.meta); added sgn-repro/package.json type module; run 2 started 2026-10-28T03:19:32Z (bg task bvbn868it, log sgn-repro/run.log)
- run 2 failed at test load (CJS named export); switched to index.mjs; run 3 started 2026-10-28T03:22:11Z
- report draft written to /home/user/ops/designs/lane-b-ux-sign-in-time/scout-flow.md (REPRO_RESULTS placeholder in 1.2); run 3 in progress (bg bz0c7y4x7)
- run 3: tests started 03:23Z. A cookie at mfa: httpOnly secure Lax path / 300s left, value 355 chars (dev)
- A done: 185s reload still renders mfa; press -> /sign-in?reason=step_expired, notice 'Start again / That sign-in step expired...', email '', no email in URL, pending cookie cleared. C1 new-password at 185s -> step_expired, email ''.
- B done: cookie gone at 305s; reload -> /sign-in?reason=step_expired, email ''.
- run 3 PASSED 3/3; C3 enrol 185s -> step_expired; C4 temp pw refused 'Not done / That did not match'; C5 chosen pw -> /sign-in/enroll, new secret. CLEANUP done: DB dropped, /tmp dirs removed. .next left (gitignored). Next: fill REPRO_RESULTS in report.
## STATUS: COMPLETE (report /home/user/ops/designs/lane-b-ux-sign-in-time/scout-flow.md)
