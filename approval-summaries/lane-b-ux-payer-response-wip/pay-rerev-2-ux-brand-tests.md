# Re-review round 2: UX, brand, tests (HEAD cf6d0f42)
Started 2026-11-01 ~19:20 UTC. Worktree clean.
## Checked
## Findings
- Read full source diff 90ec40ab..cf6d0f42 (components, routes, lib, tests).
- S2-N1 words vs case_rules.sql: true (denied w/o reopen -> resolved; info_requested or denied+reopen -> awaiting; partial -> partially_resolved; lines first). Omits a line reopened from payer_approved (-> awaiting_response); minor, not reported.
- S2-N2: Field no default, required, hint wired via aria-describedby; route refuses ''/blank/missing on receivedOn; db test + e2e prove. OK.
- receivedOn regex same as before (isoDate regex only) - no regression.
- ux85-1 gate titles: uploadGate/suspendedGate OK; fallback body repeats "Uploads are paused:" under title "Uploads are paused" (polish candidate).
- n1/F3 duplicate-not-chosen: copy is always found (group null -> unusable), so "on file" fallback unreachable. OK.
- ux85-2 390 test: measurement method valid; not confirmed it fails without p-4 (next: probe).
- ux85-2 probe (static page with the build's CSS + fonts, 390 px): kind select needs 246 px; room 238 with p-8 (cut, so the e2e check fails without the fix: proven), 246 with p-4 (fits with 0 px slack). At 375 px it is cut again. Candidate polish: w-full on phones.
- Candidate polish: Contracts card region aria-label "Upload a contract or exhibit" != its title "Upload a contract, exhibit or payer’s terms letter" (pre-existing mismatch, title changed by this round).
- Browser-test proofs checked (would fail without fix): r2-1 card texts (5 setups), r2-2 option order, r2-3 single refusals, r2-6 region name, r2-7 class names, n1/F3 duplicate-not-chosen(+other-case), S2-N3 groups, ux85-1 paused title. db: S2-N1 denied->resolved, S2-N2 refusals + window from date, S2-N3 grouping + limit.
- Progress classes all compiled in the build CSS (accent-primary, bg-muted, ::-webkit-progress-*, ::-moz-progress-bar).
- No stale strings left in e2e/src (Drop zone, (uploaded here), old group label, old Contracts title).
- Candidate polish: ux85-5 and ux85-7 Contracts strings (title, drop-zone heading, "2.0 GiB") pinned by no test.
- Candidate polish: suspendedGate fallback says "Uploads are paused" twice (title + "Uploads are paused: ..." body).
- Candidate polish: RESPONSE_HINT "A case its lines already decide keeps their state" hard to parse.
- Next: typecheck + lint:copy at HEAD (background), then finish.
- lint:copy clean at HEAD. Probe files deleted; worktree clean.
## Findings (final, all polish)
1. ux85-2 fix fits with 0 px slack at 390 (246/246); cut at 375. Fix: w-full on phones (w-full sm:w-auto) or min-w-0 w-full.
2. ux85-5/ux85-7 Contracts strings unpinned by any test; card region aria-label "Upload a contract or exhibit" differs from its new title.
3. RESPONSE_HINT sentence "A case its lines already decide keeps their state" hard to parse, and omits a line reopened from Payer approved (case stays Awaiting response).
4. suspendedGate fallback repeats "Uploads are paused" in title and body.
