# Review: P1 re-read at ecebdc90 (`follow-up-p1-pin-age.md` §14 and the "(14)" edits)

Reviewed on 2026-10-28 between 00:35Z and 00:56Z, as a security and supply-chain reviewer and a CI-infrastructure
reviewer, against `/home/user/ci-pin-age` at ecebdc90 (clean), the network (read only) and GitHub's docs. The design was
read whole (916 lines). Cites are `file:line` at ecebdc90 unless marked; design cites are `design:line`.

What was run or read for this review:
- Scoped unit run under the lock, `pnpm exec vitest run --project unit tools/check-action-pins tools/check-toolchain
  tools/test`: 29 files, 358 tests passed (started 00:44:08Z). This matches §14's baseline.
- Docker Hub `/v2/repositories/<ns>/<repo>/tags/<tag>` for the three pinned images (00:42:08Z). All three tags still name
  their pins, the values equal 14.3, and `x-ratelimit-reset` is 60 s ahead (1793148188 = 00:43:08Z).
- github/docs 3869faed and github/rest-api-description 83a2153c, as blobless sparse clones (00:43Z).
- `refs/pull/42/head` (6f23c42b) and `claude/build-platform` (0dd1ba7e), fetched into a scratch bare clone (00:44:25Z).
- The GitHub MCP read tools on this repository (00:47Z to 00:52Z): job 122502076872 (static, ecebdc90 push), its log,
  and unit job 122550688445 (0dd1ba7e).
- Blobless fetches of setup-node 949feb24, trivy-action ed142fd0, and the default branches of setup-trivy and
  actions/cache (00:46Z to 00:49:48Z).
- A gpg experiment with an expired key. It could not run: gpg-agent refused a home whose socket path is 125 bytes long
  (N10).

api.github.com still answers 403 from here.

**Verdict: not ready to build as written.** There is one blocking finding, B1: a reasoned exclude can pass a demonstrably
young pin or digest. There are 12 should-fix findings and 17 nits. Most of §14 holds. Its cites, counts, Hub
measurements, #42 overlap and 0dd1ba7e line shifts all check out ("Checked and holds", at the end). The weak spots are
four:
- what an exclude waives;
- the residual's wording;
- image references the rule does not read;
- how the existing tests survive the new loops.

## Blocking

### B1. A reasoned exclude passes a pin or digest that a signal shows is young, with no advisory

**Evidence.**
- Acceptance 5 says "A live, exact, dated exclude passes the pin or digest" (design:42).
- §3.1 says `age-unprovable` "is refused when the pin's age is in fact known", and that "neither can stand in for a young
  pin's advisory" (design:158-159).
- On CI, "known" means a GitHub-recorded signal exists: a non-null `verified_at`, or an immutable release's
  `published_at` (design:67-69, acceptance 6 at design:45).
- An **unsigned** commit has `verification.verified_at` null. The REST schema `verification` has `verified_at` required
  and nullable (`api.github.com.2026-03-10.json`, 83a2153c; `reason` values include `unsigned`). Most actions' releases
  are also mutable.
- So for any unsigned release commit, the age is "not known", the only remedy offered is an `age-unprovable` exclude,
  and that exclude passes the pin.
- It passes even when the commit was made an hour ago and its mutable release was published an hour ago. That
  `published_at` is a GitHub-recorded time that proves the pin **young**, even though it cannot prove a pin old
  (design:71-73).
- The same applies to `off-default-branch`. Nothing says the floor still applies to a pin it covers. The ★ case "an
  `off-default-branch` exclude passes it" (design:230) does not fix the pin's age.
- For images, the design never says whether a Hub digest "found on no tag" (design:100-101) may take `age-unprovable`.
  If it may, a digest a namespace owner pushed and then untagged enters on a reason alone.

This is the "exclude that stands in for a young pin without an advisory" the floor exists to prevent. It also covers the
whole class of unsigned-release actions, which is not a corner case.

