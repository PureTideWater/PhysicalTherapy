# records part: what the documents must now say

This covers phi-screen F3 = security S3, F4, F7, F6 = security S4, N1 and N2, and the security nits on the stub claim and the testing-module lint. Every line reference is to docs/adr/0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md at head 9b7eadfe unless it says otherwise. Other parts may renumber the departures; take my numbers as "next".

## ADR 0070 Part 3

### "Where it runs, and why no caller can skip it" (567 onward)

- **575, the registry.** "which code elsewhere can neither add to nor forge" must be limited to what a caller passes. Write: "which code elsewhere can neither add to nor forge through anything it passes the gateway".
- **New bullet after the registry bullet (F6/S4).** **The purposes' specs are frozen.** Two layers stop the contract screen from being removed or replaced:
  - At run time: `PURPOSE_SPECS` and each spec are frozen when `src/specs.ts` loads, so assigning or deleting the screen throws a `TypeError`.
  - At compile time: `PurposeSpec`'s `prepare`, `screen` and `verify` are readonly properties (`src/spec.ts`), so the same assignment or delete does not compile.
  - `PURPOSE_SPECS` is no longer exported from the package's entry. `requestFor` and the gateway's methods are the surface. `specs.test.ts` holds all of this.
- **590-593, "Test helpers stay in tests".** Replace the last sentence with the following points:
  - `lint.test.ts` holds that only test code reaches `src/testing.ts`. Test code means tests, their support files, the generated route tests, the e2e and `eval/`. A `test-support/` or `route-tests/` directory counts only outside the web's route tree (`apps/web/src/app/`), where Next serves a page or route by its path though nothing imports it.
  - The guard follows every static import, re-export (`export … from`), side-effect import, dynamic import and `require`, in any quotes (a template literal without a substitution too).
  - It resolves relative paths and workspace packages through their `exports`, and follows the chain transitively. So a production module that imports a test-support module that re-exports `testing.ts` is refused.
  - A specifier computed at run time is not followed. No source outside `tools/test` uses one.
  - `syntheticRecordsCheck` is no longer exported from the package's main entry. Tests and the evaluation outside the package take it from `@tp/model-gateway/testing`. `lint.test.ts` holds its callers to `testing.ts`, `eval/` and tests.
