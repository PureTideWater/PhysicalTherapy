-- The page text of contract documents, read once at intake (milestones 3 to 5 review; PRD 16, Upload
-- safety; PRD 6, Intake and documents: "size and count limits"; PRD 6, Contract repository: "every
-- rate record resolves to a page"; docs/adr/0033).
--
-- The web app cited pages by reading each contract PDF whole and parsing it in its own process on
-- every request, so one uploaded decompression bomb could exhaust the memory every tenant's requests
-- share. From here the worker reads a clean contract, exhibit or payer letter once, at intake, in a
-- bounded thread (@tp/contracts/pages), and stores its page text sealed with the practice's key beside
-- the original (documentPagesKey: the document's own key and ".pages"). The web app reads only that
-- stored text. The row says how the reading went:
--
-- - page_text_status: null until intake has read the document (and for every other kind); ready with
--   page_count pages; unsupported_document when it is of no supported kind or past a limit (too large,
--   too many pages, too much text, or the reading thread's memory or time); document_unreadable when it
--   cannot be parsed. Only the three kinds a rate record cites carry it.
--
-- Runs as tp_owner. Safe with the previous image running: two nullable columns and one column grant;
-- the previous image neither reads nor writes them, and its web app reads documents as before.

ALTER TABLE source_document
  ADD COLUMN page_text_status text CHECK (page_text_status IN ('ready', 'unsupported_document', 'document_unreadable')),
  ADD COLUMN page_count integer CHECK (page_count >= 0),
  ADD CONSTRAINT source_document_page_text_kind CHECK (page_text_status IS NULL OR kind IN ('contract', 'exhibit', 'payer_letter')),
  ADD CONSTRAINT source_document_page_count_when_ready CHECK (CASE WHEN page_text_status = 'ready' THEN page_count IS NOT NULL ELSE page_count IS NULL END);

GRANT UPDATE (page_text_status, page_count) ON source_document TO tp_app;
