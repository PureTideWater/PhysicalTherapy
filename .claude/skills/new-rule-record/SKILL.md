---
name: new-rule-record
description: Add or revise a global rule record (PFS values, thresholds, code lists, state rules) in content/drafts with its source, quotes and verification level.
argument-hint: "[type] [year] [source-url-or-path]"
disable-model-invocation: true
allowed-tools: Read Write Edit Bash(pnpm verify-content *) WebFetch
---
Type: $0. Year: $1. Source: $2. Download or open the source; store it under content/sources/<type>/ with its
SHA-256. Load tabular CMS files by parser, never by typing. For any value typed by hand, transcribe twice and
diff. Draft the record in content/drafts/<type>/<year>/ per packages/rules/src/schema.ts with quotes and page
references. Run pnpm verify-content. Set verification L1 and list the questions a reviewer must answer for L2.