**Fix (in P1's scope; B1 and B2 own the files).**
- Each reasoned kind waives exactly one requirement, and the floor still holds over every signal read.
  - `age-unprovable` lifts only "a GitHub-recorded signal must exist". The youngest of every signal read (committer,
    tagger, signature, a mutable release's `published_at`, and S1's default-branch arrival when read) must still be at
    or over the floor.
  - `off-default-branch` lifts only the ancestry rule. The full age rule, with its GitHub-recorded signal, still
    applies.
  - An image `age-unprovable` applies only to a registry other than Docker Hub. A Hub digest found on no tag stays a
    failure that no exclude kind clears, except `security-fix`.
- Restate acceptance 5 as "passes the condition its kind names", and CI-23's assertion as "... and still at least three
  days old by every time read".
- Add to `age.test.ts`, each red first, with one count added:
  - an `age-unprovable` exclude on an unsigned pin whose committer date or mutable `published_at` is 1 day old still
    fails;
  - an `off-default-branch` exclude on a pin 1 day old still fails.
- Add to `images.test.ts`: an `age-unprovable` entry on a Hub digest found on no tag is refused.
- Counts: +2 in `age.test.ts` and +1 in `images.test.ts`, so 57 new tests, not 54 (see N17).

## Should fix

### S1. The residual is misstated: the default-branch rule proves ancestry now, not three days in the watched history

**Evidence.**
- §1 says "The default-branch rule ... makes the commit sit in the watched history for the whole three days, which is
  what the floor buys" (design:27-28). §2.1 says the rule closes "a tag moved to an old commit outside the default
  branch, including one made in a fork" (design:82-85).
- The rule runs `merge-base --is-ancestor` at read time (design:129-130), which proves ancestry now and nothing more.
- GitHub reuses a verification record across the network: "if the same commit is pushed again to the same repository
  or to any of its forks, the existing verification record is reused" (`about-commit-signature-verification.md:68`,
  github/docs 3869faed).
- So an attacker with push rights upstream (needed anyway to move a tag) can push a signed commit to a fork, or to a
  branch they then delete, three days ahead. They then fast-forward the default branch to it and move the tag in the
  same minute.
- Every signal P1 reads is then three days old: `verified_at`, the commit date, and the signature. Nobody watched that
  commit on the default branch for even a minute.
- This is R7's attacker, but cheaper than R7 says: no wait in the default branch's public history is needed.

**Fix.**
1. Reword §1, §2.1 "What the rule closes", R7, and the ADR Part 5 residual: "the commit is on the default branch when
   read; when it arrived there is not proven".
2. Retarget E12 to the arrival on the default branch. The activity schema documents `ref` as "formatted as
   `refs/heads/<branch name>`" and `activity_type` as branch types only (`components.schemas.activity`, 83a2153c), so
   the tag query E12 makes (design:835) is unlikely to answer.
   - On CI, read `GET /repos/{o}/{r}/activity?ref=refs/heads/<default>` (pages back to the floor).
   - The arrival is the first entry whose `after` has the pin as an ancestor and whose `before` does not. The blobless
     fetch already holds the graph for both checks.
   - Print it as a note on P1's run (§14.3's expected output), so P21 can decide whether it becomes a youngest-of signal.
3. It is only ever younger, so taking it later can only make the rule stricter.

### S2. E12's read can fail P1's own pull request, and its failure handling is not specified

**Evidence.**
- E12 says the note is "never a finding" (design:835-836).
- But every read "takes three tries and fails closed, naming the host" (design:141).
- `withRetries` throws a `NetworkError` after three refusals (`network.ts:144-173`). A 403 the endpoint gives for another
  owner's repository, or a 422 for a tag `ref` (S1), is not specified as an answer.
- The 60 s rate-limit waits would also spend the shared 180 s deadline (E3).
- Whether the token can read `/activity` of another owner's repository is not verified (403 here). The docs' `x-github`
  block gives `enabledForGitHubApps: true` and no more.
- P1's own run is the live proof, and the integrator stops on red (§8). A note that turns red stalls the pull request.

