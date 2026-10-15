# 0015. Encrypt the (enc) columns with a per-practice data key wrapped by KMS, look them up by a keyed hash, and destroy the key to delete

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (a practice has its own KMS data key; churn ends in key destruction), 5 (J14), 8 (patient_ref),
  15 (secrets and keys), 16 (encryption); Data dictionary conventions ("(enc)") and indexes ("on the deterministic hash
  of the encrypted value"); ADR 0012

## Context

The data dictionary marks columns (enc), encrypted at the application layer with the practice's data key before
storage: claim's patient and payer claim control numbers, patient_ref's names, date of birth, member ID and group
number, and posting_row's claim reference. One of them, `claim.payer_claim_control_number`, needs an indexed lookup
(matching new remittances to case lines, PRD 13). Deletion must leave no readable object for the practice (SEC-11),
which for these columns means destroying the key. The tables arrive in milestones 2 to 9; the mechanism arrives now.

## Decision

- **Envelope encryption behind `KeyProvider`** (`packages/db/src/crypto`). `generateDataKey(practiceId)` returns a
  256-bit data key in plaintext (memory only) and wrapped (stored as `practice.data_key_ref`, `kms:v1:<base64>` or
  `local:v1:<base64>`); `decryptDataKey(practiceId, wrapped)` unwraps it. `KmsKeyProvider` calls KMS GenerateDataKey
  and Decrypt on the environment's customer-managed key with the encryption context `{ practice_id }`, the only
  context the application role's IAM conditions allow (ADR 0012), so KMS itself refuses to unwrap one practice's key
  for another and CloudTrail attributes each use to the practice. `LocalKeyProvider` wraps with AES-256-GCM under a
  32-byte master key with the practice ID as additional data, for development and tests.
- **Field encryption** (`PracticeCipher`): AES-256-GCM with a fresh 96-bit nonce per value, stored as
  `enc:v1:<base64url>`; the additional data is `<practice_id>:<table.column>`, so a value moved to another practice or
  column does not decrypt. Encryption and lookup keys are derived from the data key with HKDF-SHA-256.
- **Lookup hash**: HMAC-SHA-256 under the derived lookup key over the column name and the value, hex. Deterministic
  within a practice and column, different across practices, so the claim index neither reveals values nor links
  practices. Only `claim.payer_claim_control_number` has one, as the dictionary names.
- **Keys in the database**: a practice is created with its key (`data_key_ref` NOT NULL unless the practice is
  deleted); the application role can insert the reference but never update it. `loadPracticeCipher(scope, ...)` reads
  the reference under the scope's policies. `destroyPracticeDataKey()` (the last step of the deletion workflow) sets
  the reference to null and the practice to `deleted` as the owner, with a system audit event; from then on no
  ciphertext of the practice can be decrypted by anyone. Database backups hold the wrapped key until they age out (35
  days), which the retention policy states.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A KMS key per practice | Hundreds of keys to rotate and pay for, and key deletion has a 7-to-30-day wait; the shared key with an encryption context gives the same isolation. Switch if a customer contract requires its own key |
| pgcrypto in the database | The key would reach the database server and its logs; the plan puts encryption in the application |
| Deterministic encryption for the lookup column | Equal plaintexts would give equal ciphertexts in the stored column itself; a separate keyed hash keeps the ciphertext randomized |
| Caching unwrapped keys across requests | A destroyed key would stay usable until the cache expired; a cipher lives for one request or job |

## Consequences

- Every (enc) column is `text` holding `enc:v1:...`, and its lookup hash, where one exists, a separate indexed column.
- Each request or job that touches (enc) columns makes one KMS Decrypt per practice.
- Key rotation (PRD 19, yearly) rotates the customer-managed key; KMS keeps old key material, so wrapped data keys stay
  valid without re-wrapping. Re-keying a practice (a new data key) is a re-encryption job when needed.

## Revisit when

The first (enc) column lands (milestone 2, claim and patient_ref), deletion lands (milestone 12), or a customer asks for
its own key.
