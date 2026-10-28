# PR #82 (co-001/ci-pin-age, P1), security and supply-chain review

Head reviewed: b574d4e8770d3cbea4ab007cb41708d09b7f807f, diffed against claude/build-platform 0dd1ba7e. Reviewed
2026-10-28 from 03:30Z to 03:55Z.

How I worked:
- I used a fresh blobless clone, `/home/user/review-p1-security-supply`, and removed it afterwards.
- `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile` passed.
- The scoped run `flock … pnpm exec vitest run --project unit tools/check-action-pins tools/check-toolchain tools/test`
  passed: 32 files, 420 tests (`logs/rev-sec-scoped-vitest.log`).
- I made no commit, push, GitHub comment or review.
- My probes are small tsx scripts in `scratchpad/p1build/review-sec/`. They import the head's modules and feed them
  synthetic inputs. Their output is in `scratchpad/p1build/logs/rev-sec-probe-*.log`.
- I read two upstream sources in blobless sparse clones under `review-sec/upstream/`:
  - BuildKit at v0.34.1 (f5b59a1f), the pinned builder's version;
  - actions/runner at 4197182e.
- Every path below is relative to the repository unless it says otherwise. `scratchpad` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad`.

**Verdict:** no blocking finding. The age rule for action pins is sound on every fail-closed path I tried. The token is
used as designed. P1's own CI run proves both on GitHub's runners.

The image rule's Dockerfile reader does not parse a Dockerfile the way BuildKit does. Ordinary lines can hide a later
`FROM` from it, so a young digest can enter the build branch unaged (S1). A frontend chosen by a BOM-prefixed or `//`
syntax line, or by the `BUILDKIT_SYNTAX` build-arg, passes both the image rule and CI-13 (S2).

Two more gaps fail open:
- check-action-pins reads the base's workflows recursively but the head's only at the top level (S3).
- The new Docker-action refusal compares `runs.using` case-sensitively, while the runner does not (S4).

All four are cheap to fix and should go in before the pull request is marked ready.

## CI on the head (read through the GitHub MCP tools, 03:35Z)

- **All 22 check runs on b574d4e8… are success or skipped by design.**
  - `all green` finished at 03:29:02Z.
  - `capacity` (the screening-capacity gate) finished at 03:37:22Z.
  - `e2e (1/2)` and `e2e (2/2)` passed. `stryker` was skipped because `mutation` found no money path.
- **unit** (job 122611334567): 395 files, 6,627 passed, 1 skipped (6,628). That is the count on 165c5993….
- **static** (job 122611334491; log saved as `scratchpad/p1build/logs/rev-sec-ci-static-122611334491.txt`):
  - "Action pins" ran with `BASE: origin/claude/build-platform` and `GITHUB_TOKEN: ***`. The token is masked, and it is
    on that step's env only.
  - The bootstrapping note names merge base 165c59932a26. Every pin was read again ("this change edits
    tools/check-action-pins").
  - There are 12 age blocks for the 13 refs. In each one the pin is on its default branch, its tag names the pin, and
    the signature is web-flow `VALIDSIG` by key 968479A1AFF927E37D1A566BB5690EEEBB952194.
  - `verified_at` has `reason valid` for all 12 and lies 0 to 4 s after the committer time.
  - `immutable true` holds for 8 pins. It is false for actions/cache, checkout, download-artifact and upload-artifact.
  - The youngest time in every block is the release's `published_at`. The youngest of those is login-action at 4.50
    days.
  - Every arrival line reads "activity: no push brought the pin onto <branch> since 2026-10-25T03:21:12.792Z
    (1 entries read)". So the job's token reads another owner's `/activity`.
  - The builder line reads "its tag is the index sha256:99368f3e…; no newer release is three days old".
- **"Toolchain"**: "images: no image is new against the base, so nothing is read (3 digests named, each one in the
  base)". It finished with 0 errors and 0 warnings.
- These match the integrator's summary. The step logs print no request header, and no token text apart from GitHub's
  `***` mask.

## Findings

