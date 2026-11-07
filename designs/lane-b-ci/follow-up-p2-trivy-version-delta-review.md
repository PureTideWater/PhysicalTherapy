# P2 delta review: section 14 of follow-up-p2-trivy-version.md (2026-11-07)

Adversarial review of section 14 ("Delta on #107 and #106 at 8a722f80") and the fourteen "(14)" marks in §12, read as
a security and supply-chain reviewer and as a CI-infrastructure reviewer at once, with the checklist of
`.claude/agents/security-reviewer.md` where it fits CI. Written 2026-11-07 from 07:18Z to 07:45Z.

Every cite is `file:line` at `8a722f804ad63daf3c2c3254eabeb5f989ee0fe7` in `/home/user/ci-trivy-version` (clean
throughout), or a design line (`design:N`, the design file as the reviser left it), or a command with its UTC time.
Scratch was `/home/user/laneb-sp/p2delta/tmp`, removed afterwards.

**Verdict: no blocking finding; five should-fix; fourteen nits.**
- The plan's security core holds: the identity, the signed object, the run-time hash, the database rules and the
  push-run warnings.
- S1 will turn B2's "green" commit 4 red as written.
- S2 to S4 are security choices that the "safer option" ruling decides the other way.
- S5 is a red-CI window in E25's re-pin.

## What was checked and holds

- **Trivy's flags at v0.76.1** (depth-1 fetch of the tag, 07:20:47Z; the tag peels to `e713f67f`):
  - `--config ''` loads nothing (`pkg/commands/app.go:159-162`).
  - `--ignorefile ''` loads nothing (`pkg/result/ignore.go:217-221`).
  - `--secret-config ''` uses the built-in rules (`pkg/fanal/secret/scanner.go:342-346`).
  - `--skip-java-db-update` with no Java database fails on the first run (`pkg/javadb/client.go:56-58`).
  - The five job variables are real flags, `TRIVY_` plus the flag name (`pkg/flag/options.go:367-370`;
    `scan_flags.go:130-137`; `db_flags.go:49-61`).
  - So G1, S3, S4, T8 and T9 hold. Running the binary itself was refused by this session's permission classifier, so
    no command was run against it.
- **The v0.76.1 archive and its checksums file.** The archive is `c7cbe313…c9d0` (52,676,794 B), and its checksums
  file is `885debc4…535d` (download, 07:19:50Z). Its bundle:
  - is v0.3, with one hashedrekord 0.0.1 entry: logIndex 3355009825, `integratedTime` 1792581360
    (2026-10-21T11:16:00Z), with an inclusion promise and an inclusion proof;
  - has one RFC 3161 timestamp;
  - has a message digest equal to the file's SHA-256.

  The leaf carries:
  - the SAN `…/reusable-release.yaml@refs/tags/v0.76.1`;
  - `.1.8` `https://token.actions.githubusercontent.com`;
  - `.1.11` `github-hosted`, and `.1.13` `e713f67f…`;
  - `.1.14` `refs/tags/v0.76.1`, `.1.15` `180687624` and `.1.17` `12783832`;
  - `.1.18` `…/release.yaml@refs/tags/v0.76.1`, and `.1.20` `push` (`openssl x509` on the bundle's leaf, between 07:36:26Z
    and 07:40:05Z).

  14.4's table and 14.3's identity hold.
- **Ancestry.** A full-history, treeless fetch (07:24:09Z) shows:
  - v0.76.0 `531360e5` on `main` and on `release/v0.76`;
  - v0.76.1 and v0.76.2 on `release/v0.76` only;
  - v0.70.0 on `main`.

  So 14.2's conflict is real: `age.ts:525` and `:653-655` would refuse v0.76.1.
  - Aside: a first try from a depth-1 repository answered "`release/v0.76` does not hold v0.76.0". A shallow boundary
    falsifies `--is-ancestor`.
  - P1's `fetchInto` has no `--depth` (`network.ts:142`), and its age repository is separate from the shallow one
    (`network.ts:105-107`), so S6's read is sound.
- **Refs (`git ls-remote`, 07:32:34Z):**
  - `main` is `c22582a1`; `release/v0.76` and `v0.76.2` are `3f6334d2`;
  - v0.77.0 is pending at `release-please--branches--main` `f96377a4`, untagged.
