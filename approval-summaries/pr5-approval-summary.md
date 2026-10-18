# PR 5: the schema change to approve (packet deadline and export sign-off)

**Document:** `docs/product/domain-model.md` on branch `co-001/pr-05-packet-deadline`, head `eda61d7`. It is regenerated and **not yet approved**.

**SHA-256 to sign:** `6435faddc07eb3626848cccc64aff3cd2d7647281256b68a724561334da02673`. The repository's own approval code computed it (`pnpm db:domain-model --check --require-approval` prints it, and so does `documentSha256()`). It covers every line of the document except the provenance line and the approval line. Until you sign, exactly one database test fails: the approval check.

## What changes

The change is one migration, `20261103090000_deadline_verification_and_export_attestation`. It adds no new table.

**Contract versions**
- `dispute_window_evidence`: where the contract states its dispute window, given as the document, the page, the exact words and the page's fingerprint. It is empty on every existing contract.
- `dispute_window_verified_by` and `dispute_window_verified_at`: the contract specialist who checked those words against the page, and when.
- Rules:
  - The evidence must be complete and must come from one of the version's own documents.
  - Only a specialist can check it, once, in their own name.
  - Any later edit clears the check.
  - A version whose window is cited but not checked cannot be approved.
  - After approval the evidence is frozen, like the version's other terms.

**Packet versions**
- `deadline_verification_status`: verified, unverified or not applicable. The database computes it from the packet's own content, and no one can type it in. Older packets read "unverified".
- `export_verifier_report`: the result of running the figure checker again over exactly what the export printed.
- `attested_by`, `attested_at` and `attestation`: the reimbursement reviewer's sign-off. It covers the PDF's and the CSV's fingerprints and a checklist of codes, with no free text.
- **Guard when a version is written:** each line's deadline and calculation must match the stored pricing record exactly, or the version is refused.
- **Guard at export:** the export is refused if the deadline is not verified, if the version is not at the case's current dispute level, or if there is no passing checker report. Postgres enforces this, and the application's database role cannot turn it off (tested).
- **Guard at sign-off:** only a reimbursement reviewer can sign, once, in their own name, after the export, and with a deadline that is not unverified. Anyone who drafted, edited or approved any version of that packet cannot sign.

**Submissions**
- A submission can be logged only for an export that has been signed off.

## Why
- **D15:** the change is made to the existing milestone 8 packet, so there is no second export path.
- **D16 (a) plus (c):** you sign off over the export's fingerprints as reimbursement reviewer, under a support grant, the same way you sign audit reports. Where a practice has its own users, one of them approves the packet and you sign off. The person who drafted a packet never approves it, and internal users still approve nothing else.
- **D17 (a):** a deadline counts as verified only when it rests on something a person signed off:
  - for Medicare and Medicare Advantage, a rule record at L2 or higher (L3 for E3);
  - for a contract, the contract's own window, with its page, words and fingerprint checked by a specialist.
  - A release's commercial default is never verified.

## What it does not change
- **Pricing:** no file under `packages/pricing/src` changes.
- **Golden lines:** `fixtures/golden` is identical byte for byte, and `test:golden` passes.
- **Releases:** 900001 to 900004 are identical byte for byte. A new SYNTHETIC test release, 900005, is added the same way 900004 was.
- **Ledger:** no ledger table is touched, and "recovered" still counts only posted or deposited entries.
- **Row-level security:** no policy or RLS setting changes. The catalog and cross-tenant tests pass.
- **PHI registry:** no row is added. There are still 79 tables, 44 of them registered.

## Actionable totals will fall, as approved

No existing contract version has window evidence. Their lines therefore wait as "Deadline not verified" until a specialist cites and checks the window on a corrected version. Medicare and Medicare Advantage lines also wait unless their rule record is at L2 or higher. This is what D17 (a) means: "verified" must rest on a source a person signed off.

AUDIT-01 shows the effect:
- With its two windows' evidence: $280.00 actionable on 8 lines.
- With the same inputs and no evidence: $0.00 actionable, and all 18 validated lines ($553.00) wait.
- Flagged and validated figures do not move.

## Divergences
- **Sections A and B:** nothing new. There are still 23 divergences to approve.
- **C2 and C3 (rewritten):** they now say which part is built.
  - **C2:** the export's checker report and the sign-off live on `packet_version`, not on a separate `packet_export` table.
  - **C3:** `deadline_verification_status` is built as text with a CHECK, because the schema uses no Postgres enums. The roles and `readiness_grade` are still to come.
- **Section D:** 8 new columns are listed as "not in the Data dictionary". These are for information only.
- **Changed wording:** the approval paragraph now says that approving also approves any part of C2 to C5 whose status says it is built.

## Safe while the previous version of the app is running: yes (tested)

I ran PR 4's own code in a scratch copy:
1. It wrote, approved, exported and submitted packets on the old schema.
2. The migration then ran over that live data:
   - existing versions became "unverified";
   - stored exports were kept;
   - contracts were not touched.
3. Afterwards PR 4's code went on writing packet versions, creating contracts, pricing and opening cases.

It was refused only in two places:
- exporting a packet that had not yet been exported, because its deadline is not verified;
- logging a submission of an export nobody has signed off.

Both refusals are what D16 and D17 require. The migration briefly locks the small `packet_version` table while it adds the computed column. Run the migration before deploying the new version (ADR 0049).

## PR 4

This document also contains PR 4's schema (ERA export intake, migration `20261102090000`). You approved that part on 2026-10-18 (hash `374a7b83…`), and PR 4 has since been merged into `claude/build-platform`. It is unchanged here. Because PR 5 changes the text, the generator reset the approval line, and the new hash covers PR 4's part together with PR 5's. Signing it approves both.
