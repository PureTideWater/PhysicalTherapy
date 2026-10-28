# UX-DLR-01 verify (ForgetRefusal vs Next router canonicalUrl)
Status: started 2026-10-27. Clone: $S/verify-ux01
## Code read (next 16.4.3 dist, same version as lockfile)
- forget-refusal.tsx:24 replaceState(window.history.state,...) -- confirmed.
- app-router.js:74-111 HistoryUpdater useInsertionEffect writes {__NA, tree} + canonicalUrl on every appRouterState change -> state carries __NA before any useEffect.
- app-router.js:301-312 patched replaceState returns original for data.__NA (no restore dispatch) -> router canonicalUrl never learns. Patch is installed in AppRouter useEffect (runs after child effects in hydration commit).
- refresh-reducer.js:58-59 refresh fetches state.canonicalUrl (with ?refused=).
- restore-reducer.js: restore takes tree+renderedSearch from history state, canonicalUrl = new url.
- refresh triggers real: export-status.tsx:22-32 (live export poll), uploader.tsx:258-262 (uploads page passes kinds, so settledAll refresh fires).
- CONCERN with proposed fix: once canonicalUrl is clean, next router.refresh renders page WITHOUT refusal -> notice vanishes (packet page during live export within ~5s, focus lost). Need to check empirically.
- install ok in verify-ux01. Probe spec (my clone only): apps/web/e2e/zz-uxdlr01-probe.spec.ts (reports: router.refresh direct; uploads: real batch settle refresh). Run A (PR code) log: progress/uxdlr01-probe-A.log (E2E_DATABASE=tp_e2e_uxdlr01, port 3196).
## Run A (PR code 63aaa7f4) RESULT 17:00 -- BUG REPRODUCED
- reports: arrival URL clean, notice 1, focused; after window.next.router.refresh(): URL /reports?refused=not_found; reload -> notice REPLAYS (1).
- uploads (real flow, no direct refresh): arrive ?refused=rate_limited&retry=3, upload CAS-08 remit.835, 'Loaded 1 remittance' -> URL back to ?refused=rate_limited&retry=3, stale 'Wait 3 minutes' still on screen; reload -> notice replays.
- Next: run B with the finding's fix (setTimeout + replaceState(null)) to check URL stays clean and whether the notice vanishes on refresh (ADR 0079:124 'stays on screen until the person moves on').
## Run B (finding's fix: setTimeout + replaceState(null)) RESULT 17:05
- URL stays clean after router.refresh and after batch settle; reload shows no notice -> fixes the replay.
- BUT notice VANISHES on the first router.refresh (reports: notices 0, focus -> BODY) and when the upload batch settles (notices 0, focus BODY). Uploader batch state kept (batch=1) -> no remount (layout-router keys ignore search params).
- => finding's fix contradicts ADR 0079:124 / R16 'notice stays on screen until the person moves on'; on packet page with live export the notice would disappear within 5 s (ATTEMPT_REFRESH_MS) and drop focus.
- (3rd test failed at sign-in: TOTP reuse in the same window; probe artefact, merged into test 1.)
## Run C: finding's fix + client latch (components/refusal-notice.tsx: useState(notice); shown = notice ?? arrived; DownloadRefusal always renders it). log progress/uxdlr01-probe-C.log
## Run C RESULT 17:09 (fix + latch): URL clean after refresh and after batch settle; notice STAYS and keeps focus; reload -> no notice; batch kept. Back from /cases -> notice shown again (from router cache, not focused). Running A2 (PR code) for the Back comparison.
## Run A2 RESULT 17:11 (PR code, Back comparison) -- resumed run read it at restart
- reports: arrival clean; router.refresh -> URL ?refused=not_found again; reload -> notice replays (1). Confirms A.
- Back from /cases: notice shown from cache (not focused); refresh after Back -> notice 0 (popstate restore sets canonicalUrl to clean URL). So Back behaviour is the same in PR code and Run C; the latch keeps it after refresh.
- Next: cite exact lines at 63aaa7f4, check ADR 0079 wording, packet page wiring, then verdict.
## 17:2x resumed: lines confirmed at 63aaa7f4 (forget-refusal.tsx:24; download-refusal.tsx:80; export-status.tsx:22-32; uploader.tsx:257-262; packet/page.tsx:518,572,593; ADR 0079:122-125,163-164). next 16.4.3 app-router.js:289/305 early return, :277-281 restore, :74-111 HistoryUpdater.
- New concern on Run C latch: next 16.4.3 page key is '__PAGE__' (create-router-cache-key.js; no search params) -> a soft nav to the same route with other search (packet/page.tsx:593 version links, :518 Check again) keeps RefusalNotice mounted -> plain useState latch keeps a stale notice after the person moved on. Testing Run C' (C + soft nav) and Run D (latch keyed on pathname+search minus refusal keys).
- Run C2 started (variant C + soft-nav step), log progress/uxdlr01-probe-C2.log
## Run C2 RESULT 19:16 (finding fix + plain latch + soft nav step)
- refresh: URL clean, notice stays focused. Soft nav router.push(reports?probe=1): notice STILL shown (stale; page key ignores search) -> plain latch over-keeps. Reload: 0. Back same as before.
- Also: server-action-reducer.js:75 posts to state.canonicalUrl -> any server action on a notice page is a third trigger of the replay in PR code.
- Next: Run D = finding fix + latch keyed on pathname+search minus refusal keys (scratchpad/refusal-notice.variantD.tsx), both probe tests.
- Run D started 19:16 log progress/uxdlr01-probe-D.log (tsc ok on variant D)
## Run D RESULT 19:18 (finding fix + keyed latch, scratchpad/refusal-notice.variantD.tsx) -- ALL AS WANTED
- reports: refresh -> URL clean, notice stays focused; soft nav ?probe=1 -> notice drops; reload -> 0; Back -> cached notice, kept after refresh.
- uploads: batch settles -> URL clean, notice stays focused, batch kept; reload -> 0.
- Clone product files reverted after D (probe spec stays untracked, never committed).
## VERDICT: REAL, should-fix (severity right). Mechanism confirmed in code and reproduced (Run A/A2; uploads via the real batch-settle refresh). Finding's fix is necessary but NOT sufficient: alone it makes the notice vanish on the first refresh (Run B; packet page live export within 5 s, focus to BODY), and its e2e step would not catch that. Plain latch over-keeps on same-route soft nav (C2). Best fix = finding's ForgetRefusal change + RefusalNotice latch keyed on pathname+search minus refusal keys (D), plus e2e steps checking URL clean AND notice still shown/focused after refresh, then 0 after reload.