- **#107's five commits and #106's eight files** are as 14.2 says (`gh api`, 07:36:26Z).
- **Pull request states** (`gh api`, 07:29:28Z):
  - #42 merged 2026-11-02T07:34:57Z;
  - #86 merged 2026-11-04T09:20:55Z, #96 at 21:04:17Z, #106 at 08:06:41Z and #107 at 05:58:40Z;
  - #87 to #89 closed unmerged.

  The open set is #129, #126, #124, #123 and #122 (07:32:25Z).
- **#129's hunk and P2's line.** #129's hunk inserts after `package.json:15`. P2's line goes after `:18`, three unchanged
  lines away, so 14.6 holds.
- **Numbers** (grep, between 07:29:28Z and 07:32:25Z):
  - CI-24 to CI-26 are free: the matrix jumps from CI-23 at `test-matrix.md:345` to CI-27 at `:346`, and no fixture
    directory exists.
  - N33 to N42 are free in ADR 0066; N43 is at `:2152`.
  - P38 to P42 are P2's (`lanes/lane-b.md:1240-1241`).
- **The counts add up:**
  - `trivy.test.ts` has 57 cases: 16 + 34 + 7. The 34 are 27 items, with N5 as seven cases and N6 as two.
  - Across the files, 57 + 7 + 2 + 1 + 9 + 8 + 4 + 1 = 89.
  - 9,952 + 89 = 10,041, and 479 + 3 = 482 files.
  - The 12 ★ cases of commit 1 are O1, O2, O3, O4, O8, O9, O12, O14, N2, N3, N9 and N13.

  S3, S4, N2 and N7 below each move the count.
- **The deadline is not a risk.** Today "Action pins" took 2 s on the base's push run (job 128329221777,
  03:30:45Z to 03:30:47Z). It took 12 s on #107's pull request, which changed the checker (job 126410414747). Trivy's
  reads have the 180 s room.
- **No coverage gate binds `tools/`.** The thresholds cover only the branch-gated globs (`vitest.config.ts:118`).
- **The catalog rule admits exact `@sigstore/*` pins.** It binds only catalog packages
  (`no-duplicated-versions.test.ts:124-138`), and exact pins exist already (`apps/worker/package.json:56`).
- **The fourteen "(14)" marks are each true as written.** They sit at `design:735, 748, 792, 829, 936, 939, 944,
  1194, 1197, 1201, 1206, 1257, 1259, 1663`, and none is in §1 to §11.
- **No founder-kept decision is taken.** C7 (`design:435-441`) and 12.5 item 9 (`design:918-923`) define the
  founder-kept "Trivy release-age exclude" as a `trivy` kind that admits a release under the floor. E17 adds no exclude
  and keeps the floor. S3 asks only that its "nothing is loosened" be made true, and that it be stated.

## Should fix

### S1. The job-level `env:` changes the fingerprint of 24 `BOUNDED_VALUES` rows, and 14.7's edit list omits them

**What 14.7 does.** It puts the five `TRIVY_*` variables in a job `env:` block in ci.yml `images`, release.yml `build`
and the dry run's `build` (`design:2005-2012`, `:2037`, `:2049`).

**How #86 fingerprints a step.** #86's fingerprint hashes a `run:` step's env "over its job's over the workflow's"
(`workflows.test.ts:5244-5258`: `const env = inJob.env === undefined && inRoot.env === undefined ? step.env : {
...mapping(inRoot.env), ...mapping(inJob.env), ...mapping(step.env) }`). A changed fingerprint fails with "has a
changed script, env, … its own or inherited … re-check the bound against it" (`:5379-5381`).

**What breaks.** The two `build` jobs hold 24 rows whose refs fingerprint their `image` and `identity` steps:
- the dry run's nine at `:5023-5031` (`identity('854bf72c')`, and `script('build', 'image', '604272e1')`);
- release.yml's fifteen at `:5034-5048` (`identity('854bf72c')`, and `script('build', 'image', 'c5ff17fd')`);
- the `identity` helper at `:4924`.

14.7's list of `workflows.test.ts` edits names only `TRIVY_CMD`'s row, `trivy-bin`'s sites, the write cases and one
new row (`design:2215-2222`). So B2's commit 4, listed as green, fails 24 rows. The builder would then re-fingerprint
release-identity bounds for a variable that never reaches them.

**Fix.** Put the five variables in step `env:` on the steps that run `trivy` instead:
- the database step and both scans in `images`;
- the database step, the scan and the SBOM step in the two `build` jobs.

That leaves the 24 rows, and the install step's inherited env, untouched. It also keeps `TRIVY_*` out of the build,
identity and push steps. O6, O7 and W1 then read step env, and O7 still refuses any other `TRIVY_*` at every level.