**Fix.**
- The activity read is best-effort: one try with no rate-limit wait, outside the deadline's critical path.
- Any non-200 answer, a parse failure or a timeout becomes a note ("activity: not read, HTTP n"), never an error.
- Test case: a 403, then a 422, each yields a note with `errors: []` (inside the existing E12 `it`).

### S3. The existing check-action-pins `check.test.ts` cases break under the new loops; the design has no plan for them

**Evidence.**
- The fixture `repository()` writes only `tools/check-action-pins/index.ts` at the base (`check.test.ts:64`). Under
  P1's bootstrapping ("the merge base has no `age.ts`", design:147), every existing networked case ages every pin.
- These assertions turn red:
  - `expect(transport.reads).toEqual([])` (`:82`);
  - the exact `reads` lists (`:90`, `:95`);
  - `toHaveLength(2)` on `ls-remote` reads (`:106`, `:112`), if the `--symref HEAD` read goes through `lsRemote`;
  - `errors: []` wherever the recorded transport cannot answer `fetchRefs`, `object` or `isAncestor`. Then the read
    fails closed, or an unsigned synthetic commit is "age unprovable".
- The cases at `:129`, `:144`, `:173` and `:197` have the same exposure.
- §14.5 lists `check.test.ts +2` and calls the file "changed" (design:721), but never says how the existing cases keep
  their meaning. Commit 5 is meant to go green, and as specified it goes red.

**Fix.**
- `repository()` gains `baseAge` (default true), which writes `tools/check-action-pins/age.ts` at the base. Only the
  bootstrapping case sets it false.
- `git ls-remote --symref <url> HEAD` runs inside `fetchRefs`, not through `lsRemote`, so the existing `ls-remote`
  filters keep counting tag reads.
- The age loop takes `now`, `floor`, `ci` and `token` through `CheckOptions`. Defaults: local mode, `now` from the
  option, which already exists (`check.ts:41`).
- State that every existing assertion of `check.test.ts` stays as it is, apart from one: the new note
  "age: no pin new against the base, nothing read". This is the E13 principle applied to B1, and the review pass can
  check it.
- check-toolchain needs the same care:
  - the networked rule-list assertion at `check.test.ts:160` gains the image rule;
  - `fakeRegistry` (`:51`) must implement the new Hub methods, or typecheck fails;
  - neither is in §14.5.

### S4. P1's own merge push, and P2's, re-verify every pin with errors: an outage or a moved tag turns the build branch red

**Evidence.**
- With `everyPin` set ("this change edits tools/check-action-pins", `base.ts:47`), `check.ts:86-95` leaves `base`
  undefined, so `selectPins` puts every ref in `verify` (`base.ts:63`). Every verify-loop problem is then an error on
  every event (`check.ts:101-118`).
- P1's merge push edits the checker, so all 13 refs are re-read from github.com with errors and no deadline. A github.com
  outage, or an upstream retag of a full version tag, turns `claude/build-platform` red.
- The same happens on P2's merge push.
- Today's push run already re-verifies changed-input pins with errors: run 40593100176's log, line 417, "against the
  merge base 085299bdf7d3: only pins new or with changed inputs are read", then five verify reads.
- The design keeps "ci-deps' own verify-loop errors are unchanged" (design:153-154). Yet it fixes the same exposure for
  the builder (E4) on the same reasoning: a green pull request was the gate.

**Fix (in P1's scope; `check.ts` is B1's).**
- On a `push`, a verify-loop fault for a ref that `state.workflows` already holds is a warning. That covers a ref read
  only because `everyPin` is set or because inputs changed.
- A ref new against BEFORE keeps its errors. Ages are already warnings.
- Optionally bound the verify loop by the push deadline.
- Add a case to check-action-pins `check.test.ts`: on a push where the change edits the checker, a moved tag and an
  unreadable tag on unchanged pins give warnings and `errors: []`. That makes +3 in that file, not +2.

### S5. check-toolchain cannot keep E3's 180 s deadline without a signal in `readJson`

**Evidence.**
- `readJson` overwrites any caller signal with `AbortSignal.timeout(60_000)` (`registry.ts:79`).
- Its pause has no signal (`:75`), and it has no signal parameter.
- A Hub read therefore takes up to 3 × 60 s plus pauses, and with E14's two rate-limit waits up to about 300 s. A
  deadline cannot stop it once started.