### S1 (should fix): the image rule's Dockerfile reader diverges from BuildKit's parser, and every divergence hides the lines after it, so a young `FROM` digest is never aged

**Where.** `tools/check-toolchain/images.ts:99-140` (`instructions`):
- the directive loop at `:102-110`, with its regex at `:103`;
- the continuation test at `:120`;
- the heredoc skip at `:128-136`, with its regex at `:129`.

The age set comes from what this reader returns (`formOf` at `:318`, and `fresh` at `:479`). So a `FROM` it never
returns is neither form-checked nor aged.

**Concrete inputs.** The probe gave each of these to `imagesOf` and `imageFormRule` (`logs/rev-sec-probe-images.log`).
In each, the line after the trigger is `FROM evil/image:1.0@sha256:<64 b>` or `FROM evil/image:latest`. Each time the
result was `uses` = the first stage only, and 0 form errors:

1. **A here-string.** `RUN tr a b <<<abc`. The rule's regex finds `<<abc` inside `<<<abc` and skips every line until a
   line `abc`, which here means to the end of the file. BuildKit does not treat this as a heredoc. It matches heredocs
   per shell word with `^(\d*)<<(-?)\s*([^<]*)$` (BuildKit v0.34.1 `frontend/dockerfile/parser/parser.go:121, :481-499`),
   and `[^<]*` cannot match `<abc`.
2. **A quoted `<<EOF`.** `RUN echo "<<EOF"`. BuildKit lexes words with `RawQuotes = true` (`:483-486`), so the word
   starts with `"` and is no heredoc. The rule skips to the end of the file.
3. **A terminator the rule's regex cuts short.** `RUN <<EOF-1` … `EOF-1`. BuildKit's terminator is `EOF-1` (`[^<]*`).
   The rule waits for a line `EOF` and so skips to the end of the file.
4. **An escaped trailing escape.** `RUN echo foo \\`. BuildKit's continuation regex
   `([^\\])\\[ \t]*$|^\\[ \t]*$` (`parser.go`, `setEscapeToken`) treats a backslash preceded by a backslash as no
   continuation. The rule tests `endsWith(escape)` and joins the next line, here the `FROM`, into the RUN.
5. **A directive whose value has a space.** `# check=skip=all; error=false` then `` # escape=` ``.
   - BuildKit's directive regex `^([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(.+?)\s*$` (`directives.go:43-45`) accepts the spaced
     value and goes on to read `escape` (`parser.go`, `possibleParserDirective`). `parseLintOptions` trims each part.
   - The rule's `(\S+)\s*$` (`images.ts:103`) refuses it and stops looking.
   - So the rule keeps `\` as the escape, while BuildKit uses the backtick. A `RUN echo \` line then swallows the next
     line in the rule but not in BuildKit.
   - A UTF-8 BOM before `` # escape=` `` has the same effect. BuildKit strips it (`parser.go:298`, `discardBOM`); the
     rule's `^#` does not.

**What still catches it, and what does not.** CI-13 (`tools/test/workflows.test.ts:2791-2796`) reads `^FROM\s` line by
line. It therefore refuses a hidden `FROM` with no digest, but a hidden `FROM name:tag@sha256:<young digest>` passes it.

Cases 1 and 4 are ordinary shell. A build stage's `RUN … <<<"$x"` or `<<<word`, or an `echo` ending in `\\`, is enough
to hide the final stage. When Dependabot or a hand bump changes only that stage's digest, nothing reads it. This breaks
acceptance 3 ("a pull request that adds an image digest absent from the base … fails"). No Dockerfile today has `<<`
(`grep -n '<<' apps/*/Dockerfile` is empty), so nothing has slipped through yet.

**Fix.** Two parts, both in `images.ts`, with an `images.test.ts` case for each input above. The test count changes, so
the description's counts move with it.
- **(a) Read as BuildKit reads.**
  - Strip a leading BOM.
  - Read directives with BuildKit's `DirectiveParser`: cut `#`, trim, apply its regex, accept only the keys
    `syntax`/`escape`/`check`, and stop at anything else.
  - Use BuildKit's continuation regex for the current escape token.
  - Take a heredoc only from an unquoted shell word matching `^(\d*)<<(-?)\s*([^<]*)$`, its terminator being the whole
    word with quotes removed. Skip ONBUILD's heredocs too.
