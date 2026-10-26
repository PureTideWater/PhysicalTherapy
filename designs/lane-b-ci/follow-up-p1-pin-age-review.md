# Review of P1 (`co-001/ci-pin-age`): action pins and image digests held to the three-day floor

Reviewer: adversarial pass, 2026-10-26 ~02:00 UTC. Design: `follow-ups/p1-design.md` (267 lines). Sources: build branch
6ddd587, `co-001/ci-deps` at 19e3d98e (`/home/user/ci-deps`), `lane-b-ci.md` §3.2.1, §3.2.6, §3.2.7 and §3.3, and
`follow-ups/p2-design.md`. Every measurement below was repeated here, in
`scratchpad/p1rev/` (probe script `p1rev/sig.sh`, keys in `p1rev/key/`, downloads in `p1rev/dl/`).

**Counts: 1 blocking, 10 should fix, 8 nits.**

## What survived checking
- The cites into ci-deps at 19e3d98e: `ci.yml:84-87` (the "Action pins" step), `base.ts:31-49` (`baseState`),
  `base.ts:60-67` (`selectPins`), `network.ts:54-68` (`withRetries`), `check.ts:71-87` (the verify loop),
  `check-toolchain/check.ts:40-48` (`FILES`), `:243` (`dockerfileRule`) and `:288-345` (`releaseAgeExcludeRule`), ADR
  0066 Part 4 at `:626`, `dependency-upgrades.md:162` and `:204`, and `controls.ts:252`.
- dependabot-core 7c06280: `git_cooldown_date_resolver.rb:15` and `:45-54` (published_at, then tag creation, then
  commit date), and `latest_version_finder.rb:376-377` (no date means not in cooldown). Dependabot's docs, current
  path `content/code-security/reference/supply-chain-security/dependabot-options-reference.md:196`: the default
  cooldown "does not apply to security updates".
- All 12 pinned tag commits (13 refs; cache/restore and cache/save share one commit) have committer `GitHub` and a
  `VALIDSIG` from `968479A1AFF927E37D1A566BB5690EEEBB952194`. Each tag names the pinned SHA. login v4.7.0's commit
  `81c6f93d` is dated 2026-10-23T15:11:41Z. The tagger dates are right: pnpm/action-setup's is 7.7 h after its
  commit and trivy-action's 9 min after.
- Hub: `node:24-trixie-slim` → `43b9ba11…`, `tag_last_pushed` 2026-10-21T17:39:11Z. `postgres:18-trixie` →
  `edb0c08d…`, 2026-10-21T19:08:32Z.
- `GITHUB_TOKEN`'s limit is 1,000 requests an hour per repository (github/docs
  `data/reusables/rest-api/primary-rate-limit-github-token-in-actions.md`). `verified_at` is in the REST
  `verification` schema as a required, nullable field (rest-api-description `components.schemas.verification`).
- `gpgv` exists on CI. ubuntu-26.04's apt 3.2.0 has `Depends: … gpgv` (archive.ubuntu.com
  `dists/resolute/main/binary-amd64/Packages`), and runner-images `toolset-2604.json:130` installs `gnupg2`.
- #42: P1 overlaps it only in `test-matrix.md`, `reconciliation-001.md` and `packages/synth/src/cases/{matrix,registry}.ts`
  (`pr42-files.txt:85, 86, 136, 137`). Those are rule-6 documents, as the design says.
- Fail-closed paths: a missing `gpgv`, three failed reads, a non-Hub registry, an unprovable age and a superseded
  digest each fail closed. Bootstrapping is safe because a `pull_request` run checks out the merge ref, so the merge
  base is the base's tip, which already holds `age.ts` once P1 merges.

## B: blocking

### B1. The base's Dockerfiles are never read, so every pull request ages both Dockerfile digests and turns red when Hub moves `node`
- **Evidence.** §3.2 says the image rule reads "every `FROM` of both Dockerfiles (already in its tree, `check.ts:51`)",
  and that `FILES` "gains the compose file and `image-age-exceptions.json`, which `tree.ts` reads at head and base
  alike". The base, however, is read by `readTreeAt` (`tools/check-toolchain/tree.ts:51-57`), and that reads only
  `FILES`. Only `readWorkingTree` (`:44-47`) adds `dockerfiles`, so `Tree.dockerfiles` is always undefined for the
  base. The age set is "digests the base names nowhere", so the `node:24-trixie-slim@sha256:43b9…` digest in
  `apps/{web,worker}/Dockerfile` counts as new on **every** pull request. Every pull request then reads Hub for it.
