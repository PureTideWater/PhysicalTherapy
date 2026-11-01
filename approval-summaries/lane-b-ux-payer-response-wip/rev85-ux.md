# rev85-ux: UX and brand review of PR #85 (head 90ec40ab)
Started. Clone at /home/user/rev85-ux on 90ec40ab. Read diff of pages, response-letter.tsx, write-off.ts, uploader, routes; design 6.1/6.2; critic nits n1-n8.
## Shots reviewed
(none yet)
## Findings
(none yet)
- Run 2 (resumed): re-read reviewer def, design 6.1/6.2, critic nits, diff of pages/response-letter/uploader/write-off. Strings in code match 6.1. Next: shots.
## Shots reviewed (run 2)
- after p.submissions.default 1280/390: ok; 6.1 strings; log line nested parens "(Payer approved once...) (with its document: ...)" polish.
- after letter-scanning 1280: status line ok; "This batch" h3 drawn text-lg bold, larger than sibling h3s "What the letter says"/"Upload the payer's letter" (polish); Choose a file stays offered while in flight.
- after letter-list 1280: one group shown (this case's earlier). ok.
- after letter-refused 1280: Nothing was uploaded alert, 6.1 words. ok.
- after error-unchosen-response 1280: FINDING summary lists Response before Payer's letter, page shows letter first (schema order submissions.ts:262-264).
- after case.error-unchosen 1280, write-off-open 390: ok.
- after contracts.kind-letter 390: FINDING kind select clips "Payer’s terms or policy lette|r" (label lengthened by PR); 1280 ok. Heading/title still "payer letter(s)" vs kind name (polish). "2 GiB" vs "2.0 GiB" (polish, pre-existing words).
- after letter-scanning dark, error-unchosen-response 390, notice 390: ok (hash wraps whole).
- after submissions.uploads-paused 1280: FINDING title "Uploads are not open yet" over "Uploads are paused: the organization is suspended: ... new runs start again ..." (uploader.tsx:389 + uploads.ts:91), spread by new uploadGate to Submissions/Contracts/Reconciliation.
- before submissions.default 1280: "upload on the Uploads screen first", Response on Accepted, Document on first letter -> UX-035/UX-007 visibly fixed after.
- before contracts.uploads-paused 1280: drop zone offered while suspended; PACKETS acceptance letter listed to tag -> both fixed after.
- after submissions.error 390: letter kept after refusal, showChosen line whole. ok.
## Findings (final)
1 should-fix: paused panel title/body (uploader.tsx:389, uploads.ts:91) on submissions/contracts/reconciliation uploads-paused.
2 should-fix: contracts.kind-letter.390 kind select clipped (uploader.tsx:402 p-8).
3 polish: error summary order (submissions.ts:262-264).
4 polish: "This batch" h3 styled larger than sibling h3 (uploader.tsx CARD_TITLE_CLASSES).
5 polish: one name per thing: "payer letter" vs "Payer’s terms or policy letter".
6 polish: log line nested parens.
7 polish: 2 GiB vs 2.0 GiB.
8 polish: Choose a file offered while letter in flight.
Baseline: UX-035, UX-007 fixed; UX-024 still open (not this PR).
DONE: returning StructuredOutput.