- **(b) Fail closed on any future divergence.** After parsing, every raw line matching `/^\s*FROM\s/i` (BOM stripped)
  must be a `FROM` the parser returned at that line. Every `--from=` or `from=` token in the text must belong to a parsed
  COPY or RUN. If not, refuse with "a FROM (or from=) line the image rule cannot place". (a) alone fixes these five
  inputs. (b) is what makes "every image the tree names" (E1, E17) hold against the next quirk too, at the cost of
  refusing a heredoc body line that starts with `FROM`. That cost is safe, and nothing today pays it.

### S2 (should fix): a frontend or build input that BuildKit honours but neither the image rule nor CI-13 reads

**Where.**
- `images.ts:157-162`: `# syntax=` is read with `/^#\s*syntax\s*=\s*(\S+)/i` on raw lines.
- `images.ts:250-254`: a build-push-action step is checked for `docker-image://` in `build-contexts` only.
- `tools/test/workflows.test.ts:2806-2810`: CI-13's syntax check uses the same raw-line regex.

**Concrete inputs.** From the probe log, each gives `uses` without the frontend and 0 errors:
- **A BOM-prefixed syntax line.** `\uFEFF# syntax=evil/frontend:latest` as the first line. BuildKit's `DetectSyntax`
  strips the BOM first (`directives.go:135`, `discardBOM` `:198-200`) and forwards the whole build to that image,
  pulled by tag (`builder/build.go:62-63`). Windows editors save UTF-8 with a BOM, and GitHub's diff does not show one.
  A reviewer sees an ordinary `# syntax=` line and reasonably trusts CI-13 to hold it to a digest, but CI-13 skips it.
- **A c-style syntax line.** `//syntax=evil/frontend:latest` as the first line. `DetectSyntax` falls back to `//`
  directives (`directives.go:155-160`). The JSON form `{"syntax": …}` (`:163-175`) is backstopped:
  `dockerfileRule`'s install-pnpm check and CI-13's `from.length > 0` both fail on a JSON Dockerfile. The `//` form
  keeps both of those lines and passes everything.
- **`BUILDKIT_SYNTAX` as a build-arg.** `build-args: BUILDKIT_SYNTAX=evil/frontend:latest` on a
  `docker/build-push-action` step. The frontend forwards to that image before it reads the Dockerfile
  (`builder/build.go:34, :55-57`).
- **Other build-push-action inputs the rule does not refuse:**
  - `context:` as a remote git URL, which builds a Dockerfile the tree does not hold;
  - a literal `file:` not named like a Dockerfile, e.g. `build/spec.txt`, which `isImageFile` (`tree.ts:58-62`) does not
    list;
  - `cache-from: type=registry,ref=…`, which imports layers from a registry image as build results.

  None occurs today. Every `file:` is `apps/<app>/Dockerfile`, literally or through `steps.image.outputs.dockerfile`
  (`release.yml:90-93`, `release-dry-run.yml:101-104`). Every `cache-from` is `type=gha`.

**Why it matters.** The frontend runs the whole build of both production images. A frontend by tag is the one image
reference that can change every later step's meaning.

**Fix.**
- Read the frontend as `DetectSyntax` does: strip a BOM, skip a `#!` line, accept `#` and `//` directives, and refuse a
  Dockerfile that parses as a JSON object.
- Apply the same in CI-13's syntax read at `workflows.test.ts:2806-2810`. P1 already edits that file.
- In `workflowImages`, for docker/build-push-action, refuse:
  - `build-args` naming `BUILDKIT_SYNTAX`;
  - a `context:` that is not a local relative path;
  - a literal `file:` that is not `apps/<name>/Dockerfile`;
  - `cache-from`/`cache-to` entries other than `type=gha`.
- Add an `images.test.ts` case for each.

