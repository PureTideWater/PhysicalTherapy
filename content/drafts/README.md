# content/drafts

Draft global rule records: the public, practice-independent content the engine prices from (PRD section 9).
Contract rate records are never here; they live in the database under each practice's policy.

## Where a draft fits in the release pipeline

1. **Draft** (this directory). A record is drafted under `content/drafts/<type>/<year>/` with the
   `/new-rule-record` skill, from a source file stored under [`content/sources/`](../sources/README.md).
   CMS tables are loaded by parser, never typed; anything typed by hand is transcribed twice and diffed.
2. **Check.** `pnpm verify-content` runs the content checker; CI runs it on every pull request. It refuses a
   release when any record lacks a source, any effective window overlaps another for the same key, any
   numeric field fails its range, or any quote does not appear in the stored source text.
3. **Prepare.** The `/load-release` skill copies drafts at verification level L2 or higher into
   [`content/outgoing/<n>/`](../outgoing/README.md) with `RELEASE.md` and `MANIFEST.json`, and opens a pull request.
4. **Publish.** On merge to main, CI (`.github/workflows/publish-content.yml`) verifies the manifest, moves the
   release to `content/releases/<n>/` and tags it `content-release-<n>`. Nothing else writes `content/releases`.
5. **Load.** The worker loads the release into the global tables; new pricing runs pin it, and a re-run of an
   older run under it lists the changed lines before anyone accepts it.

## Record types

`pfs_rvu`, `pfs_gpci`, `conversion_factor`, `mppr_rate`, `therapy_threshold`, `assistant_modifier`,
`sequestration`, `ncci_ptp`, `ncci_mue`, `carc`, `rarc`, `claim_status_code`, `state_prompt_pay`,
`dispute_window`, `locality_map`.

Every record carries `source` (title, URL, retrieved date, SHA-256 of the file), `effective_from`,
`effective_to`, `verification` (L1 script-checked, L2 read against the source by a person, L3 confirmed by a
reimbursement specialist) and `notes`. The schema is `packages/rules/src/schema.ts`.

## Rules for this directory

- Public sources only. No PHI, no contract, no remittance, ever.
- No value is typed from memory. Numbers come from the stored source file, by parser where the source is a table.
- Synthetic reference data used for tests is labelled SYNTHETIC in its source metadata and is never presented as
  CMS data.