- E3's claim that "all three at their limit stay inside the 900 s" (design:806-809) does not hold for the Toolchain step.
  The tag search alone can chain five such reads per digest.
- The sum also leaves out the verify loop (S4) and the npm reads (P20), neither of which has a deadline.

**Fix.**
- `readJson(..., { signal })` combines the caller's signal with each try's timeout (`AbortSignal.any`, as
  `network.ts:96` does).
- Its sleep takes the signal.
- A Hub try's timeout is 30 s, not npm's 60 s.
- One `registry.test.ts` case: the deadline stops a hanging Hub read and the remaining digests are named once.
- Correct E3's sum to name what it bounds and what it does not.

### S6. "Every image the tree names" misses image references a build or a workflow can pull

**Evidence.** The rule reads `FROM`, `# syntax=`, compose `services.*.image`, `driver-opts`, `container`, `services` and
`docker://` (design:578-583). It does not read:
- `COPY --from=<image>` or `RUN --mount=...,from=<image>` naming a non-stage image. BuildKit pulls such an image by
  tag. CI-13's digest test reads only `^FROM` lines (`tools/test/workflows.test.ts:2780-2785`), so neither the digest
  rule nor the age rule sees it.
- `build-push-action`'s `build-contexts: name=docker-image://<ref>`, which replaces a `FROM name` at build time.
- A Dockerfile outside `apps/*/Dockerfile`. `dockerfilePaths` reads only `apps/<name>/Dockerfile` (`tree.ts:32-41`),
  while `build-push-action`'s `file:` can name any path, and two workflows compute it
  (`release.yml:106`, `release-dry-run.yml:115`).
- compose `services.*.build`.

None is used today. Today's `--from=` values are stages (`apps/web/Dockerfile:38-42`, `apps/worker/Dockerfile:33-43`).
The design nonetheless claims the rule "holds on its own if either refusal is ever lifted" (design:583-585), and E1 says
"a new kind of image reference is aged or refused from the day it appears" (design:797-799).

**Fix (B2, in `images.ts` and the offline `images` rule; E5).**
- The form rule refuses each of the following:
  - a `--from=` or `from=` naming anything but an earlier stage;
  - any `build-contexts` with `docker-image://`;
  - any tracked `Dockerfile*` or `Containerfile*` outside `apps/*/Dockerfile` (from `git ls-files`);
  - compose `build:`.
- Alternatively read them and age them. Refusal is simpler and safer, since none is used.
- Add one `images.test.ts` case, `the offline rule refuses an image the age rule cannot read`, which brings the file to
  17 with B1.

### S7. Reusable workflows and Docker actions run mutable references under an aged pin; C9's premise does not reach them

**Evidence.**
- `actionUses` collects `jobs.*.uses` (`workflows.ts:73`), and `PIN` admits `owner/repo/.github/workflows/x.yml@<sha>`
  (`workflows.ts:14`).
- `verifyPin` then only checks the tag of a reusable workflow ("its inputs are not read", `verify.ts:226`). The called
  workflow's own `uses: x@v1`, branch refs and `container:` images run unpinned and unaged.
- `nestedProblems` returns `[]` for any action that is not a composite (`verify.ts:95`). A `runs.using: docker` action
  whose `image` is `docker://name:tag`, or a `Dockerfile` with `FROM name:tag`, pulls a mutable image at run time.
- C9 ("A nested SHA predates the commit that names it", design:349-350) and R6 (design:383) assume every nested
  reference is a SHA or a digest. That is true only of composites.
- None is used today: there are no job-level `uses:` in any workflow, and the 12 pins are node or composite. The 13th
  verify line in run 40593100176's log shows trivy-action is composite.

