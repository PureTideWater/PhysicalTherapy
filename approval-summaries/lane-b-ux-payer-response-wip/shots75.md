# PR #85 after shots, retaken at the merge of #75 (local HEAD 32bfde40), and the UX delta review

## The run
- Ref: `TOUR_REF=32bfde407ae2036c95c6a528d0a08ebdb0229d34`, the local HEAD of /home/user/ux-payer-response (co-001/ux-payer-response, not pushed). Worktree: /home/user/screens. Tooling: /home/user/ops/tools/lane-b-screen-tour at claude/build-ops 60ea81ca, following "From another lane".
- TOUR_DIR: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/screens-merge75
- TOUR_ONLY (18 ids): `p.submissions.default`, `p.submissions.letter-list`, `p.contracts.default`, `p.contracts.kind-letter`, `p.reconciliation.default` and `p.uploads.default`, each at `.1280`, `.390` and `.1280-dark`.
- Build and serve: `TOUR_MINUTES=60 flock /tmp/laneb-heavy.lock bash build.sh`. The lock was held from 08:36:00 to 08:43:13 UTC. The build finished at 08:38:02 and the server was ready at 08:38:51.
- Populate: 11 passed (08:38:51 to 08:42:08).
- Capture: 18 shots taken, 0 skipped (08:42:08 to 08:42:56). RECORDS: 46 found, none missing.
- Clean-up: "server stopped" at 08:43:13 and `fuser 3297/tcp` prints nothing. tp_e2e_screens was dropped and /tmp/tp-e2e-tp_e2e_screens-* removed.
- Tiles: `/usr/bin/python3 -I tile.py` cut the 18 shots into 53 tiles, under `screens-merge75/tiles/<id>/NN.png`, with `tiles/index.json`.
- Nothing was committed or pushed. Only synthetic data was used. The PNGs are only in the scratchpad.

## Shots (each one looked at, every tile)
| shot id | persona | path (synthetic) | px |
|---|---|---|---|
| `p.submissions.default.1280` / `.1280-dark` / `.390` | packet-approver | PACKETS case /submissions | 1280x2293 / 1280x2293 / 390x3231 |
| `p.submissions.letter-list.1280` / `.1280-dark` / `.390` | packet-approver | same, select drawn as list box | 1280x2316 / 1280x2316 / 390x3260 |
| `p.contracts.default.1280` / `.1280-dark` / `.390` | era-manager | OTHER /contracts | 1280x1507 / 1280x1507 / 390x2070 |
| `p.contracts.kind-letter.1280` / `.1280-dark` / `.390` | era-manager | OTHER /contracts, kind = payer letter | 1280x1507 / 1280x1507 / 390x2070 |
| `p.reconciliation.default.1280` / `.1280-dark` / `.390` | ledger-manager | LEDGER /reconciliation | 1280x2678 / 1280x2678 / 390x4024 |
| `p.uploads.default.1280` / `.1280-dark` / `.390` | pricing-manager | LAYOUT /uploads | 1280x804 / 1280x804 / 390x880 |
PNG files: `screens-merge75/png/<id>.png`. Shot metadata: `screens-merge75/shots.json`.

