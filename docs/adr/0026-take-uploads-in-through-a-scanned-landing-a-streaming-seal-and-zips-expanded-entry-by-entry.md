# 0026. Take uploads in through a scanned landing and a streaming seal, and expand zips entry by entry

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 5 (J1, J4), 6 (Intake and documents), 7 (Uploads), 10 (pipeline steps 1 and 2), 16 (Upload
  safety); test matrix PAR-06, PAR-27, PAR-28, PAR-30, SEC-08

## Context

Milestone 3 part A takes uploads in: the browser sends 835s (single files, batches, or a zip of them up to 2 GB),
contracts and exports, and each must be scanned for malware before anything reads it, hashed, checked for
duplicates, sniffed for what it really is and, for a zip, expanded one entry at a time under limits, each entry its
own document. ADR 0018 seals every stored object with the practice's data key in the application, but its TPO1
format seals a whole object in one GCM operation, which for a 2 GiB upload means holding 2 GiB. The plan leaves
open where the browser's bytes land before they are sealed, how the scan's verdict reaches the worker in
development (GuardDuty exists only in AWS), how the web app hands work to the worker, what the zip limits are,
how a held entry is recorded when the data dictionary gives `source_document` a status and no reason column, and
how a 2 GB zip is shown to queue per file in bounded memory without a 2 GB fixture in CI.

## Decision

- **Tables.** One migration (`20261016090000_documents_payers_plans.sql`) adds `source_document`, `payer` and
  `plan` as PHI tables under the tenant policy (ADR 0013). `source_document.s3_key` is generated
  (`practices/<practice>/documents/<document>`), so no code can choose a key with an identifier in it (SEC-08).
  A trigger keeps a document's SHA-256 fixed once set, never lets a scan verdict go back to pending, and lets
  `parent_document_id` point only at a top-level document of the same practice. Two restrictive policies
  refuse a new document unless the practice's BAA is on file (`practice_baa_on_file`, J1) and unless a
  top-level document is uploaded by the acting user. The app role cannot delete documents. A unique partial
  index on `(practice_id, sha256)`, excluding duplicates, makes "first with these bytes" a database fact.
- **Hold reasons are statuses.** `status` carries the stage and, when held, the reason: `duplicate`,
  `quarantined`, `not_835`, `wrong_type`, `unreadable`, `too_large`, `too_compressed`, `nested_zip`,
  `unsafe_entry`, `encrypted`, `too_many_entries`, or `failed` (intake failed three times). The Uploads screen
  and the CSV error report turn each into fixed text (`receipt-labels.ts`); nothing free-form is stored.
- **The upload request.** `POST /p/<practice>/uploads/request` (permission `file.upload`: billing manager,
  analyst, firm analyst, firm principal) checks the BAA, the batch (at most 100 files), each file's size (1 byte to
  2 GiB) and declared type against its kind, records one `awaiting_upload` row per file and returns a PUT target
  per file, valid for 15 minutes. The browser PUTs, then calls `POST .../uploads/complete`, which marks the
  document `received` and queues `intake` once the bytes have arrived. `POST .../uploads/retry` returns a new
  target while the bytes have not arrived, or queues intake again for a `received` or `failed` document.
- **Where bytes land.** In S3 (staging and production) the target is a presigned PUT to the document's intake
  key (`intake/<practice>/<document>`) with `Content-Type`, `Content-Length`, `If-None-Match: *` and SSE-KMS with
  the documents key all signed, so S3 refuses any other type, length, encryption or a second write. GuardDuty
  Malware Protection scans the object there. The worker reads it only after a clean verdict, sealing it into the
  document's own key and computing its SHA-256 as it passes; the intake copy is never read again and the
  bucket's `intake-uploads-expire` lifecycle rule removes it and its noncurrent version within a day or two (the
  application role deletes nothing). Locally there is no presigning: the target is the web app's own receiver,
  `PUT /p/<practice>/uploads/<document>/content?token=...`, which needs the session and a 15-minute token (an
  HMAC over practice, document, size, type and expiry, written in the letters a to p so a URL carries no digit
  runs), seals the bytes as they arrive, refuses any other length, and keeps the first of two PUTs.
- **TPO2, a streaming seal.** Uploads and entries are sealed in 64 KiB chunks, each AES-256-GCM with the
  practice's object key, a nonce of the object's random 8-byte prefix and the chunk's 32-bit index, and AAD
  binding the object key, the header, the index and whether the chunk is the last. A stream cut at a chunk
  boundary, reordered, or with its header changed fails to open. Any byte range opens by decrypting only the
  chunks it touches, which the zip reader needs. TPO1 stays for small objects.
- **ScanService.** `verdict(subject) -> pending | clean | flagged(finding) | unscannable | failed`.
  `GuardDutyScanService` reads the `GuardDutyMalwareScanStatus` tag on the intake object; `LocalScanService`
  flags the EICAR test file, executables (MZ, ELF, Mach-O) and scripts (`#!`) by their first bytes; it is a
  stand-in that exercises every verdict path, not a scanner. The job waits for a verdict (`SCAN_WAIT_SECONDS`, default 600) and fails
  the attempt if none comes, so pg-boss retries it. Anything but clean quarantines the document.