### S3 (should fix): check-action-pins reads the base's workflows recursively but the head's only at the top level, so a pin parked in a subdirectory is never aged when it moves into a real workflow

**Where.**
- `tools/check-action-pins/base.ts:38`: `git ls-tree -r --name-only <mergeBase> -- .github/workflows/`, keeping every
  `.ya?ml`.
- `tools/check-action-pins/check.ts:72-78`: `readWorkflows` uses `readdirSync` of `.github/workflows`, top level only.
  That matches GitHub, which runs only top-level files.
- check-toolchain already gets this right: `tree.ts:109` keeps top-level files only, at both commits.

**Scenario.** The probe (`logs/rev-sec-probe-base.log`) is a synthetic repository whose base holds
`.github/workflows/drafts/next.yml`, which uses `actions/setup-python@<young sha> # v7.2.0`.
- **The first pull request** adds `drafts/next.yml`. No rule reads it, because the head reader never sees it: no form
  rule, no verify read, no age read. GitHub never runs it either.
- **The second pull request** adds the same ref to `ci.yml`. The head's workflow files are `['ci.yml']`. The base's are
  `['ci.yml', 'drafts/next.yml']` with `hasAge` true. `ageSet` returns `{"refs":[]}`, so the young pin is never aged.
  - `selectPins` also leaves it unverified, because the step's signature (pin, inputs) equals the parked one's. So its
    tag is not read either.

The cost is two merged pull requests. The first is innocuous-looking, and every check on it passes. The `-r` predates
P1 (ci-deps), but P1's age set and `ran` set are built from it, and `base.ts` is P1's file.

**Fix.**
- In `baseState`, list `.github/workflows` non-recursively: `git ls-tree -z --name-only <mergeBase> .github/workflows/`,
  keeping paths with no further `/`, as `tree.ts:109` does.
- Add an offline rule that refuses any file under a subdirectory of `.github/workflows`. That holds in the head and
  stops parking at its first step.
- Add a `check.test.ts` case with the probe's two trees.

### S4 (should fix): the new Docker-action refusal, and the nested-action walk it relies on, compare `runs.using` case-sensitively; the runner does not

**Where.**
- `tools/check-action-pins/verify.ts:97`: `meta.using !== 'docker'`, in `dockerProblem`, which is E18's refusal.
- `verify.ts:106`: `meta.using !== 'composite'`, in `nestedProblems`. It predates P1, but E18's "at any depth" depends
  on it.
- `verify.ts:160`: `cacheGates`.

**Evidence.**
- actions/runner 4197182e, `src/Runner.Worker/ActionManifestManager.cs:443` and `:486`:
  `string.Equals(usingToken.Value, "docker", StringComparison.OrdinalIgnoreCase)` and the same for `"composite"`.
- The probe (`logs/rev-sec-probe-verify.log`): `using: docker` with `image: Dockerfile` is refused, but `using: Docker`
  and `using: DOCKER` pass.

So a pinned action whose `action.yml` says `using: Docker` with a Dockerfile, or with an image by tag, passes. It then
pulls a mutable image at run time, and that image can be swapped long after the action's commit is old. The same
spelling of `Composite` hides every nested pin from the walk.

**Fix.**
- Compare `using.toLowerCase()` in all three places. The runner's `docker://` prefix test is case-insensitive as well
  (`ActionManager.cs:1467`, `ContainerActionHandler.cs:55`). `DOCKER_DIGEST` is case-sensitive, which only refuses
  more, so it can stay.
- Add a `verify.test.ts` case for `Docker` and `Composite`.

### N1 (nit): a compose service built from a YAML merge key is invisible to the image rule (CI-13 backstops it)

**Where.** `images.ts:269` calls `parse(text)` without `merge: true`. With yaml's YAML 1.2 default, `<<` is a plain key.

**Scenario.** `x-base: &base {image: evil/image:latest}` and `services: {extra: {<<: *base}}`. The probe gives
`uses=[]` and 0 errors. Compose resolves the merge, and Docker's own docs use `<<: *…` with `x-` fragments.

CI-13 (`workflows.test.ts:2799-2800`) expects every service's `image` to match a digest. It fails on `undefined`, so
today nothing gets through.

