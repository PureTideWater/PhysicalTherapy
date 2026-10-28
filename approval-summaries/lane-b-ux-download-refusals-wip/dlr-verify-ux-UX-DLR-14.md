# UX-DLR-14 verify (skeptic)
- Clone: scratchpad/verify-uxdlr14 at 63aaa7f4
- Status: started
## Checked (code at 63aaa7f4)
- letter.tsx:100-101 gate refusal===null ? {} : kept; :107 notice (so ForgetRefusal) when marked.size===0 (rate_limited, forbidden, suspended, duplicate, csrf_refused, invalid w/o known field)
- forget-refusal.tsx:6,17-24 strips only refused/fields/retry; coverage.ts:205 keeps payer/contract/codes for every refusal; download-refusal.ts:104-108 writes them.
- coveragePage params practiceId/page/model only (coverage.ts:102) -> leftover keys inert. Mechanism TRUE.
- reports/page.tsx:68 list=documents inert after forget (both DownloadRefusal null when refusal null; pageQuery omits list; z.object strips it). Cosmetic only.
- Deliberate design: letter.test.tsx:151-156 'keeps nothing without a refusal ... a plain link cannot fill the form'; ADR 0079:168-171 'Coverage reads ?codes= back only beside a refusal'. Finding's fix reverses both.
- Duplicate of SEC-02 (F2, verified real nit) which proposes the OPPOSITE fix (forget the kept keys).
- PRD.md:256 'no screen depends on client-side state that a refresh loses' -> unsubmitted entries lost on reload is ordinary form behaviour (same as a plain visit and the baseline); not a dependency.
- React 19.3.1 (verify-ux01 node_modules): updateInput removes value attr when defaultValue goes set->null (untouched codes would clear on a re-render); select ignores defaultValue updates. Relevant only if UX-DLR-01's fix makes canonicalUrl clean and a router refresh hits Coverage (no refreshOnError there; actions don't revalidate) -> speculative.
## Leaning: real (mechanism), nit right; fix not best.
- URL simulation (scratchpad/verify-uxdlr14-probe/sim.mjs, synthetic IDs): PR forget leaves ?payer&contract&codes and ?list=documents; with also-list both clean.
- Design doc has no ForgetRefusal text; R08/R18 hold the crafted-link residual as ADR 0079 states it.
## VERDICT: REAL (mechanism true, realistic: export bucket rate limit / suspended / forbidden on the letter), nit (right). Only the stray-keys half is a defect; reload losing unsubmitted entries = ordinary form behaviour (PRD:256 misapplied). Duplicate of SEC-02 F2.
Fix NOT best: removing letter.tsx:100-101 gate reverses the PR's plain-link guard (letter.test.tsx:151-156; ADR 0079:168-171; letter.tsx:18-19), widens SEC-01's reader gap to plain links, restores refusal-time entries on reload after the person changed them, and contradicts SEC-02's verified fix. Better: ForgetRefusal({also}) removes each page's return-only keys once its notice shows (letter: payer/contract/codes from one constant shared with coverage.ts:205; Reports: list), pure forgetRefusalUrl helper + node test, drift test, e2e step; if UX-DLR-01 latch lands, its key strips the same keys.
DONE.