- **594-602, "Bound to the caller's scope" (N2, the security nit).** The last sentence, "A runner scoped to another practice, or a stub that returns nothing, cannot be supplied", is false for the stub. Replace it with:
  - A runner scoped to another practice cannot be supplied.
  - The scope and the pool are taken by their shape, because `packages/db` brands neither. So the check cannot tell a stub pool that returns nothing from a real one, and `testing.ts`'s memory pool is such a pool.
  - No production caller supplies one. `lint.test.ts` holds every naming of `practiceRecordsCheck` outside a test to five files:
    - the web's proposal, `apps/web/src/lib/models/contract-proposals.ts`, whose one call it pins to `authorizedBy: scope, pool: services.modelPool`;
    - the worker's permitted run, `apps/worker/src/models/permitted.ts`, pinned to `authorizedBy: scope, pool: services.pool`;
    - `src/testing.ts`;
    - the definition and the entry (`patient-records.ts`, `index.ts`).
  - An unforgeable scope brand (`packages/db/src/authz/scope.ts`) and a pool brand (where the services build their pools, `apps/web/src/lib/server/services.ts`, a #42 file) are named as the way to refuse a stub in the check itself. Neither needs a migration.
- **The opened-scope assertion (departure 6, N1).** Say that it is defensive: `withJobScope` builds exactly that scope today. Say the same of `screenContractPages`' `default:` branch, which answers `screen_failed` for any outcome outside the four. `patient-records.test.ts` reaches both, the assertion through a tampered job scope and the branch through a check made to pass as issued.

### "The algorithm", the **Records** bullet (611-618; F3 and F7)

Replace the bullet's opening and its posting sentence:

- **Records** (`readContractScreenRecords`, in the check's own job scope after the bound's count, then `decryptContractScreenRecords` after that scope has committed). The reads use `readWithAudit`, return the rows as stored (ciphertext) and are audited in the scope:
  - `patient_ref (id, practice_id, member_id)`, where the practice matches and the member ID is set;
  - `claim (id, practice_id, patient_control_number, payer_claim_control_number)` for the practice;
  - `posting_row (id, practice_id, claim_reference)` for the practice's posting lines whose claim reference is set and that no claim-level posting match covers (`POSTED_ONLY`: no `ledger_match` of kind `posting`, level `claim`, for the row, standing or reversed).
- Only after the scope commits is each value decrypted (`patient_ref.member_id`, `claim.patient_control_number`, `claim.payer_claim_control_number`, `posting_row.claim_reference`) and taken in its compact form. A posting line's claim reference is kept as a patient control number (floor 8).
- Why claim-matched lines are left out: a line with a claim-level match was matched by its reference's exact equality to that claim's own patient control number. That holds for the reconcile job and for a person's match alike (`apps/worker/src/reconcile/postings.ts` `claimsWithReference`, which `manual.ts` uses too), and the claim cannot be deleted while the match exists. So its number is read from `claim`. Leaving those lines out keeps a line-level export, with one row per service line, from spending the bound on numbers already read.
- What the posting read finds: the claim of a paper check (workers' comp, auto, small commercial payers), or a posting period whose 835s were never loaded, such as a year of history at onboarding. That number is held nowhere else.
- Delete "The posting export's claim reference is a patient control number already in `claim`". Keep "group numbers are not read: a contract carries them legitimately".

### "The bound" (640-646; F4 and F7)

Replace "the practice's member IDs plus two per claim (a count, not PHI)" and "That bounds the audit rows, the decrypts and the plaintext held in one process per check" with:

- The count covers the practice's member IDs, two per claim and one per posting line the screen reads (above). It is one statement, so its three counts read one snapshot. It is a count, not PHI.
- Each read is itself capped at what the bound leaves of it, plus one row (`LIMIT`). A read that passes the bound answers `screen_unavailable` with nothing decrypted, and nothing after it is read.
- So rows that commit between the count and a read (an 835 load, a posting export) are never read past the bound by more than that one row (two identifiers). The audit rows, the decrypts and the plaintext held in one process per check are bounded whatever commits meanwhile.

### "Any error fails closed" (650-653; F3)

Replace the first sentence with:

- An error while reading (the scope, the count, a query) rolls back with nothing decrypted and answers `screen_failed`.
- The job scope commits the reads, with their audit rows, before any value is decrypted. So a value that does not decrypt answers `screen_failed` with every read audited, and a `COMMIT` that fails leaves nothing decrypted.
- In every case the call is refused, never sent, and nothing of the error leaves the check.

### "Read as the screen, not as the person" (655-662; F3)

After "Every returned row is audited, one `audit_event` per row", add: "and no value is decrypted before its read's audit row has committed".

### "What is recorded" (700-706)

Replace "one row per `patient_ref` and `claim` row returned … at most the bound's number" with: "one row per `patient_ref`, `claim` and `posting_row` row returned, actor the service screen ID, purpose `contract_screen`, at most the bound's number plus one row (above), kept on `screen_failed` after a read as on any other outcome".

### "What it gives up" (728-750)

- **Not caught (736).** Replace "a patient the practice has never been paid for (no `patient_ref` or `claim` row yet)" with "a patient the practice holds no record of yet (no 835 claim, no `patient_ref` with a member ID, and no posting line)".
- **New bullet, "The guards' reach" (F6/S4 and N2).**
  - The guarantees hold against what a caller passes the gateway, and against code that compiles and passes the lint.
  - They do not hold against code in the gateway's process that deliberately rewrites the gateway's prototype (`ModelGateway.prototype.screen`) or a built-in (`WeakSet.prototype.has`, `Set.prototype.has`). Such code can skip the screen, as it could call a provider directly. No module can stop that; code review and the lint rules that keep model calls in the gateway cover it.
  - The check does not refuse a stub pool itself; `lint.test.ts` holds its callers (above).
- **Refused whole (744).** "every contract of a practice above 50,000 identifiers (its posting lines with no claim match counted), and of one whose rows pass the bound between the count and the read (`screen_unavailable`)".
- **The audit trail (745-748).** Keep it as written, and also say: "A screen whose decrypt fails keeps every read it made (they commit first)." Do not add the F3 gap: it is fixed.

### "Where the build departs from the design" (774 onward; new entries)

- **N+1. The posting export's unmatched claim references are read** (F7). The design (5.3, and lane-b-model-eval-gate.md:960) said every posted claim's PCN is already in `claim`. That is false for a paper check's claim and for a posting period whose 835s were never loaded: `posting_row` has no foreign key to `claim`, `postingDecision` answers `unmatched` for them, and `patient_ref` is written only from 835s. The build reads every line with a reference and no claim-level match.
- **N+2. Each read is capped at the bound** (F4), besides the design's count. The count and the reads run at READ COMMITTED in different statements, so rows committed between them would be read past the bound.
  - The cap holds whatever the isolation level and needs no `packages/db` change.
  - REPEATABLE READ (a `withJobScope` `oneSnapshot`) would make the count and the reads agree, but it is not needed for the bound, so it is not taken.
  - A length check after the read alone would not bound the audit rows, which are written by then.
- **N+3. The reads commit before any decrypt** (F3): two functions, where the design decrypted inside the scope.
- **N+4. The specs are frozen and readonly, and `PURPOSE_SPECS` and `syntheticRecordsCheck` are off the package's main entry** (F6/S4, N2).
- **N+5. `lint.test.ts` holds the factories' callers and the testing module's whole reach** (N2, the security nits). This extends departure 19.

### "Alternatives considered" (825-836)

Add two rows:

| Option | Why not |
| --- | --- |
| REPEATABLE READ for the screen's job scope (`withJobScope` `oneSnapshot`) | A `packages/db` change. The read's own cap bounds what is read and audited whatever the isolation; one snapshot would only make the count and the reads agree |
| A length check after the reads | `readWithAudit` has written every audit row by then: it bounds the decrypts, not the reads |

### "Consequences" (850)

"each proposal decrypts and audits every identifier of a practice below the bound": add "(its member IDs, its claims' two numbers and its posting lines with no claim match)".

### "Tests (test matrix MOD-12)" (866-898)

- **`src/patient-records.test.ts`**. Add:
  - the scope refusal when `access()` answers but `practiceIds` lacks the practice;
  - the reads committing before every decrypt;
  - a decrypt fault keeping every read audited;
  - a patient control number held only in a posting export found, under its floor;
  - a practice of exactly 50,000 identifiers across the three kinds read whole;
  - rows passing the bound after the count, for each of the three reads: `screen_unavailable`, at most one row read past the bound, nothing after it read, nothing decrypted;
  - each of the four conditions of the opened-scope assertion;
  - `screenContractPages`' `default:` branch.
- **`src/patient-records.db.test.ts`**. Add, on the web's and the worker's logins:
  - a claim that no longer decrypts after others that do: `screen_failed`, values decrypted, and every read audited (2 member IDs, 3 claims, 1 posting line);
  - 1,000 claims committed right after the count of a practice at the bound: `screen_unavailable`, 25,001 claim reads, the late claim never matched;
  - a paper check's posting line found, and the line matched to a claim not read (by its audit rows).
- **New: `src/specs.test.ts`**:
  - the map and every spec frozen, and the contract spec's screen is `screenContractPages`;
  - assigning or deleting the screen, `prepare` or the map's entry throws a `TypeError`, and is a compile error (`@ts-expect-error`);
  - a contract naming a held member ID still refused after such an attempt;
  - neither `PURPOSE_SPECS` nor `syntheticRecordsCheck` on the package's entry.
- **`src/lint.test.ts`**. Add:
  - the testing module reached by nothing but test code, through any import form, transitively, with a self-check over a synthetic graph;
  - what counts as test code, with its own check: a support directory inside the web's route tree does not;
  - `practiceRecordsCheck` named only in its two production callers (each call's arguments pinned), `testing.ts`, the definition, the entry and tests;
  - `syntheticRecordsCheck` only in `testing.ts`, `eval/` and tests.

## docs/product/test-matrix.md:231 (MOD-12)

- After "a member ID, payer claim control number or patient control number the practice holds", add "(from its 835s, or a posting export's line no claim carries)".
- After "a practice above the bound", add "(or one that passes it while the screen reads)".
- After "a check that cannot read the records, refused", add "with every read it made audited".
- Add `packages/model-gateway/src/specs.test.ts` to MOD-12's assertedBy in the synth registry, if the registry lists the gateway's test files.

## docs/product/reconciliation-001.md:263 (red team brief, item 16)

- Add to the attacks:
  - a paper payer's EOB naming the practice's account number, held only in a posting export, refused as `names_patient`;
  - a practice whose 835 load commits while the screen reads, refused as `screen_unavailable` with no more than one row read past the bound.
- Add to what the check gives up: in-process code that rewrites the gateway's prototype or a built-in.

## The design (/home/user/ops/designs/lane-b-model-eval-gate.md:960; ops, not the repository)

"every posted claim's PCN is already in claim" is false. The posting export's lines with no claim-level match are read (departure N+1 above).

## apps/web/src/lib/models/contract-proposals.ts:53-54

"joins it to every read the screen made" is now true as written, since the reads commit before any decrypt. No change.