**Fix (B1, offline rule (a), `workflows.ts`, and `verify.ts`).**
- Refuse a `jobs.*.uses` that names another repository ("a reusable workflow's nested references are not checked").
- Refuse a `runs.using: docker` action whose `image` is not `docker://…@sha256:<64>`. A `Dockerfile` image is refused.
- State in R6 and ADR Part 5 that "what an action downloads at run time" stays outside P1. That covers setup-node's
  Node, setup-python's Python, setup-trivy's Trivy (P2) and the `pip install` in N12.
- Tests: +1 in `workflows.test.ts` (check-action-pins) and +1 in `verify.test.ts`.

### S8. E8 counts `github.token` only; the same token as `secrets.GITHUB_TOKEN` or `toJSON(github)` slips past

**Evidence.**
- E8 is meant to make sure "the token cannot spread to another step or the job unnoticed" (design:823-824).
- `${{ secrets.GITHUB_TOKEN }}` is the same token, and other workflows already use that form
  (`release.yml:346`, `release-dry-run.yml:224`).
- `${{ toJSON(github) }}` carries `github.token`.
- `ci.yml` today has neither form and no `secrets.` at all. No test asserts the whole of `ci.yml` free of `secrets.`;
  the existing asserts are per job (`tools/test/workflows.test.ts:1127, :1150, :1277`).

**Fix.** In the same `it` (`:1316`), assert:
- `ci.yml` contains `github.token` exactly once, and only in the Action pins step's `env`;
- no `secrets.`;
- no `toJSON(github)` and no `toJSON(secrets)`.

### S9. A verification-service outage reads as "age unprovable" and invites the wrong exclude

**Evidence.**
- `verification.reason` includes `gpgverify_error` ("an error communicating with the signature verification service")
  and `gpgverify_unavailable` (`GET /repos/{o}/{r}/git/commits/{commit_sha}` description, 83a2153c). In both cases
  `verified_at` is presumably null; that is not verified.
- P1 would fail such a pin as "age unprovable" (design:67-69). The remedy it names, an `age-unprovable` exclude, is
  wrong for a transient failure, and before B1's fix it would pass a young pin.

**Fix.**
- Treat those two reasons as a failed read. Retry them inside the same three tries, then fail closed naming the reason
  with the remedy "re-run".
- Never treat them as "age unprovable".
- Print `verification.reason` beside `verified_at` in every block, so P1's own run records it for the 12 pins.
- Add to the CI-mode case of `age.test.ts`.

### S10. An image `security-fix` exclude is checked for form only, so any well-formed CVE id stands in

**Evidence.** The image list accepts "a GHSA or CVE id, held for form only, since no registry answers for it"
(design:183, :462, E11 at :833-834). Action and npm excludes are checked against an advisory database (E11;
`check.ts:463-487`). An image exclude naming any real-looking CVE passes a young digest.

**Fix (P1).**
- Record it as a residual in ADR Part 5 and in CI-23's row: "an image exclude's advisory is not verified".
- Require that `reason` name the package and the fixed version.

**Proposal P23 (outside P1).** On a pull request that adds an image exclude, the images job's Trivy scan of the base
digest must report that CVE, and the scan of the new digest must not. P2's Trivy work makes this cheap.

### S11. Two live paths stay unproven after P1's CI run; the image path can be proven from here