- **Sniffing decides, never the name or the declared type.** A valid 106-character ISA header, a zip, a PDF, an
  OLE2 or OOXML spreadsheet, CSV or text, or an executable or script signature (a renamed executable is
  quarantined, PAR-28). A clean 835 becomes `scanned` and gets a `parse_835` job; another accepted kind is
  `stored`; anything else is held with its reason.
- **Zips.** Read by random access over the sealed document (yauzl), never extracted to disk. `ZIP_LIMITS`: 50,000
  file entries (one more refuses the zip), 256 MiB per entry, 64 GiB in total, a ratio of 100 to 1 for entries
  above 1 MiB, and overlapping entries or a compressed sum beyond the zip refuse it as a bomb. Each entry is held
  without being read if its name is unsafe (absolute, a drive, `..`, a backslash, NUL) or a link, if it is
  encrypted, uses another method, or is too large or too compressed. Every other entry streams into its own
  document (`parent_document_id` the zip, ID derived from the zip's ID and the entry's index, so a retry resumes),
  its size and CRC-32 checked as it inflates, then hashed and sniffed like an upload (a zip inside is held as
  `nested_zip`, never expanded); a bad entry is held and the next one is read (PAR-27). If any entry is malware,
  an executable or a script, the whole upload is quarantined and nothing in it is queued (PAR-28). A workbook is a
  zip too and is stored as a document, never expanded.
- **Jobs.** The web app is a pg-boss producer only (no supervision or schedules) on `QUEUE_DATABASE_URL`, and
  imports the job contract from the worker (`@tp/worker/jobs`), so payloads and singleton keys are one
  definition. `intake` and `parse_835` both carry `{ practice_id, document_id }`; their singleton key is
  `<type>:<practice>:<document>`, retry limit 2 (three attempts, ADR 0019), and intake gets an hour before an
  attempt expires. On its last attempt intake marks the document `failed`. Until the parser is wired (next part),
  `parse_835` marks a `scanned` 835 `parse_queued`, which the receipts show as "queued for parse".
- **Duplicates** (PAR-06, PAR-30). Intake takes a transaction-scoped advisory lock on the practice and hash
  before recording the SHA-256, so of two uploads of the same bytes one is first and the other `duplicate`,
  pointing at it in the receipt.

### 2 GB in bounded memory

Nothing in the path holds more than a chunk at each step: the seal's queue (a chunk and the piece arriving), the reader's
read-ahead (16 chunks, 1 MiB) and cache (64 chunks, 4 MiB), the inflate window (32 KiB plus zlib's buffers), and
in S3 one 8 MiB multipart part. That sum, about 14 MiB, does not depend on the zip's size. A 2 GiB zip is 32,768
chunks (the 32-bit index allows 2^32), 512 KiB of tags; sealed, the zip and its entries take about 4 GiB of
storage. `zip.large.test.ts` streams a generated zip of `TP_LARGE_ZIP_MB` mebibytes (256 by default) through the
real path and fails if memory grows by more than 96 MiB. Measured here: 256 MiB in 11 s with a peak of 34 MiB,
1 GiB in 47 s with 44 MiB; time grows linearly (about 95 s for 2 GiB) and memory does not.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| The browser PUTs straight to the document's key with no application seal | Breaks ADR 0018: the object would rest under SSE-KMS only, readable by anyone with the bucket's key. |
| The upload through the web app in production, sealed as it arrives | Every 2 GiB upload would pass through the web tier; presigned S3 PUTs keep it out. The local receiver does this only in development. |
| Seal 2 GiB as one TPO1 object | Needs the whole object in memory to seal or open, and gives no random access for the zip reader. |
| A `hold_reason` column | The data dictionary has none; statuses carry the reason with a fixed list the database checks. Revisit if the dictionary adds one. |
| Extract zips to a temporary directory | Plaintext on local disk, and disk space the size of the zip; random access over the sealed object needs neither. |
| The web app queues by inserting pg-boss rows itself | Couples the web app to pg-boss's tables; the producer API with the worker's contract is one definition. |

## Consequences

- The browser's PUT to S3 needs a CORS rule on the documents bucket naming the app's origin, which arrives with the
  compute in milestone 11; until then only the local receiver has been exercised end to end. Staging must check a
  presigned PUT with the wrong length, type or no `If-None-Match` is refused.
- GuardDuty scans the whole documents bucket, sealed objects included (they read as unscannable binary); scoping its
  plan to the `intake/` prefix is an infra follow-up.
- `pnpm test:db` covers the tables (catalog, cross-tenant, BAA and actor policies), every upload route through the
  generated tests, and intake end to end on the local providers; `pnpm test:e2e` uploads an 835 and the PAR-27 zip
  in the browser with the worker beside the server.
- The parse_835 handler is a marker; the next part replaces it with the parser and the loader.

## Revisit when

The parser and loader land (parse_835 becomes real); the first staging deploy (CORS, presigned PUT conditions,
GuardDuty tags on intake keys); a customer zip approaches the limits (50,000 entries, 256 MiB per entry).
