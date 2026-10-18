---
name: load-release
description: Assemble verified rule-record drafts into the next numbered content release and show the impact on existing runs. Never writes content/releases; CI publishes on merge.
disable-model-invocation: true
allowed-tools: Read Write Edit Bash(pnpm release:*) Bash(git *)
---
1. List drafts under content/drafts at L2 or higher; refuse any record without a source hash.
2. Copy them into content/outgoing/<next>/ with RELEASE.md (date, records, sources, who verified) and
   MANIFEST.json of SHA-256 hashes. content/releases is read-only here, by design.
3. Run pnpm release:dry-run <next> against the staging snapshot and paste the list of runs whose lines change.
4. Open a pull request titled "content: release <next>" with the impact list. Do not merge.