What the shots show, merged as merge75.md describes:
- **Log a payer response:** "Payer’s letter" starts on "Choose the payer’s letter", with its hint, and a polite status line comes before the uploader. The uploader shows no kind select (one kind is offered), the h3 "Upload the payer’s letter", "One PDF, up to 2.0 GiB. The file is scanned for malware…" and the "Choose a file" button. "What the letter says" follows as an h3.
- **The letter list:** grouped under "Letters of this case’s earlier responses".
- **Contracts:** the title "Upload a contract, exhibit or payer’s terms letter" and the response-letter sentence. The kind select starts on "Choose a kind" with its help line (#75), and offers "Payer’s terms or policy letter".
- **Reconciliation:** the heading "Choose posting or EFT exports to upload", with "Choose a kind".
- **Uploads:** the kind select starts on 835 remittance.
- **At 390 px:** no page is wider than 390, and the wide tables sit behind "Scroll sideways for more columns". The 390 px shots reach 880 to 4024 px tall because they are full-page.

## Findings, most severe first
No blocking or should-fix finding. Two are polish findings this change caused:

### F1 (Polish): one kind has three names on the Contracts panel
- **Shots:** `p.contracts.default.1280`, `p.contracts.default.390` and `p.contracts.default.1280-dark` (tile 01 bottom and tile 02 top); `p.contracts.kind-letter.1280`, `p.contracts.kind-letter.390` and `p.contracts.kind-letter.1280-dark` (tile 02).
- **Reproduced:** the panel title says "Upload a contract, exhibit or payer’s terms letter" and the drop zone heading says "Choose contracts, exhibits or payer’s terms letters to upload". The kind select it controls names the same kind "Payer’s terms or policy letter" (kind-letter shots). The refusal for a response letter uses a third form: "…choose the contract, exhibit or payer’s terms letter instead".
- **Evidence:** `apps/web/src/app/p/[practiceId]/contracts/page.tsx:206` and `:221`; `apps/web/src/lib/routes/contracts.ts:61` (CONTRACT_KIND_LABELS); `apps/web/src/lib/contracts/tagging.ts:51`.
- **Rule:** one name per thing, across screens (ux-brand-reviewer "Words", recommendation).
- **Fix:** use the select's name everywhere, without changing the label.
  - `contracts/page.tsx:206`: the CardTitle becomes `Upload a contract, exhibit or payer’s terms or policy letter`.
  - `contracts/page.tsx:221`: `heading="Choose contracts, exhibits or payer’s terms or policy letters to upload"`.
  - `lib/contracts/tagging.ts:51` (RESPONSE_LETTER_NOT_A_SOURCE) ends: `…; choose the contract, exhibit or payer’s terms or policy letter instead`.
  - Make these agree with the new words:
    - `apps/web/e2e/contracts.spec.ts:78` and `:113`;
    - `apps/web/e2e/packets.spec.ts:626-629` (and the comment at `:624` and the `:638` caption);
    - `apps/web/src/lib/routes/workbench-routes.db.test.ts:303`;
    - any unit test that asserts the title or heading (`git grep -n "payer’s terms letter" apps/web`).
  - The tour's `CONTRACT_UPLOAD` regex (`/home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts:719`, claude/build-ops) needs the alternative `, exhibit or payer’s terms or policy letter`. That is Lane B tooling: it is not committed from this lane's check, so tell the orchestrator.
  - No migration, no freeze exception and no founder or brand decision.

### F2 (Polish; baseline class, made inconsistent by this PR): the Uploads drop zone still says "Drop"
- **Shots:** `p.uploads.default.1280`, `p.uploads.default.390` and `p.uploads.default.1280-dark` (tile 01).
- **Reproduced:** the heading reads "Drop 835 files or ERA exports here". This PR renamed the other two drop zones to "Choose … to upload" (`p.contracts.default.*` and `p.reconciliation.default.*`, tile 02). The heading now also names the region, through aria-labelledby (`uploader.tsx:765`). So at 390 px a phone user reads "Drop" on one page and "Choose" on two others.
- **Rule:** words fit a phone, "choose" not "drop" (baseline), and one style across screens (recommendation).
- **Fix:**
  - `apps/web/src/app/p/[practiceId]/uploads/page.tsx:53`: `heading="Choose 835 files or ERA exports to upload"`.
  - `apps/web/src/components/uploads/uploader.tsx:776`: the default heading becomes `'Choose 835 files to upload'`.
  - Make `apps/web/e2e/uploads.spec.ts:36`, `:116` and `:132` agree (region name `Choose 835 files or ERA exports to upload`).
  - The tour spec does not match this heading (checked), so no tooling change is needed. No migration.

## Other defects on these screens (not this change's own)
- **O1 (Polish, pre-existing): the kind in the tag list.** Shots: `p.contracts.default.1280` and `p.contracts.kind-letter.1280`, tile 02, "Documents to tag to a payer".
  - The row reads "contract, 1.9 KiB, received 2026-11-04 08:39 UTC (e286b197)": the kind is in lower case, and the code's own comment shows "Contract,". A payer’s terms or policy letter would read "payer letter, …", a fourth name for the kind the panel calls "Payer’s terms or policy letter".
  - Evidence: `apps/web/src/components/contracts/forms.tsx:19` (KIND_NAMES).
  - Fix: build the label from `CONTRACT_KIND_LABELS[document.kind as ContractDocumentKind] ?? KIND_NAMES[document.kind]` (`lib/routes/contracts.ts:61`). The row then reads "Contract, 1.9 KiB, …" and "Payer’s terms or policy letter, …". Update the forms.tsx tests that assert the lower-case kind.
  - Optional for this PR. Do it here only if F1 is done in the same commit.
- **D1 (Dark, tokens only; advisory, pre-existing): native controls ignore the dark theme.** Shots: `p.submissions.default.1280-dark` tile 03 and `p.submissions.letter-list.1280-dark`.
  - The "Reopen the case…" checkbox is drawn white. The date inputs' calendar icons ("Received on", "Follow up on") are dark on the dark field, close to invisible.
  - `color-scheme` is set nowhere: `git grep -n color-scheme` finds nothing in apps/web/src/app/*.css, packages/ui/src or packages/brand/src.
  - Rule: native controls in Ink and the theme's `color-scheme` (baseline); 1.4.11 in dark.
  - Fix in `packages/brand/src/tokens.css`: `:root { color-scheme: light; }` and `[data-theme="dark"], .dark { color-scheme: dark; }`.
  - Advisory until users can switch dark on (ADR 0056:127-130). Not for this PR.
- **Capture note, not a product defect:** in `p.submissions.letter-list.390`, the forced list box cuts the option at "payer letter, S…". The tour sets `size` on the select; a phone shows its native picker. The 1280 shot shows the whole option: "2026-11-04 08:40 UTC: payer letter, SHA-256 69ede2a2b201…".

## Not seen (by sample) and not checked
- **Not seen:**
  - the Exports empty state, which this PR rewrote through `exportsEmptyNextStep` (`components/reconciliation/display.tsx`), for each of its three branches;
  - the closed-gate title (`gate.title`);
  - in the payer-response uploader: its refusals (second file, zip, wrong type, empty, too large), the waiting "Upload 1 file" and "Clear" state, the h3 batch "This batch", the progress bar in tokens, and each letter status (spec `notReachedAll`);
  - the submissions page for a role that cannot upload;
  - the Contracts `interaction:packets` and viewer states.
- **Not checked:** keyboard order through the select, uploader and fields; the announcements of `#response-letter-status`; the leave guard; Back and refresh.
  - From the code: the status `<p role="status">` is present from the first render; the file input is `tabIndex=-1` with one "Choose a file" button; the uploader's buttons are `type="button"`; the heading levels nest (h2 card title, h3 drop zone and "What the letter says").
