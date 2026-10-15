# content/sources

The source files global rule records are drafted from (PRD section 9): CMS physician fee schedule relative
value, GPCI and locality files, the MPPR rate file, final-rule conversion factors and therapy thresholds,
NCCI tables, the X12 external code lists (CARC, RARC, claim status) and state prompt-pay statutes.

- Each file is stored under `content/sources/<type>/` exactly as downloaded, with its SHA-256 recorded in
  the records drafted from it (`source.sha256`), together with its title, URL and retrieved date.
- Tabular files are read by a parser into [`content/drafts/`](../drafts/README.md); nobody retypes them.
- Quotes in a record must appear in the stored source text; the content checker verifies it.
- Public documents only. The purchased X12 implementation guide is licensed, not public: its text is never
  committed here or anywhere else in the repository.
- No PHI, no contract, no remittance, ever.