**Fix.** Parse with `{ merge: true }`, or refuse any service with a `<<` key, so the rule holds on its own as E17
intends. The same goes for `job.services` in the workflows: GitHub does not resolve merge keys, but refusing them costs
nothing.

### N2 (nit): E8's assertions are case-sensitive, and GitHub's expressions are not

**Where.** `tools/test/workflows.test.ts:1328-1331`: `/github\.token/g`, `/secrets\.|github\[|toJSON\(\s*(?:github|secrets)\b/`.

**Evidence.** actions/runner `src/Sdk/DTPipelines/Pipelines/ContextData/DictionaryContextData.cs:77` looks keys up with
`StringComparer.OrdinalIgnoreCase`. `src/Sdk/DTExpressions2/Expressions2/ExpressionParser.cs:426-427` does the same for
named values and functions. So `${{ GitHub.Token }}`, `${{ Secrets.GITHUB_TOKEN }}` or `${{ tojson(github) }}` in
another step reaches the token and passes E8.

The token is read-only and anyone who can edit `ci.yml` is reviewed anyway, so this is a tripwire's gap, not a boundary.

**Fix.** Use the `i` flag on all three regexes, and also refuse `github.*` and `join(github` (an object filter reaches
the token too).

### N3 (nit): two crash paths where the design asks for a finding

These are fail-closed on a pull request, but on a push they turn the build branch red rather than warn.

**First: an out-of-range committer time.**
- `tools/check-action-pins/age.ts:496-502` turns a committer or author epoch into `iso(at)` outside any try.
- A commit whose committer line carries an epoch past year 275760, such as `99999999999999`, throws
  `RangeError: Invalid time value` (`logs/rev-sec-probe-verify.log`). git's fsck accepts that epoch.
- The throw escapes `readFacts`, rejects `pool`'s `Promise.all` (`network.ts:314`) and crashes `pnpm actions:check`.
- **Fix:** read a time only when `Number.isFinite(ms) && Math.abs(ms) <= 8.64e15`, else note "an unreadable committer
  time". Also clamp in `judge`'s `iso(signal.ms + floor)`.

**Second: the arrival read at the deadline.**
- `arrival` (`age.ts:563`, outside the try) calls `carriesPin`, and `carriesPin` calls `transport.object`.
- In `object`, the second git call (`network.ts:238`, `gitBytes(cat-file …)`) is outside its try. If the 180 s deadline
  aborts between the two git calls, the AbortError escapes the same way.
- The window is narrow, but it is the outage case E3 exists for.
- **Fix:** wrap `arrival` in `readFacts` as a note ("activity: not read (…)"), and make `object` return undefined on any
  failure, as its first call does.

### N4 (nit): the token is inherited by every child the step spawns

**Where.**
- `network.ts:102` builds git's env from `...process.env`.
- `age.ts:284` runs `gpgv` with the default env.

Neither git nor gpgv reads `GITHUB_TOKEN`. The global and system git config is off, and each bare repository is fresh,
so this is defence in depth only.

**Fix.** Drop `GITHUB_TOKEN` (and `GH_TOKEN`) from both env objects, so the token lives only in `age.ts`'s request
headers.

## Checked and found sound

**Fail-closed paths of the age rule** (`age.ts`; the tests in `age.test.ts` and my reading).
- A failed `fetchRefs`, object read, SHA fetch, ancestry walk, gpgv run or API read is a fault. `judge` (`:584`) then
  gives an error with "re-run", and no verdict.
- A missing `gpgv` is an error (`:516-518`).
- `verified_at` that is null, absent or unparsable is no signal. With no immutable release, the pin is then "age
  unprovable" on CI (`:540`, `:610-617`).
- A `verification` object missing from a 200 reads as `{}`, so it also fails closed.
- `reason` `gpgverify_error` or `gpgverify_unavailable` is retried, then fails with "re-run" (`:361-372`).
- **API answers:**
  - On the commit read, a 404 or any other non-200 fails closed (`:532-534`).
  - On the release read, a 404 means "no release", and any other non-200 fails closed (`:545-549`).
  - A 3xx is named as a move and is never followed.
  - The JSON parses are inside the try.