- **Why that turns every lane red.** Once Hub's tag names a newer digest, the design fails closed ("superseded … the
  check fails closed", §2.2). docker-library moves a build's aliases together. Today `43b9…` is on only
  `lts-trixie-slim` and `krypton-trixie-slim` among the first 100 of node's 9,233 tags, and page 1 covers about 9 hours
  of pushes, so the 5-page search will not find it. The `library/node` manifest changed on 9 days between 2026-08-27
  and 2026-10-21, and `library/debian` changed 3 times (`git log -- library/node library/debian` on a blobless
  clone of docker-library/official-images). Each change rebuilds the slim variants. So roughly once a week, every open
  pull request in both lanes goes red at once, Lane A's #42 included. They stay red until someone bumps the digest
  and that bump is itself three days old. Hub's 429 (B1 and S8) or an outage has the same effect.
- **Fix.** `readTreeAt` reads the base's Dockerfiles: `git ls-tree --name-only <base> apps/`, then
  `apps/<name>/Dockerfile` for each entry, mirroring `dockerfilePaths`. `images.ts` takes the base set from the
  base's Dockerfiles and compose file. Say both in §3.2 and in §4 (`tree.ts` changes). Add a ★ test: a base and head
  whose Dockerfiles hold the same digest, with a recorded Hub that would answer "superseded", makes zero Hub reads and
  passes. Add a second test: changing one Dockerfile's digest reads only that digest.

## S: should fix

### S1. Commit age is not release age; the residual is the patient attacker, and the design overclaims
- **Evidence.** §1 promises "three days old by a clock its publisher cannot set", and §2.1 says "The moved-tag attack
  this closes". What is measured is the commit's age (C4), and the floor exists for the time since a release became
  visible. A hijacker can make the commit in a fork or on an unreferenced branch, wait three days, then move the tag.
  The web-flow signature is then old. `verified_at` is old too, and the verification record "is persistent across
  the repository network … pushed again to the same repository or to any of its forks, the existing verification
  record is reused" (github/docs `about-commit-signature-verification.md:68`). A moved tag keeps `published_at`. P1
  passes all of it. This was the tj-actions shape: the tag was moved to a commit that no branch held.
- **Fix.**
  1. State the residual in §1, §12 and ADR Part 5: P1 bounds commit age, not tag age.
  2. Add the immutable-release signal (S2).
  3. Add an impostor-commit rule on pull requests, failing closed. The pinned SHA must be reachable from a branch of
     the upstream repository itself: `GET /repos/{o}/{r}/compare/{default_branch}...{sha}` with status `behind` or
     `identical`, one call, CI only. This is zizmor's `impostor-commit` audit, and it makes the attacker publish the
     commit somewhere watched.
  4. Optionally, on CI only, take the Events API's `CreateEvent` or `PushEvent` for that tag as one more youngest-of
     signal. Its absence tells nothing, and it holds 30 days (N1).

### S2. Immutable releases are ignored, though they give exactly the clock the floor needs
- **Evidence.** The REST `release` schema has `immutable: boolean`. For an immutable release, "its associated Git tag
  is locked to a specific commit, cannot be changed, and cannot be deleted" (github/docs
  `content/code-security/concepts/supply-chain-security/immutable-releases.md:22`). That release's `published_at`
  is therefore GitHub's time for the tag-to-commit binding, which is the time the floor is about. The design files
  `published_at` under "in the max only … never proves it old" and gives "GitHub … enforces immutable releases" as a
  future revisit trigger (§6). The feature exists today, and its release attestation (`:27`) is signed.
- **Fix.** Read `immutable` with `published_at` in the same call. When it is true, count `published_at` as a
  GitHub-recorded signal, still inside the youngest-of rule, and print it. P1's CI run records which of the 12 pins are
  immutable. Rewrite ADR Part 5's revisit trigger as "require immutable releases for new actions once most pinned
  publishers use them". Add a test: an immutable release published 1 day ago on a 30-day-old commit fails.

