# read-denial-letter

Each version is a directory (v<n>/) whose prompt.json and schema.json never change once released; a change
is a new version with an entry here. The SHA-256 is the one prompt.json records for its content (the system
prompt, the pinned model identifiers, the token limit, the effort and the schema); a test recomputes it.

## read-denial-letter/1 (2026-10-16)

- First version. A payer letter's payer, claim references (by placeholder), reason category from the denial-category code list, deadline as written and requested documents, each with its quote, from the letter with the patient's identifiers replaced by placeholders.
- SHA-256: `9728b04480d6b1624820a7efabef904de8ab8d3e2d4ca89ac5393668ece03660`
