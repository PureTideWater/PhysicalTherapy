# SEC-02 verification (PR #78 @ 63aaa7f4)
Status: started. Cloning to scratchpad/verify-sec02.
- Clone at scratchpad/verify-sec02 @ 63aaa7f4.
- Confirmed: coverage.ts:205 returnTo keeps payer/contract/codes for every refusal (rate_limited included); refusalLocation (download-refusal.ts:93-109) writes refused,retry then kept values.
- Confirmed: letter.tsx:107 renders DownloadRefusal (so ForgetRefusal) when marked.size===0 (rate_limited, forbidden, suspended, duplicate, csrf_refused, invalid w/o payer/contract/codes field); ForgetRefusal deletes only refused/fields/retry (forget-refusal.tsx:6,17-24).
- Confirmed: letter.tsx:100-101 reads kept values only when refusal!==null; coveragePage params are practiceId,page,model only (coverage.ts:102) -> payer/contract/codes inert after forget.
- Realistic trigger: export bucket 60/user/10min, 300/IP (rate-limit.ts:44), shared by all downloads.
- Not PHI: opaque IDs + procedure codes, already screened by textPhiFindings; the GET form URL already held them. So privacy rule is a stretch; it is URL hygiene / D5 consistency.
- Node simulation of refusalLocation + ForgetRefusal: /coverage?refused=rate_limited&retry=3&payer=A&contract=B&codes=97110%2C+97530 -> /coverage?payer=A&contract=B&codes=97110%2C+97530; no refused= on reload.
- PR's own letter.test.tsx:151-155 ('keeps nothing without a refusal') proves that leftover URL renders an empty form: inert.
- No DOM test env (root vitest.config.ts has no jsdom/happy-dom; tests use renderToStaticMarkup) -> the proposed test at download-refusal.test.tsx:65 cannot see useEffect; better: pure helper + unit test, and a drift guard CONTROLS == keys coverage.ts:205 keeps.
- reports/page.tsx:68 list=documents is likewise inert after forget (harmless constant); optional same treatment.
VERDICT: real, nit (severity right). PHI framing overstated (opaque IDs + codes, screened). Fix right in shape; improve: forget={CONTROLS}, pure forgetRefusalUrl helper tested in node, drift test vs payerLetter.returnTo keep keys.
Status: done.