### S3. `verified_at` is set late for older commits, so an honest old release reads as new, and no exclude fits
- **Evidence.** "For any commits that predate this feature, a persistent record will be created the next time the
  commit's signature is verified" (`about-commit-signature-verification.md:54`). That is a documented fact, not R2's
  "may". P1's own API read can create the record, so `verified_at` comes back as now. Under youngest-of, a new pin to
  an action release older than persistent verification (November 2024) then fails as "0 days old". Neither exclude
  kind can pass it: `age-unprovable` "is refused when the pin's age is in fact known", and `security-fix` needs an
  advisory. None of today's 12 commits is affected, since all are from 2026.
- **Fix.** Restate R2 as fact with the cite. In §9, name the remedy: re-run after three days. Make the message say so
  when `verified_at` is the youngest signal and is more than three days later than every other signal. Add a test.
  This keeps the safer reading, so the ruling stands.

### S4. The signature time is asserted to be GitHub's clock without evidence, and §8's fallback drops the one clock that is
- **Evidence.** In all 12 commits, the signature's creation time equals the committer timestamp to the second
  (`p1rev/sig.sh`: diff 0 s, 12 of 12). GitHub's signer stamps the commit's own committer time. Both the Contents API
  (`PUT /repos/{o}/{r}/contents/{path}`) and `POST /repos/{o}/{r}/git/commits` accept `committer.date`
  (rest-api-description). The docs say only that bot signing is refused with "custom committer information"
  (`about-commit-signature-verification.md:150`), and they are silent on user tokens. §2.1's claim that a publisher
  can "never move GitHub's signature time" is therefore an assumption. §8 then says that if `verified_at` is absent,
  "B1 drops it, and web-flow signatures … stand", which would leave that assumption alone as the gate on CI.
- **Fix.** Cite `:150` and record the assumption in ADR Part 5. On CI, require `verified_at` for every new signed
  pin. A null or missing `verified_at` on a signed commit fails closed ("age unprovable") instead of being dropped.
  The web-flow signature alone stays a local, advisory reading. Add a test: CI mode, a valid web-flow signature and
  `verified_at: null` fails.

### S5. Age is measured on the tag's current commit, not on the pinned SHA
- **Evidence.** In §3.1, `age.ts` will "fetch the tag … read the commit". If the tag moves between the verify
  loop's `ls-remote` and the fetch, or between a pull request's run and its push run, the check measures the wrong
  commit. It then prints a misleading verdict, or passes a pin on another commit's age.
- **Fix.** Fetch the pinned SHA by itself: `git fetch --depth=1 --filter=tree:0 <url> <sha>`, which GitHub serves.
  Fetch the tag ref separately for any tag object. Assert that `refs/tags/<v>^{commit}` equals the pin, and otherwise
  report "tag moved" with both SHAs. The commit's signals are read from the SHA, and the tagger date counts only when
  the tag still names it. Add a test.

### S6. Push runs age new pins and digests, so an outage, a 429 or a superseded digest turns the build branch red
- **Evidence.** §3.1: "push runs age only the refs new against the previous head, which a green pull request
  already passed". The images rule inherits the same behaviour. ci-deps' own rule is that push re-reads only warn
  (`check-action-pins/check.ts:90-103`, and "A push run follows a green pull request, so it warns" at
  `check-toolchain/check.ts:53-54`), and P2's C5 relies on that (`p2-design.md:268-269`). A Dependabot docker pull
  request that waits a few days before merging will usually be superseded by the time its push run reads it (B1's
  cadence).
- **Fix.** On `push`, age findings are `::warning::`s. A pull request is the gate, and the ruleset requires up-to-date
  green checks. Say so in §3.1, §3.2 and CI-21/CI-22, and test it.

### S7. The pre-2024 web-flow key is missing, and the key-rotation warning would fire on every push
- **Evidence.** GitHub signed web commits until 2024-01-16 with `5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23`
  (rsa2048, created 2017-08-16, expired 2024-01-16; keyserver.ubuntu.com). The design commits only `968479A1…`. Any new
  pin to a release made before 2024-01-16 is therefore unprovable locally and relies on `verified_at` on CI, which S3
  shows is usually set late for such commits. Separately, if github.com/web-flow.gpg serves both keys, a byte
  comparison with a one-key file warns on every push run. This could not be read here (HTTP 403).