If job env is kept, B2's commit 4 must instead list the three new fingerprints and re-read each of the 24 bounds, and
14.7 must say so.

### S2. `@sigstore/verify` 4.1.3 hardens tlog verification; E27 pins 4.1.2 and leaves the bump to Dependabot

**What E27 does.** It pins `@sigstore/verify` 4.1.2 if B1's commit 1 lands before 2026-11-08T00:19Z. Later moves are
left to "Dependabot's npm group" (`design:2319, :2323-2326`).

**What 4.1.3 changes.** The published `dist` of 4.1.2 and 4.1.3 differ only in tlog verification (`npm pack`,
07:27:44Z):
- **The checkpoint.** 4.1.3 verifies a checkpoint only against the authority whose log ID the entry claims ("Bind
  the claimed log ID to the authority that verifies the checkpoint"). 4.1.2 tries every tlog authority in the root
  (`dist/tlog/index.js:87`, and `checkpoint.js:60` matches by key hint alone).
- **The duplicates.** 4.1.3 dedupes entries toward the threshold by log ID and canonicalized body, because "a proof
  does not authenticate the top-level log index" (`dist/verifier.js:111-119`).
- **The upstream commit.** It is sigstore-js `2af33f8`, "fix(verify): tighten transparency log entry checks (#1764)",
  2026-10-29 (treeless fetch of sigstore-js, between 07:28:19Z and 07:29:28Z).

**How much it matters here.** npm's bulk advisory endpoint names no advisory against 4.1.2 (07:28:19Z), so 14.4's "no
advisory" holds. `trivy.ts` requires exactly one entry, and 4.1.2's SET check is bound to the entry's log
(`dist/tlog/set.js:28-29`), so v0.76.1's bundle is unaffected. But the promise-less path that N15 and 12.10 S5 add for
Rekor v2 rests on the checkpoint, which is exactly what 4.1.3 tightens.

**Fix.** Take 4.1.3 under the security ruling:
- `@sigstore/verify` 4.1.3, `@sigstore/tuf` 5.0.1 and `@sigstore/bundle` 5.0.1;
- the transitive `tuf-js` 6.0.2 and `@tufjs/models` 5.0.2.

All are past the floor by 2026-11-08T00:19:33Z: `@sigstore/bundle` 5.0.1 was published at 00:19:33.074Z, not
00:19:17Z (`npm view`, 07:32:35Z). Take them at commit 1 if it lands after that, or else in the fix round, by the same
re-check E25 makes for Trivy. Do not leave the bump to Dependabot. Correct E27's and 14.4's "from 00:19:17Z" to
00:19:33Z for the set.

### S3. E17's "Nothing is loosened" is not true as written

**The claim.** E17 says that `trivy.ts` holds Trivy "to the same floor … and, on CI, by an immutable release's
`published_at` …; it adds the S6 ancestry" (`design:2276-2281`). Two things are loosened against the age rule that
#107 put on Trivy (`de7438c8`):

1. **The branch.** `age.ts:525` and `:653-655` admit only a commit on the default branch. Off it, only a dated
   off-default-branch exclude admits a commit, one release at a time, with a reason. S6 admits every patch commit on
   `release/vX.Y`, standing. Its own residual says a credential that can push to an existing release branch passes
   (12.10 S6, `design:1432-1434`).
2. **The signals.** The age rule takes the youngest of several times:
   - the committer and author dates (`age.ts:549-554`);
   - `verified_at` (`:585-598`);
   - on CI, the arrival on the branch from the activity API (`:424-470`, `:621-623`).

   `trivy.ts` counts only `signed_at` and `published_at`.

**Why the arrival signal matters most.** It is the one time that dates a commit pushed onto `release/vX.Y` after it
was signed. That is how S6's residual would be used: a v0.69.4-shaped signed commit, later pushed onto a release
branch.

**Fix.**
- On CI, `trivy.ts` reads P1's arrival of the pinned commit on `release/vX.Y` (or on the default branch for a `.0`)
  through `api.ts`, best effort with P1's note, and counts it in the youngest. One N-case and one P-case, so +2 tests.
- N36 and Part 6 state the branch difference in these words: "a patch on `release/vX.Y` is admitted without an
  exclude".
- The status file lists E17 as reversing #107's `de7438c8` for Trivy, so the founder sees it. By C7's definition it
  is not the founder-kept exclude, since no release under the floor is admitted.

### S4. Check (8) fails open on an advisory range it cannot parse

**The defect.** 14.3 (8) judges each returned advisory with `ghsaRangeHolds` (`design:1868-1869`; S7,
`design:1449-1450`). That function returns `false` for any constraint it cannot parse, by its own doc comment "an
unread constraint holds nothing" (`age.ts:708`). It returns `false` on an unread bound too (`:720-721`, `if (match ===
null || bound === undefined) return false`). So a reviewed advisory for `github.com/aquasecurity/trivy` whose Go range
uses a form the regex does not take (a `+` build suffix, for example) is read as "does not hold", and the pin passes.

**Why the control does not catch it.** E8's control (`design:1153-1156`) proves only that the query returns two known
advisories. It does not prove that every returned range was understood.

**Fix.** `trivy.ts` parses each returned range strictly. An unparseable range on an unwithdrawn advisory fails the
read: an error on a pull request, a warning on a push, naming the advisory. Add a case to N19, which is +1 test. P1's
own use at `age.ts:777-780` is not P2's to change. Name it as P42's or a new proposal.

### S5. E25's v0.76.2 boundary ignores check (7)'s `published_at`

**The boundary as written.** 14.4 and E25 say v0.76.2 "can be pinned from 2026-11-08T12:47:43Z", which is `signed_at`
plus the floor (`design:1916-1919, :2315-2318`). But on CI, check (7) counts "the youngest of it [`published_at`] and
`signed_at`" (`design:1866-1867`).

**What the assets show.** v0.76.2's assets were uploaded up to Thu, 05 Nov 2026 12:50:24 GMT (`curl -sSIL`, 07:34:49Z:
the checksums file at 12:50:18, its bundle at 12:50:24, the archives at 12:50:05 and 12:50:08). An immutable release
is published after its assets are uploaded, so `published_at` is at least 12:50:24Z, and likely later; it is not
verified, since `gh api` answered 403, 07:34:42Z.

**What follows.** `pnpm trivy:pin` reads no API locally, so it accepts v0.76.2 from 12:47:43Z. A re-pin pushed in that
window turns `static` red on the single fix-round push.

**Fix.** Off CI, `pin-trivy.ts` takes the boundary as the latest of `signed_at` and the release assets'
`Last-Modified`, plus the floor, and says that `published_at` is CI's to read. E25's re-check uses that boundary.
14.4 says "not before 2026-11-08T12:50:24Z; on CI, from `published_at` plus three days (not verified)".

## Nits

- **N1. W1 and W2 can pass vacuously at commit 3.** `isScan` becomes "a `run` starting `trivy image` with
  `--exit-code 1`" in commit 3 (`design:2215`). At commit 3 no step matches, so "every scan gated on both steps" holds
  over an empty set. W1 has the same problem if it finds Trivy jobs by their scans.
  - Fix: W2 first asserts the scan sites (ci.yml `images` twice, release.yml `build`, the dry run's `build`).
  - W1 finds Trivy jobs by "The pinned Trivy" step, as #107's `trivyJobs` found them by the action
    (`workflows.test.ts:3121`).
- **N2. `install.test.ts` "9" against the moved test.** #107's fourth test (`workflows.test.ts:3210-3246`) "moves to
  `install.test.ts`" (`design:2098-2099`). I1 to I9 do not say which of them it becomes. If it stays a tenth case, the
  total is 90. Fix: name it as I3 (or I3 and I8 together), or recount.
- **N3. Case 9 must read the scripts from the repository, not `CI_ROOT`.** `scanned()` reads workflows, Dockerfiles and
  compose from `CI_ROOT`, and `README.md`, `CLAUDE.md` and `install-pnpm.sh` from `repositoryRoot`
  (`no-duplicated-versions.test.ts:35-43`). `CI_TREE` copies only `.github`, the Dockerfiles and compose
  (`workflows.test.ts:6081`, run at `:6144`). So `tools/trivy/install.sh` and `db.sh` belong in the `repositoryRoot`
  list at `:41`, or the simulated-rewrite runs fail with ENOENT.
- **N4. Part 6's "answers without editing" list misses two Amendment lines.** The list is at `design:2110-2114`. It
  omits:
  - ADR 0066 `:783-786`: one install step, "word for word the same" in three jobs, writing `TRIVY_CMD`. P2 makes
    ci.yml's step differ, with a second argument, and drops `TRIVY_CMD`.
  - `:787-788`: the curl admits `file:` "for the tests' mirror", which E20 removes.

  Also, the reviser's report says only ADR 0066 `:1233` names `TRIVY_CMD`. `:784` does too (grep, between 07:24:10Z and 07:29:28Z).
- **N5. E23's claim about the path rests on actions' own code.** E23 says the scans run `trivy` from "the first entry
  the runner puts on it" (`design:2309-2312`).
  - This holds for the repository's own writes, since the path write is one entry in a closed map
    (`workflows.test.ts:4019-4027`).
  - An action's own `core.addPath` is not read (`:3997-3998`), and setup-buildx and build-push-action run between the
    install and the scans. #107 ran Trivy by its absolute path.
  - Fix: state this as not verified. Optionally, the database step asserts `command -v trivy` equals the installed
    path, which the install step can pass as an argument.
- **N6. §1 still describes the archive's bundle.** E18 and E19 change T2 and T4: the checksums file becomes the signed
  object, and arm64 is verified. But T2 and T4 in §1 still say "the tarball's Sigstore bundle" and "the Linux x64
  tarball's SHA-256" (`design:30`, `:32`). §12 left "(12)" pointers in §1 to §11. Add "(14) E18, E19" pointers
  there so the acceptance rows read right.
- **N7. `pin-trivy.ts` has no case.** It writes the source of record, `release.txt`, yet 14.7's list has no test for it.
  Add one `trivy.test.ts` case: with the synthetic root, it writes exactly the five keys that `trivy.ts` then accepts
  (+1).
- **N8. The archive cache brings a cache restore into `images`.** Before P2, `images` restored nothing
  (`ci.yml:668-750`).
  - `@actions/cache` extracts with `tar -P` (6.3.0, `lib/internal/tar.js:75-87`; `npm pack`, 07:40:05Z). Which version
    `actions/cache` v6.1.0 bundles is not verified.
  - So an entry under the predictable key `trivy-v1-<hash>` can write outside `trivy-archive`. Any job of a build-branch
    push run can save one.
  - This is the same surface as ci.yml's other caches. But Part 6 and C8 should weigh it in so many words, not only "a
    bad entry", against C8's reason, a withdrawn release.
- **N9. The database has one source now.** Trivy's default is `[mirror.gcr.io, ghcr.io]` with fallback
  (`pkg/flag/db_flags.go:56` at v0.76.1). T7 takes ghcr.io alone.
  - So an outage of ghcr.io, or of `pkg-containers.githubusercontent.com`, now turns a push run's `images` red where
    0.70.0 had a second source.
  - It is deliberate (C3). §10 and ci.md's triage should say "re-run; not the checker's" and name the lost fallback.
- **N10. A Dependabot bump of `@sigstore/*` re-runs no live verification.** `everyPin` follows only changes under
  `tools/check-action-pins` (`base.ts:78-80`), and a lockfile bump is outside it. The synthetic `trivy.test.ts` cases do
  run on such a pull request, which covers the library's behaviour. Optionally, count a lockfile change to
  `@sigstore/*` or `tuf-js` as a checker change.
- **N11. Mutation shards can be predicted.** P4's rule reads a root `scripts` entry other than an install script as
  inert (`tools/stryker/manifests.ts:279-288`). The `devDependencies` entries are judged one by one. So 14.7's "not
  verified" can become "expected: none for `trivy:pin`; the `tools` importer's entries as `affected.ts` reads them".
- **N12. B2 cannot be green alone.** B2 works in parallel in a worktree cut from 8a722f80 (`design:1994-1997`), but its
  tests need B1's five-key `release.txt` (`design:2093-2094`). Say that B2 runs its commit-4 suites after
  cherry-picking onto B1's commit 2, or with B1's `release.txt` copied in uncommitted.
- **N13. Comments that become false need listing.** None of these is in B1's or B2's list:
  - `tools/trivy/install.sh:5-8`: "keeps no cache", and `TRIVY_DOWNLOAD_BASE`;
  - `base.ts:24-28`: "each release.txt's version line, aged as an action pin is";
  - `releases.ts:7-13`;
  - `tools/trivy/release.txt:1-4`: "trivy-action v0.36.0's default version".
- **N14. The `HIJACKED` digest covers x64 only.** It refuses v0.69.4's x64 archive digest on either line
  (`design:1871`). Check (4) makes arm64 safe for any other version. Still, name v0.69.4's arm64 digest too, or say why
  x64 alone suffices.

## Count after the fixes

These fixes add tests:
- S3 adds 2 (an arrival case, and one on a push);
- S4 adds 1;
- N7 adds 1;
- N2 adds 1 if the moved test stays separate.

That makes 93 or 94 new tests, still 482 files. If S1 takes step env, no row count changes in `workflows.test.ts`. The
integrator records the exact numbers, as 14.7 already says.
