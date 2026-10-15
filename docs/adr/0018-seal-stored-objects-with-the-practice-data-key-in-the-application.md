# 0018. Seal every stored object with a key derived from its practice's data key, in the application, beneath S3's own encryption

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (a practice has its own KMS data key; churn ends in key destruction), 6 (Intake and documents:
  "server-side encryption with the practice's data key"; Data lifecycle: "a deletion test leaves no readable object for
  the practice"), 15 (Stack, Files: "server-side encryption with a per-practice data key under a KMS customer-managed
  key"), 16 (Encryption: "data keys destroyed on deletion"; Upload safety); milestone 1 prompt ("S3 with per-practice
  KMS data keys"); test matrix SEC-11; ADRs 0012 and 0015

## Context

ADR 0015 gave every practice a data key (KMS GenerateDataKey with the `practice_id` encryption context, wrapped in
`practice.data_key_ref`) and used it for the (enc) database columns. The buckets (ADR 0012) used bucket-default SSE-KMS
under the one environment key with S3 Bucket Keys. The milestone 1 review found that this left S3 without any
per-practice key: the encryption context of every object was its bucket, the task role could read every practice's
objects, and destroying a practice's data key left all of its documents and packets readable. Packets and audit copies
are also under seven-year Object Lock (in production, COMPLIANCE), so for them deletion of the bytes is impossible by
design: only destroying a key can make them unreadable.

Three ways to tie objects to the practice's key were weighed:

- **SSE-C** (S3 encrypts with a key the caller sends on every request, derived from the practice's data key). S3 never
  stores the key, so destroying the data key crypto-shreds the objects. But the key travels with every request,
  including the browser's pre-signed upload (PRD 16), and GuardDuty's malware scanning of the documents bucket (ADR 0012)
  does not support SSE-C objects.
- **SSE-KMS with a per-request encryption context** (`practice_id`, Bucket Keys off, an IAM condition on the context).
  It attributes every object to its practice in CloudTrail and lets IAM refuse a wrong context, but the key is the
  shared environment key: destroying `practice.data_key_ref` changes nothing, so the deletion requirement is not met,
  and locked objects can never be made unreadable.
- **Sealing in the application** with the practice's data key before the bytes leave the process.

## Decision

- **Every object a practice owns is sealed by the application** before it is written: `PracticeCipher.encryptObject`
  (`packages/db/src/crypto/cipher.ts`) is AES-256-GCM under a key derived from the practice's data key with HKDF-SHA-256
  (`tp object encryption v1`, distinct from the field and lookup keys), with a fresh 96-bit nonce, and additional data
  `<practice_id>:object:<object key>`, so an object copied to another key, or opened with another practice's cipher,
  does not decrypt. Format: `TPO1`, nonce, ciphertext, tag. `decryptObject` refuses anything else.
- **The store** (`apps/worker/src/storage/practice-objects.ts`): `PracticeObjectStore.put(cipher, key, bytes)` and
  `get(cipher, key)` over a write-once `ByteStore` (S3 with `If-None-Match: *`; a local directory in development and
  tests). A cipher is opened only with `loadPracticeCipher` inside that practice's scope (a request, or a job's
  `withJobScope`), so code can seal and open only the practice it is working for. Keys stay opaque IDs (SEC-08).
- **S3's own encryption stays beneath it**: bucket-default SSE-KMS under the environment key with Bucket Keys
  (unchanged); the application role still uses the key directly only with the `practice_id` context (ADR 0012), which is
  the only way to unwrap a practice's data key and therefore to open its objects.
- **Destroying the data key is the deletion of the bytes' meaning**: after `destroyPracticeDataKey()` the sealed objects
  may remain (Object Lock, versions, backups for 35 days) but no one can open them. `practice-objects.db.test.ts` proves
  it against PostgreSQL: a job seals an object in its practice's scope; another practice's job cannot load the key or
  open the object; once the key is destroyed, the object is still stored and unreadable.
- **Write-once keys in every application bucket**: the bucket policies of `documents`, `packets` and `auditCopies` deny
  any object-creating `s3:PutObject` without `If-None-Match` (condition keys `s3:if-none-match` and
  `s3:ObjectCreationOperation`), for every principal, so an original document cannot be replaced (PRD 6: "original bytes
  kept immutable") and the 35-day noncurrent-version rule applies only to deleted objects.
- **Uploads (milestone 3)**: browser uploads go by pre-signed URL to an intake key and are scanned there by GuardDuty;
  the worker then reads a clean upload, seals it into its permanent key with the practice's cipher and deletes the intake
  object. Plaintext therefore rests in S3 only under intake keys, only until the scan and the worker's copy, and only
  under the bucket's SSE-KMS. Milestone 3 builds that path, its intake lifecycle rule and its tests.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| SSE-C with a key derived per practice | The key would reach the browser for pre-signed uploads and every request; GuardDuty Malware Protection does not scan SSE-C objects |
| SSE-KMS with a `practice_id` encryption context per request | The shared environment key decrypts every practice; destroying a data key leaves the objects readable, and locked packets could never become unreadable |
| A KMS key per practice (SSE-KMS with it) | ADR 0015's reasons: hundreds of keys, and a 7-to-30-day deletion wait; switch if a customer contract requires its own key |
| Sealing only packets and exports | Documents (835s, contracts) hold the most PHI; one rule for every object is simpler to test |

## Consequences

- An object's bytes in S3 are useless without the database row's wrapped key and KMS with that practice's context;
  GuardDuty findings, S3 inventory and CloudTrail still see objects by opaque key only.
- Streaming: the sealing API takes whole buffers today. The intake path (milestone 3, 2 GB zips) seals each extracted
  file, not the zip; a chunked format (`TPO2`) is added if one file ever needs streaming.
- Every read of an object costs one KMS Decrypt per practice per request or job (as ADR 0015).
- The `s3:ObjectCreationOperation` and `s3:if-none-match` condition keys are asserted in the templates; their effect is
  proven only at the first staging deploy (ADR 0012's deploy-time checks), by a PUT without `If-None-Match` being refused.

## Revisit when

Milestone 3 builds uploads and the scan (intake keys, lifecycle, the copy into sealed storage), milestone 12 builds the
deletion workflow (its test must show no readable object, SEC-11), or a customer asks for its own KMS key.
