# PR #85 after3 shots (fix round 3 and the UX delta, 13e4e2fe)

Started 2026-11-01T21:09:05Z. TOUR_REF = worktree local HEAD 13e4e2fe (reachable: shared object store with
/home/user/PhysicalTherapy). TOUR_DIR=/home/user/screens85-after3. Galleries /home/user/gallery85/after3-{1280,390,1280-dark}.

## What 13e4e2fe changes on screen (against cf6d0f42)
- Submissions: the words under Response (a line moved back from Payer approved).
- Contracts: the upload card named by its title; the drop zone's heading an h3.
- Reconciliation: the Exports empty state's next step follows the upload panel (no upload right / gate closed / open).
- uploads.ts: an unknown suspension text under "Uploads are stopped" (not reachable on synthetic data: the seeded
  organization_run_refusal() texts are all known; changing it needs a migration).

## Steps
- [x] spec: CONTRACT_UPLOAD accepts the new card name (13e4e2fe's region name no longer matched); committed ceb1f4c2 on claude/build-ops, pushed 37ef2c01..ceb1f4c2 through the hook
- [x] setup + build + run (TOUR_ONLY, 111 ids: every p.submissions/p.contracts id of after2 plus p.reconciliation default/empty/viewer/uploads-paused; each .1280 with its -dark)
- [x] cleanup (fuser, DB, tmp)
- [x] tiles, read
- [x] galleries

## Log
- 21:09 setup.sh at 13e4e2fe ok (first launch exited at once: TOUR_DIR not exported; relaunched).
- Lock 21:09:28-21:15:27: build, fresh prepare, populate 11 passed (2.5 min), capture 7 passed 21:12:5x-21:15:19.
  84 shots, 27 skips (111 ids named; none failed, no "named but not taken"). server stopped 21:15:27, fuser empty,
  tp_e2e_screens dropped, /tmp/tp-e2e-tp_e2e_screens-* removed.
- Tiles: tile.py with p.submissions. p.contracts. p.reconciliation.: 84 shots, 234 tiles in /home/user/screens85-after3/tiles.
- Tiles read: contracts default 1280 (title, h3 drop zone "Choose contracts, exhibits or payer's terms letters to
  upload") and 1280 dark; contracts uploads-paused 390; submissions default 1280 (new words under Response);
  reconciliation uploads-paused 1280 (Exports empty: "No export can be uploaded now; the note above says why."),
  empty 1280 (open gate, unchanged step), viewer 1280 (LEDGER has exports: no empty state). Fine.
- Galleries built (not published), /tmp/gallery85.py after3: /home/user/gallery85/after3-1280 (28),
  after3-390 (28), after3-1280-dark (28), each gallery/pub{1280|390}/index.html; none scaled.
- DONE. Not captured: "Uploads are stopped" (an organization_run_refusal() text the upload words do not know; every
  seeded refusal is known, and a new one needs a migration); the Exports empty step for a person who cannot upload
  (the only viewer shot, LEDGER, has exports); skips by design as after2: letter states after intake x18, no-letter x3,
  contracts no-kind/held-ready x6 (the panel starts with the kind Contract).