**Evidence.**
- Images are not bootstrapped (E2), so P1's run exercises no Hub read by `images.ts`. The builder check's reads are a
  different code path (`buildkit.ts:76-86`, through `transport.get`, not `registry.ts`'s `readJson`).
- No `security-fix` exclude exists, so E11's `GET /advisories/{ghsa_id}` and its range evaluation never run live.
- Docker Hub answers here (00:42:08Z). The digests entered at `afe339b9` (node), `91d2579a` (postgres) and `8890c4e6`
  (builder) (`git log -S`, 00:53Z), so a base before them makes each one "new".

**Fix.**
- The integrator runs the image path locally and records the reads and verdicts in ADR Part 5 beside 14.3:
  - `BASE=afe339b9^ pnpm toolchain:check`: node read, 6+ days, passes;
  - `BASE=8890c4e6^ pnpm toolchain:check`: builder read.
- State E11's live path as open, with the first `security-fix` action exclude as its proof, in 14.8 and in the
  runbook's procedure.

### S12. The committed-lists assertion crosses builders and turns commit 3 red

**Evidence.**
- 14.1's §5 row puts "both new exception lists" into check-toolchain's committed-lists test (design:463).
- Commit 3 (B2) says that test asserts "both new lists empty" (design:688).
- That test reads files relative to `tools/check-toolchain` (`check.test.ts:547`). `tools/check-action-pins/age-exceptions.json`
  is B1's, created in commit 5. Commit 3, meant to be green, then fails on a missing file, or B2 edits B1's tree.

**Fix.**
- B2's test asserts `image-age-exceptions.json` empty.
- B1 asserts `age-exceptions.json` empty inside an existing `age.test.ts` case. The count is unchanged.

## Nits

- **N1.** "`checkToolchain` already receives both trees, the event and `now`, `index.ts:29`" (design:206): the call is
  `index.ts:30` (`:29` is the "comparing" line).
- **N2.** §2.2 names `GET https://hub.docker.com/v2/namespaces/<ns>/repositories/<repo>/tags/<tag>` (design:91). 14.3
  (design:545) and `buildkit.ts:76` use `/v2/repositories/<ns>/<repo>/tags/<tag>`. Name the one CI already proves.
- **N3.** Acceptance 4, "never makes a read for its age ... on any event" (design:40-41), contradicts bootstrapping
  (acceptance 8, design:48-49) on P1's own pull request and its merge push. Add "except under bootstrapping".
- **N4.** The 824 s figure counts two git reads and three API reads (design:455). A pin can also need `fetchSha` and
  E11's advisory read, giving 3 × 97 + 4 × 210 = 1,131 s. The deadline bounds either figure. Fix the number, or call it
  a lower bound.
- **N5.** §3.1 cites check-toolchain's "A push run follows a green pull request, so it warns" (`check.ts:60-61`) as
  precedent (design:152-153). In fact check-toolchain fails a push on its lockfile age rule and on any registry outage.
  Only the expired-exclude finding warns (`check.ts:536-544`; `index.ts:28`). P1's push warnings are a new convention
  there, so say so.
- **N6.** A pin whose comment names a tag that does not exist upstream makes `git fetch +refs/tags/vX:refs/tags/vX`
  exit non-zero. That is retried as a network failure (about 97 s) and ends with a misleading host failure. Read the tag
  in `fetchRefs`'s `ls-remote`, and make a missing tag an answer ("no tag vX").
- **N7.** C1 says "Forgery can only push a date earlier" (design:324-325). An author-set committer or tagger date can
  also lie in the future, which makes the pin unaddable until then. No exclude kind fits that case. Say so in C1. The
  message should name it ("a date after GitHub's `verified_at`"), with the remedy "choose another release".
- **N8.** E11 needs three more rules:
  - an action with no pin at the base cannot take `security-fix`, as npm's `baseVersions` refuses
    (`check.ts:471-473`);
  - GHSA's `vulnerable_version_range` syntax (`>= a, < b`, `= x`) must be evaluated. `rangeHolds` is npm's
    (`policy.ts:195`);
  - the `v` prefix is stripped.
- **N9.** A pin of a platform manifest digest (`images[].digest`) would read as "superseded, found on no tag". Match
  `images[].digest` too, and take that tag's time.
- **N10.** `make.sh` must put its `GNUPGHOME` under a short `mktemp -d`. gpg-agent's socket path must fit about 107
  bytes. Here a 125-byte path gave "No agent running" (00:39Z). gpg also refuses to sign with an expired key, so the
  case "a signature by the expired test key dated after its expiry" (design:236-237) needs this order: sign with no
  expiry, then add a self-signature backdated by `--faked-system-time` that sets an expiry before the signature. Write
  the procedure in `make.sh`.
- **N11.** `gpgv` becomes a local prerequisite of `pnpm test` and `pnpm actions:check`. A stock macOS lacks it. Name it
  in `docs/runbooks/ci.md`'s local commands (`:384-387`). Proposal P24: have `.claude/hooks/session-start.sh` report a
  missing `gpgv` as it reports gitleaks.
- **N12.** 14.4 item 7 should name two more facts.
  - Earlier steps of the same job can reach the token step through `$GITHUB_ENV` (for example `NODE_OPTIONS`). That
    includes the unpinned `pip install pyx12` (`ci.yml:48`) and allowed install scripts.
  - Part 5's revisit list should gain "the repository goes private", which ADR 0066 Part 4 already lists as a trigger
    (`:1256`; Part 1's `:267` too), since the "reads nothing an anonymous reader cannot" argument depends on visibility.
  - Supporting fact, for the record: setup-node 949feb24 already defaults its `token` to `github.token`
    (`action.yml:18-20`) and reads `api.github.com/repos/actions/node-versions/git/trees/…`
    (`dist/setup/index.js:98532-98535`). So the job token reading another public repository's REST API is routine on
    these runners. Item 7's assumption holds, though P1's own run is still the proof for `git/commits` and `releases`.
- **N13.** The ★ case "unchanged digests make zero reads" (design:253-254) cannot fail on behaviour: the unchanged
  checker has no image rule and makes zero Hub reads. It is red only because `images.ts` is missing. Drive it through
  `checkToolchain` and assert a new note ("images: no digest new against the base, nothing read"), as `age.test.ts`'s
  base-pin ★ does.
- **N14.** The ★ case "tag moved, with both SHAs" (design:231): the unchanged verify loop already reports both SHAs
  ("the tag … is the commit X, not Y", `verify.ts:223`). Make the recorded transport answer the verify loop's
  `ls-remote` with the pin and the age loop's fetch with another commit, and assert the age loop's own "tag moved"
  message.
- **N15.** `get` follows redirects (`network.ts:96`, `redirect: 'follow'`). Node strips `Authorization` on a
  cross-origin redirect, but the API reads should use `redirect: 'error'` (a renamed repository's 301 is same-origin
  and can be followed explicitly). No message may include request headers.
- **N16.** The fetch takes every branch (`'+refs/heads/*:refs/heads/*'`, design:107-108). The rule needs only the
  default branch from `--symref HEAD`. Fetching only that branch is smaller and leaves no other branch to confuse the
  ancestry check.
- **N17.** §14.5's counts are right, but the wording would mislead a builder.
  - `tree.test.ts` "two cases" in commit 2 (design:666) and "+2" in commit 3 (design:687) are the same two.
  - "The rest of `images.test.ts` (15 cases)" (design:687) and "The rest of `age.test.ts` (27 cases)" (design:720) are
    totals that include the ★ cases.
  - Write "to 15 in all" and "to 27 in all".
  - With B1, S3, S4, S6 and S7: `age.test.ts` 29, `images.test.ts` 17, check-action-pins `check.test.ts` 3,
    `workflows.test.ts` (check-action-pins) +1, `verify.test.ts` 2, the rest unchanged. That is 61 new tests (54 + 3
    for B1 + 1 for S4 + 1 for S6 + 2 for S7), giving **385 files and 6,413 passed + 1 skipped at ecebdc90**, or **386
    and 6,479 at 0dd1ba7e** (383 files, 6,418 passed and 1 skipped there, confirmed from unit job 122550688445's log).

## Proposals outside P1

These continue after P22. Each is reversible and recommended.
- **P23.** Verify an image `security-fix` advisory against the images job's Trivy scans of the base and new digests
  (S10).
- **P24.** `session-start.sh` reports a missing `gpgv` (N11).
- **P25.** Pin `pip install pyx12` (`ci.yml:48`) to one version with `--require-hashes`, and hold it to the release age
  from PyPI's upload time, as npm versions are held. Today it installs whatever PyPI serves, at run time, in the job
  that will hold the token.
- **P26.** Hold `tools/gitleaks/release.txt`'s version (8.24.3) to the floor through the GitHub release's `published_at`
  on CI. Today a hand bump to a release minutes old passes, and the SHA-256 is copied from the same release.
- **P27.** Apply the default-branch rule to nested SHA pins, which `nestedProblems` already fetches. Today's nested pins
  pass:
  - `aquasecurity/setup-trivy@3fb12ec1` is an ancestor of `main`;
  - `actions/cache@27d5ce7f` is an ancestor of `main`;
  - (blobless fetch, 00:49:48Z).

  It closes an impostor commit nested in a pinned composite.
- **P28.** Put ci-deps' verify loop under a deadline on every event, as the push re-reads are (S4, S5).

## What api.github.com's 403 leaves for CI to prove

- `verified_at`, `verification.reason` (S9), `published_at` and `immutable` for the 12 pins. P1's run prints them, and
  §8's stop rule stands.
- The token's read of `/repos/{o}/{r}/activity` for other owners, and whether it answers for `refs/heads/<default>`
  (S1, S2).
- E11's advisory read: not exercised by P1's run (S11).
- Run 40593100176's token permissions and runner image are now confirmed from its log, lines 16-23 (00:51Z):
  "Contents: read", "Metadata: read", ubuntu-26.04 20261012.163.1.

## Checked and holds

**Counts.**
- 27 + 15 + 4 + 2 + 2 + 2 + 1 + 1 = 54, giving 385 files and 6,406 passed at ecebdc90, and 386 and 6,472 at 0dd1ba7e.
- The 0dd1ba7e baseline is 383 files, 6,418 passed and 1 skipped (unit job 122550688445's log).
- The scoped run is 29 files and 358 tests (run here), and 32 and 412 after P1 is consistent with it.

**Cites at ecebdc90.**
- check-action-pins:
  - `check.ts`: `:22, :27, :45-55, :86-95, :101-119, :121-129, :123-124, :125, :131-168`;
  - `base.ts:30-49` (`:44`, `:47`, `:60-67`);
  - `network.ts:21-33, :38, :45-120, :57-58, :71-84, :99-115, :116-118, :122, :124, :127-135, :144-173`;
  - `buildkit.ts:20, :39-48, :65-106, :68, :74, :93`.
- check-toolchain:
  - `check.ts:42-52, :58, :60-61, :135, :200-203, :387-414, :467-487, :489-547, :499, :512, :536-544, :810-817,
    :820-852, :829`;
  - `tree.ts:32-41, :44-48, :51-57`;
  - `registry.ts:66-68, :71-98, :84-86`;
  - `policy.ts:11, :13, :122-126`.
- `ci.yml:13-15, :35, :37, :40-41, :81-88, :92-95`.
- `workflows.test.ts:82, :1318, :1393-1402, :2719, :2798, :2806, :2814-2820, :2888, :2390-2393`.
- ADR 0066 `:120-121, :444-454, :989-1258`; ADR 0063 `:300`.
- `dependency-upgrades.md:222-248` (it says "four" where there are five); `controls.ts:261-262`;
  `reconciliation-001.md:653-657`.
- `test-matrix.md:252-257, :255, :280`; `matrix.ts:420`; `registry.ts:605, :614, :617`.

**Measurements and outside facts.**
- The Hub values in 14.3: three tags, digests and push times (00:42:08Z).
- #42 has 212 files and shares lines 91, 92, 203 and 204, plus `pnpm-lock.yaml` (00:44:25Z).
- At 0dd1ba7e: `test-matrix.md:260, :285`; `matrix.ts:432`; `registry.ts:608, :617, :620`.
- The static push job ran 192 s, Action pins took 7 s and Toolchain 2 s (job 122502076872).
- `immutable-releases.md:22`: the tag is locked "while the release exists", and after deletion the name cannot be
  reused. C4 holds.
- The REST facts behind D4 and E7: `immutable` is optional; `published_at` and `verified_at` are required and nullable.
- The highest existing proposal is P17 (`lane-b-ci.md:3072`), so P18 to P22 do not collide.
- None of P1's files is on LANES' "Not while #42 is open" list (`LANES.md:84-91`).
- No migration, secret, new dependency or founder-kept decision is needed. ADR 0066 Part 1's "no step calls GitHub" is
  a build notice under the co-founder's delegation, not a founder ruling (ADR 0066 `:29-41`).
