# 0003. Content releases carry a MANIFEST.json of SHA-256 hashes that CI verifies before publishing

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 9 (the release pipeline), 18 (continuous integration)

## Context

PRD section 9 has the `/load-release` skill prepare a release under `content/outgoing/<n>/` with a
`MANIFEST.json` of SHA-256 hashes, and CI move it to `content/releases/<n>/` on merge, record the manifest
hash and tag the release. The plan does not fix the manifest's shape, and the preparing side (milestone 0
part B) and the publishing side (this milestone) need one contract.

## Decision

`content/outgoing/<n>/MANIFEST.json` is:

```json
{ "release": 1, "files": { "RELEASE.md": "<sha256 hex>", "pfs_rvu/2026/records.json": "<sha256 hex>" } }
```

- `release` equals the directory number `<n>` (a positive integer).
- `files` maps every other file in the directory, by its path relative to the directory, to the lowercase hex
  SHA-256 of its bytes. Nothing may be missing or extra; paths may not leave the directory; no symbolic links.
- `tools/verify-release-manifest.sh` enforces all of this. `tools/publish-content.sh`, run by
  `.github/workflows/publish-content.yml` on every push to main that touches `content/outgoing`, verifies each
  release in numeric order, refuses a number already published or tagged, moves it with `git mv`, commits
  `content: publish release <n>` with the manifest's own SHA-256 in the body, and tags `content-release-<n>`
  with the same hash. The workflow pushes only after every release verified.
- `tools/check-releases-immutable.sh <base>` (CI, every pull request) fails if any file under a release that
  exists on the base ref is changed, deleted, added or left untracked.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A list of `{ path, sha256 }` objects | Equivalent; the map makes duplicate paths impossible |
| Hashing the directory as one archive | A single changed file could not be named in the failure |
| Publishing from the pull request branch | Releases would exist before review finished; publishing on main keeps the reviewed commit the source |

## Consequences

- The release tooling of part B writes exactly this shape; the tests in `tools/test/` pin the verifier's
  behaviour.
- The manifest hash in the tag and commit is what `rule_release.manifest_sha256` records when the worker loads
  the release.