- **The deadline.** Commits left unread are one error naming them and both hosts on a pull request, and one warning on a
  push (`:774-779`). A missing token on CI with something to read is an error (`:745-747`).
- **The arrival read** only ever adds a younger signal (`recorded: false`). Its next page is followed only on the API's
  own origin (`:382-391`). Every other outcome is a note.

**Youngest-of and the GitHub-recorded requirement** (`:582`, `:604-645`).
- The youngest of all signals governs, so an old forged date can only lose.
- A future time is its own error, and no exclude clears it.
- On CI only `verified_at` and an immutable release's `published_at` are recorded. The web-flow signature counts as
  recorded only locally (`:521`, `!input.ci`), as the design says.

**Exclude kinds** (`judge`, `:593-623`, `:628-641`; `exceptionProblems` `:111-127`).
- Each kind waives exactly one requirement, and a reasoned kind still holds the floor.
- `age-unprovable` is refused when a recorded time exists. `off-default-branch` is refused when the pin is on the branch.
- `security-fix` requires a GHSA id, and on CI it is checked against `/advisories` (`:684-723`):
  - not withdrawn;
  - ecosystem `actions` for that repository;
  - covering the base's version and not the pin's;
  - a pin the base does not hold is refused.
- Every added or rewritten entry is held to `excludeWindowProblems`: added no later than now, and expiring within 7 days
  and not before what it names is three days old.
- An image `age-unprovable` entry is refused on Docker Hub (`images.ts:339-342`). A Hub digest found on no tag passes
  under no entry (`:525-536`). An `untimed` tag fails under every entry.

**Signature verification** (`age.ts:262-315`, `keys.ts`).
- gpgv runs with `--homedir` set to a fresh temporary directory and `--keyring` set to an absolute path holding the
  dearmored committed file, so no default keyring is read. Its timeout is 30 s, and the deadline signal applies.
- `VALIDSIG` field 11 (the primary key) must equal the hard-coded current fingerprint. A signature from the retired
  2017 key counts only with `EXPKEYSIG` and a signature time before 2024-01-16T20:00:00Z. `REVKEYSIG` refuses both.
- SSH and X.509 signatures give no signal.
- I ran `gpg --show-keys` on `github-web-flow.asc`. It holds exactly two public keys:
  - 968479A1AFF927E37D1A566BB5690EEEBB952194, created 1705428342;
  - 5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23, expiring 1705435200.
  `age.test.ts:690-692` asserts both.
- gpgv 2.4.4 refuses a non-detached (inline-signed) message given as the signature: "not a detached signature", exit 2.
  So a commit's `gpgsig` cannot carry an old web-flow-signed payload of its own. Even if it could, an old signal only
  loses in the youngest-of.
- `splitObject` drops `gpgsig` and its continuation lines exactly as git does for a SHA-1 repository.

**The token.**
- `ci.yml` names `github.token` once, on the "Action pins" step's env. The CI log shows `GITHUB_TOKEN: ***` on that step
  alone.
- Only `age.ts`'s `Context.headers` carries it (`:753`). It goes to `GITHUB_API_URL` for the commit, release, activity
  and advisory reads only.
- The builder's Hub reads, the image rule's Hub reads and the web-flow key read send no headers.
- `get` uses `redirect: 'manual'` whenever an Authorization header is present (`network.ts:181-182`). My live probe
  against two local servers (`logs/rev-sec-probe-redirect.log`) showed:
  - with the header, the 301 is returned and the second server is never asked;
  - without it, the redirect is followed and no Authorization is sent.
- No message includes request headers. `age.test.ts:463-481` asserts that the synthetic token appears in no result.
- The git reads send no credentials: `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1`, fresh bare
  repositories, and the checkout runs with `persist-credentials: false`.

