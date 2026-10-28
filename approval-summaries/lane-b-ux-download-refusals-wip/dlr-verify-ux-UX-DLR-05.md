# Verify UX-DLR-05 (skeptic) — progress
Started 2026-10-27. Clone: scratchpad/verify-ux05 at 63aaa7f4 (read only; nothing run, nothing needed).

## Checked
- Flow is real: packetPdf/packetCsv (lib/routes/packets.ts:311-334) take phi.export and returnTo exportHistoryPage
  (:301) -> /packet; handler.ts:357 303s a navigation's forbidden via refusalLocation (download-refusal.ts:93-117).
- packetPage permission is packet.draft (packets.ts:86). phi.export: billing_manager, firm_principal only;
  packet.draft: + analyst, firm_analyst (packages/db/src/authz/permissions.ts:138-170). So PA, viewer, reviewer,
  support, contract specialist are refused BOTH file and page -> page.tsx:173-174 Forbidden branch.
- Shots: screens-after p.packet.refused-forbidden.1280 = PermissionState "cannot build and draft packets";
  screens-before = JSON "Practice administrator cannot export line-level PHI". Tour drove the real /pdf URL
  (screens-after/capture/tour.spec.ts:2296-2305).
- ForgetRefusal is rendered only inside DownloadRefusal (download-refusal.tsx:80); Forbidden (shell.tsx:358-363)
  has none -> ?refused=forbidden stays. Consequence: URL copied back to a billing manager shows them a false
  "Your role cannot download this file" notice.
- Next step names "an analyst", who also lacks phi.export: wrong next step for the file.
- No product link shows the file to these roles (links gated by canExport, page.tsx:622); reached by a pasted
  link, bookmark/history after a role change. Realistic but not frequent.
- shell.tsx IS a #42 file (pr42-files.txt:19; design D7 "used, not changed"): the finding's slot-in-shell fix
  conflicts; better: fragment sibling <ForgetRefusal/> or AppShell+PermissionState in the page.
- Other return pages: file perm == page perm (review, report review, compliance, roi, documents, monthly,
  coverage): forbidden always lands on Forbidden with a matching permission message; only ForgetRefusal missing.
  Packet page is the one page where reasons differ. Report CSV (phi.export) -> report page (report.read) opens for
  every role refused the file except ones without report.read (edge).

## Verdict
REAL, should-fix (severity right). Fix improved: no shell.tsx change; file words name who downloads
(billing manager or firm principal, not analyst); ForgetRefusal on every return page's Forbidden branch.
