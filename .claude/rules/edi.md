---
paths:
  - "packages/edi835/**"
  - "packages/synth/**"
---
# EDI 835
- Delimiters come from ISA (positions 4, 105, 106). Never assume * : ~.
- Parse to typed loops; validate code sets; balance claims and the transaction (claims + PLB = BPR02).
- An unbalanced transaction is held with the difference and position. Never load it.
- Dedup by file hash, then (practice, payee, ISA13, TRN02, BPR02). Resent files load zero rows.
- Observed allowed: AMT*B6 when present, else SVC03 + sum(CAS PR). Store the derivation code.
- Error messages carry segment index, segment ID, element position. Never patient fields.
- Synthetic files set ISA06 to SYNTHSENDER and a GS02 of SYNTH. The fixture hook refuses anything else.
- pyx12 in CI is the oracle. Disagreement fails the build.
