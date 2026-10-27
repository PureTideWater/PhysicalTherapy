# PART integrate: PR #75 fix round (co-001/contract-phi-check, on 9b7eadfe)

Worktree /home/user/contract-phi-check. Every value is synthetic. No migration, no #42 file, nothing pushed.
Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/fix-integrate.md.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/integ/.

## 1. Requests between parts

| Request | Applied? |
| --- | --- |
| tokenizer 1: `patient-records.ts` import, `ScreenSet.joins`/`index`, `screenSet`/`pagesName` stream (required) | Applied with the part's own `apply.py` (each old text found once) |
| records 1: `gateway.test.ts:379` `postings: 1` | Already applied by the gateway part |
| records 2: comment on `screenContractPages`' `default:` | Applied (`contract-terms.ts:523-524`) |
| records 3: freeze each spec where defined; `Object.freeze(ModelGateway.prototype)` | Applied to all four spec modules (`Object.freeze<PurposeSpec<…>>({…})`, since a bare `Object.freeze` loses the contextual typing) and the prototype. Also froze each gateway instance (`Object.freeze(this)`), since an instance's own property would otherwise shadow a frozen prototype method. Tests in `specs.test.ts` (fresh module graph without `specs.ts`; prototype and instance): before 2 failed and 4 passed, after 6/6. The optional deep freeze of `PROMPTS` was not done: it guards Part 2's gate, not this part's screen, and the provider adapters' use of the schema objects has to be checked first. Listed as P13. |
| records 4: `screen_failed` reads assertion; the two-example decrypt test in `permitted.db.test.ts` | Already applied by the gateway part |
| records 5 (REPEATABLE READ) | Not requested; not applied. The read's cap bounds the reads whatever the isolation, and one snapshot would hide a claim committed after the count. Recorded as an alternative in the ADR. |
| records 6 (scope and pool brands) | Outside this PR (`packages/db/src/authz`, plus a #42 file). Listed as P12. |
| gateway 1: `contract-terms.ts` order doc | Applied, with "(gateway.ts, step 8; the review's S1)" rather than "steps 4 to 9", since step 8 is the screen |
| gateway 2: `spec.ts` screen doc | Applied |
| gateway 3: `patient-records.ts` docblocks | Applied |
| gateway 4 / ux 3: `screen_limited` | Applied: `SCREEN_LIMITED_PROBLEM = 'screen_limited'`, its comment and the module comment (UX's wording, re-wrapped), and the limits loop's redirect in `models-routes.db.test.ts`. UX's notice words were taken over the gateway part's: "patient details" would name the records a second way, and "in an hour" is false once a day limit is reached. |
| gateway 5, 6, 7 | After #42 / Lane A. Listed in the ADR as P10 and under F3. |
| ux 1: `era-exports.spec.ts` | Applied exactly. It passes in the e2e run (below). |
| ux 2: `models-routes.db.test.ts` `screen_failed` case | Applied. Also corrected its comment to name both codes (`MODEL_INPUT_SCREEN_FAILED` apart from `MODEL_INPUT_SCREEN_UNAVAILABLE`). |
| ux 4 (optional): the gateway's internal sentences | Applied: "this document holds an identifier from the practice’s patient records and was not sent" and "this document could not be checked against the practice’s patient records and was not sent". Their doc comment no longer says a person reads them (the person reads the notice). `contract-terms.test.ts` and `path.test.ts` were updated to match. |
| ux 5 | Named, not requested (UX PR 24) |

## 2. Adversarial re-read of 9b7eadfe..worktree

I read the whole diff:
- the tokenizer's ring buffers, hashes and index (slots never reused within a run, the hash formula exact, a hash hit always confirmed by an exact lookup);
- the records' caps (at most 50,000 identifiers plus one claim's two read; nothing decrypted before COMMIT);
- the gateway's order;
- the web's limits and the remembered refusal (keyed by practice, document and pages, holding no match);
- the uploader (re-checks the batch's problems with the chosen kind at Upload);
- the lint guards.

**One new bypass, introduced by this round and fixed (I1).**
- **The gap.** `CallContext.beforeScreen` is caller code that runs between `checkContext` and the screen. `limited()` had destructured `practiceId` before it, but `screenContractPages` reads `context.practiceId` again. A step that changed the context's practice therefore made the screen accept a check issued for another practice, one holding none of the document's identifiers, while the budget, the hold and the `model_call` row stayed with the first practice.
- **The proof.** A test showed the call sent: the harness's provider was reached, giving `ModelCallFailedError`.
- **The fix.** `gateway.ts` `callContext()` reads the context once and freezes the copy in `run()`.
- **The test.** `gateway.test.ts` "reads the caller’s context once …". Before: 1 failed (progress log `integ/context-before.log`). After: gateway and specs 60/60.

No other leak, bypass or regression found. Everything the reviews asked to keep is kept: `prepared.user` screened, the issued-check registry, fail closed on every error, and codes only in logs and redirects.

## 3. Findings

| ID | Resolution |
| --- | --- |
| phi-screen F1 (major) | Fixed, commit 1. Tests: redact.test.ts, the eight writings joined, storedSeparators, a 3,000-run property, and the 9b7eadfe superset property. gate.golden: the separator twin. Before: 13 failed. After: 27/27 and 57/57. |
| phi-screen F2 | Fixed, commit 1 (the skeptic's fix: invisible characters taken out of a gap, a minus sign joins). Test: redact.test.ts F2 case. |
| phi-screen F3 = security S3 | Fixed, commit 2. The reads commit before any decrypt. Tests: patient-records.test.ts (steps BEGIN, audit, COMMIT, decrypt) and patient-records.db.test.ts (every read audited). Before: 3 failed. After: pass. |
| phi-screen F4 | Fixed, commit 2. The count is one statement, and each read has a `LIMIT` at the bound plus one row. This was taken over REPEATABLE READ (reason in the ADR). Tests: three cases in patient-records.test.ts; db: 1,000 late claims give `screen_unavailable` with 25,001 reads. |
| phi-screen F5 (verdict major) | Fixed, commit 1. Streamed, with an index, stopping at the first match. Test: the 16 MiB bound in a 96 MiB child. Before: out of memory. After: 0.7 s and 1.2 to 2 s. The cap in `prepare` is deferred as ADR P11: it needs a refusal code and a notice. |
| phi-screen F6 = security S4 | Fixed, commit 2. Specs are frozen (where defined, and in the registry) and readonly. The gateway's prototype and instances are frozen. `PURPOSE_SPECS` is off the entry. Test: specs.test.ts 6/6. Rewriting a built-in in-process is not fixable by any module; the ADR's "The guards' reach" says so. |
| phi-screen F7 | Fixed, commit 2. Posting lines with no claim-level match are read. Tests: patient-records unit and db (a paper check found; a matched line not read). |
| phi-screen F8 (docs) | Fixed in the ADR, commit 5. "Not caught" now lists OCR misreads (Textract is screened and sent), glued prefixes and suffixes, dropped zeros, thousands separators and other separators. The PDF-columns sentence is corrected in the ADR and in redact.ts. The confusable fold and the prefix and suffix match are deferred to "Revisit when": they must be measured first. |
| phi-screen N1 | Fixed, commits 1 and 2: mutants killed. 3 tokenizer mutants are equivalent; the tokenizer note names them. The `default:` comment is applied. |
| phi-screen N2 | Fixed, commit 2. The doc and the ADR are corrected. `syntheticRecordsCheck` is testing-only, and the callers are pinned by lint. A stub refused inside the factory needs brands and is deferred as P12. |
| phi-screen N3 | Fixed, commit 1. The twins are 9NN00NNNN and BLSZ, checked by patient-twins.test.ts. Before: 4 failed. After: 7/7. |
| security S1 (major) | Fixed, commit 3: order, limits, the remembered refusal, beforeScreen. Tests: models-routes.db (before 5 failed, after 16/16), gateway.test (before 4 failed, after 54/54 with I1), gateway.db (replay and spent budget: no read) and permitted.db. Remaining, in the ADR: the route bucket (P10, after #42); the remembered refusal is per process. |
| security S2 | Not fixable in this PR. It needs Lane A's `practice_access_log` function (a migration) and #42's `settings.ts`. Pinned by models-routes.db.test.ts ("lists the first page …"), which flips then. The ADR says it under "What it gives up" and under F3 (retire S2), and P10 is the route. |
| security nit: stub claim | Fixed (commit 2 and the ADR). |
| security nit: testing-module lint | Fixed, commit 2: all import forms, transitive, route-tree support directories. |
| security nit: orphan-event list | Fixed, commit 3: the event moved into beforeScreen. The ADR's "The audit trail" is corrected. |
| security nit: unstated authorization | ADR "What it gives up", "Authorization" bullet (commit 5). |
| security improvements | F3's proposal now retires S1 and S2 (ADR Open matters). The tokenizer stops at the first match (F5). |
| UX-1 (major) | Fixed, commit 4: files held, Upload only, the ERA system too. Tests: uploader.test.tsx (before 15 failed, after 24/24), contracts e2e, era-exports e2e. |
| UX-2 | Fixed, commit 4: the `names_patient` notice. Test: path.test.ts. |
| UX-3 | Fixed, commit 4: `screen_failed`'s own notice, `screen_unavailable` reworded, `screen_limited`. Tests: path.test.ts (before 3 failed, after 3/3) and models-routes.db. |
| UX-4 | Fixed, commit 4: the kind's help under the select. Test: uploader.test.tsx. |
| UX-5 | Fixed with UX-1. |
| UX-6 (docs) | Fixed, commit 5: the ADR's scope sentence, "What a person meets", Consequences, the runbook and PRD 14. |
| UX N-1 | Fixed, commit 4: `screen_invalid` reads as `screen_unavailable`. Test: path.test.ts. |
| UX N-2 | Fixed, commit 4: the propose card's copy. |
| UX N-3 | Fixed, commit 4: the region is named by its title. The e2e locator is updated. |
| I1 (integration) | Fixed, commit 3: the context is read once (above). |

## 4. Suite (each step under flock /tmp/laneb-heavy.lock; PATH as required)

(filled below)

## 5. Every changed string a person sees

(filled below)

## 6. Commits

(filled below)

## 7. Open items

(filled below)
