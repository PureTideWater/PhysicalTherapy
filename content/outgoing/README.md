# content/outgoing

Content releases prepared for publication (PRD section 9, step 3). The `/load-release` skill
(`pnpm release:prepare`) assembles the next release here from verified drafts; CI publishes it on merge.

## Layout of a prepared release

```text
content/outgoing/<n>/
  RELEASE.md        date, records, sources, who verified them, and the impact on existing runs
  MANIFEST.json     the SHA-256 of every other file in the directory
  <type>/<year>/... the rule records, as drafted in content/drafts
```

`MANIFEST.json` is `{ "release": <n>, "files": { "<path relative to this directory>": "<sha256 hex>" } }`
and must list every file in the directory except itself (docs/adr/0003-content-release-manifest.md).

## Publication

On every push to main that touches this directory, `.github/workflows/publish-content.yml` runs
`tools/publish-content.sh`, which for each `<n>` in numeric order:

1. verifies the directory against `MANIFEST.json` with `tools/verify-release-manifest.sh` (every file
   listed, nothing extra, every hash matching, the release number matching the directory);
2. refuses a number that is already published or tagged;
3. moves it to `content/releases/<n>/`, commits `content: publish release <n>`, and tags
   `content-release-<n>`.

Published releases are immutable: `tools/check-releases-immutable.sh` fails any pull request that changes a
file under an existing `content/releases/<n>`. Nothing but that workflow ever writes `content/releases`.