**Fetch hygiene** (`network.ts`).
- Every SHA handed to git is 40-hex, validated: by `PIN`, by the ls-remote parse (`:219`), or by `carriesPin` (`age.ts:376`).
- Refs are looked up by exact name after `ls-remote`, so its tail-matching cannot substitute another ref.
- The promisor config is removed after each filtered fetch, so object reads never touch the network.
- An impostor commit that exists only elsewhere in the fork network is served but is no ancestor of the default branch.
  It is therefore "not on <branch>" unless a dated `off-default-branch` entry names it.

**Hub reads** (`registry.ts`).
- A 404 is an answer, and the tag search follows it.
- A missing repository gives an empty search and fails closed as "nowhere".
- Every time must parse as an instant, or the document is refused (no NaN path).
- The caller's signal ends a try or a pause. A rate limit waits at most 60 s.
- The digest-only age set holds: the same digest under any name is the same content.

**Workflow images** (`images.ts:197-261`).
- A job's `container` and `services` images must have the pinned form, or be refused when unreadable.
- `docker://` steps are read regardless of case.
- A setup-buildx step without `image=` is refused unless it uses the `docker` driver.
- `docker-image://` contexts and `docker/bake-action` are refused.
- Compose `build:`, `extends.file` and `include` are refused.
- Tracked image files outside the three read are refused (`tree.ts:58-62`).
- Base and head both read top-level workflows only.

**Synthetic testdata.**
- `testdata/age/` holds only the public halves of three throwaway ed25519 keys under `example.invalid` names, plus the
  objects they signed. `make.sh` keeps the private keys in a `mktemp` GNUPGHOME and deletes it on exit.
- No private key, SSH key or GitHub key material appears anywhere under `tools/` apart from the two public web-flow keys.
  `grep -rln 'PRIVATE KEY\|BEGIN SSH'` finds only the SSH-signature detection in `age.ts`, and `age.test.ts` re-armors
  the synthetic keys only.
- The three `fixtures/synthetic/CI-2x/expected.json` files hold no file and no PHI.

## Proposals outside P1's files (not built)

- **The buildx binary.** docker/setup-buildx-action's `version:` input downloads buildx from GitHub releases at run
  time, unpinned and unaged. Today none of the five steps sets it, so the runner's buildx runs. Refuse `version:` in
  `workflowImages`, or hold it as P26 holds gitleaks.
- **Common sources for gates and checker.** Give CI-13 and the image rule one shared Dockerfile reader, so a fix like S1
  or S2 cannot land in one and not the other. This would mean CI-13 importing `images.ts`'s reader, or deleting CI-13's
  duplicate reads in favour of `imageFormRule`, which the unit job already runs on the real tree.

## Commands and logs

All logs are under `scratchpad/p1build/logs/`:
- `rev-sec-install.log`: `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile`, exit 0.
- `rev-sec-scoped-vitest.log`: the scoped unit run, 03:41:40Z to 03:42:11Z, 32 files and 420 tests passed.
- `rev-sec-probe-images.log`: `pnpm exec tsx review-sec/probe-images.ts` and `probe-images-2.ts` (S1, S2, N1).
- `rev-sec-probe-base.log`: `review-sec/probe-base.ts` on the synthetic repository `review-sec/probe-repo` (S3).
- `rev-sec-probe-verify.log`: `review-sec/probe-verify.ts` (S4, N3).
- `rev-sec-probe-redirect.log`: `review-sec/probe-redirect.mts` (the token's redirect handling).
- `rev-sec-ci-static-122611334491.txt`: the static job's log as GitHub returned it.

Upstream sources read (blobless and sparse, under `review-sec/upstream/`):
- moby/buildkit v0.34.1 (f5b59a1f): `frontend/dockerfile/parser/{directives.go,parser.go}` and
  `frontend/dockerfile/builder/build.go`;
- actions/runner 4197182e: `src/Runner.Worker/{ActionManifestManager.cs,ActionManager.cs,Handlers/ContainerActionHandler.cs}`,
  `src/Sdk/DTPipelines/Pipelines/ContextData/DictionaryContextData.cs` and
  `src/Sdk/DTExpressions2/Expressions2/ExpressionParser.cs`.
