# content/outgoing

Content releases prepared for publication (PRD section 9, step 3). The `/load-release` skill
(`pnpm release:assemble <n>`) assembles the next release here from the drafts at L2 or higher, listing any it
left out in `RELEASE.md`; `pnpm release:dry-run <n>` lists what it changes and the runs it would change. CI
publishes it on merge.

## Layout of a prepared release

```text
content/outgoing/<n>/
  RELEASE.md        date, records, sources, who verified them, coverage against the release before, and the
                    impact on existing runs
  COVERAGE.md       what each content is loaded for, and what the release covers less than the one before
                    and why (content/sources/README.md, "Coverage"); the content checker recomputes it
  MANIFEST.json     the SHA-256 of every other file in the directory
  <type>/<year>/... the rule records and second passes at L2 or higher, copied from content/drafts
```

`MANIFEST.json` is `{ "release": <n>, "files": { "<path relative to this directory>": "<sha256 hex>" } }`
and must list every file in the directory except itself (docs/adr/0003-content-release-manifest.md).

## Publication

On every push to main that touches this directory, `.github/workflows/publish-content.yml` runs
`pnpm verify-content content/outgoing/<n>` on each prepared release (the full content checker, which refuses any
record below L2), then `tools/publish-content.sh`, which for each `<n>` in numeric order:

1. refuses a number reserved for SYNTHETIC fixture releases (900000 and up);
2. verifies the directory against `MANIFEST.json` with `tools/verify-release-manifest.sh` (every file
   listed, nothing extra, every hash matching, the release number matching the directory);
3. refuses any record below L2 or marked synthetic, a second check behind the content checker;
4. refuses a number that is already published or tagged;
5. moves it to `content/releases/<n>/`, commits `content: publish release <n>`, and tags
   `content-release-<n>`.

Published releases are immutable: `tools/check-releases-immutable.sh` fails any pull request that changes a
file under an existing `content/releases/<n>`, or adds a `content/releases/<n>` by hand. Nothing but that
workflow ever writes `content/releases`.