- **Fix.** Commit both public keys. Accept the old key only for signatures dated before 2024-01-16: gpgv reports
  `EXPKEYSIG` alongside `VALIDSIG`, and both are accepted under that date rule. Compare the files with
  web-flow.gpg by fingerprint set, not by bytes. Add a test: an old-key signature dated 2023 counts, and one dated
  2025 does not.

### S8. A rate limit fails closed after a 3-second retry, while Hub's window is 60 seconds
- **Evidence.** Hub answers with `x-ratelimit-limit: 180` and an `x-ratelimit-reset` 60 s ahead (headers measured
  2026-10-26T02:00Z). `registry.ts:57-81` retries a 429 after 1 s and then 2 s, and `network.ts:35` after 2 s and
  then 5 s. GitHub's secondary limits send `Retry-After`. GitHub-hosted runners share egress addresses, so a 429
  fails a pull request although nothing is wrong with it. B1 multiplies how often that happens.
- **Fix.** On 429, or on 403 with `Retry-After` or `x-ratelimit-remaining: 0`, wait for the reset (capped at 60 s)
  and then retry. It still fails closed after that. Test it with the recorded transport.

### S9. The tests need gpg and gpg-agent, one ★ case cannot fail first, and key cases are missing
- **Evidence.** §5 generates an ed25519 key in `beforeAll` and signs commits with it. That needs `gpg` with a running
  `gpg-agent` in the unit job, and the agent outlives `rmSync` of its home unless killed with
  `gpgconf --homedir … --kill all`. It also contradicts "made-up … SHAs", since signed commits have real ones. The ★
  case "a pin present in the base with a 1-day commit makes no read and passes" already passes against the
  unchanged checker, because no age rule means no read, so it is not red first.
- **Fix.** Commit synthetic fixtures made once by a script, with the private key discarded and only public material
  kept: a test public key and signed commit and tag objects. Tests then need only `gpgv` and an injected `now`.
  Unmark that case, or assert the age loop's own note. Add the cases from B1, S2, S4, S5, S6, S7 and S8.

### S10. The `age-unprovable` exclude has no defined window
- **Evidence.** Acceptance 4 and §3.3 bound expiry by "time + 3 days", but an unprovable pin has no time.
- **Fix.** For `age-unprovable`: added ≤ now and expiry ≤ added + 7 days, with no lower bound. A reason is required,
  and `advisory` is null. Test both bounds.

## N: nits
- **N1.** §2.1: the Events API keeps 30 days, not 90 (github/docs `content/rest/activity/events.md:38`: "Only events
  created within the past 30 days").
- **N2.** §4: `tools/test/collection.test.ts` needs no edit. `testsIn('tools/check-action-pins')` and
  `testsIn('tools/check-toolchain')` already collect new test files (`collection.test.ts:20-26, 41-42`).
- **N3.** Acceptance 1 hard-codes 4,320 minutes. Read `minimumReleaseAge` as check-toolchain's `minutes` does, so
  the three floors cannot drift. P2's C7 already assumes a shared floor (`p2-design.md:272-273`).
- **N4.** §11 says P2 should hold Trivy "through P1's `exclude-window.ts`", but P2 gives Trivy no exclude
  (`p2-design.md:232-233`). Align the sentence: P2 imports the floor, not the window.
- **N5.** §10 C3 justifies `gpgv` by apt's dependency on 24.04, but `static` moves to ubuntu-26.04 with ci-browser.
  Cite resolute's apt 3.2.0 `Depends: gpgv` and runner-images `toolset-2604.json:130`.
- **N6.** §2.2: the 5-page tag search will rarely help (B1's measurement). Specify `ordering=last_updated`, and say
  that the expected outcome for a superseded digest is the fail-closed message naming the current digest and when it
  turns three days old.
- **N7.** §2.3: a depth-1 fetch of an annotated tag transfers two objects (tag and commit), not one.
- **N8.** §1 says "a person records a dated exclude", but nothing enforces that a person wrote it. Until runbook 3i,
  merges need only green checks (CLAUDE.md "Merging"). This is the same as F2 (b) for npm, so name it in §12 as
  inherited rather than leave it implied.
