# suggest-evidence-requests

Each version is a directory (v<n>/) whose prompt.json and schema.json never change once released; a change
is a new version with an entry here. The SHA-256 is the one prompt.json records for its content (the system
prompt, the pinned model identifiers, the token limit, the effort and the schema); a test recomputes it.

## suggest-evidence-requests/1 (2026-10-16)

- First version. A checklist of documents to obtain, one item per gap a document could close, each naming its gap's reason code.
- SHA-256: `6de7d64801d8b769c386ac1f50230e059f2586cd4dbcedc6227d423735da31f4`
