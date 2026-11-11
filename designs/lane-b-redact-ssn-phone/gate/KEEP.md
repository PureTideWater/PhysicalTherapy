# Kept: the redact-range-glued differential gate and the residual table's scripts (synthetic only)

ADR 0054 (co-001/redact-range-glued) and `packages/model-gateway/src/redact.residuals.{json,test.ts}` name this folder as
where the differential gate and the scripts that write the residual table are kept. Every letter, patient and number here
is synthetic (patients ZEPHYRA / VANTREE and their like, SYN-prefixed IDs, SSNs 900-xx-xxxx, phones 202/555-01xx).
co-001/redact-ssn-phone-leaks owns the next regeneration: its acceptance test is that every pinned row of rulings A and A'
flips to redacted or refused, measured on this gate.

- `README.md`, `run.sh`, `gate.mts`, `worker.mts`, `oracle.mts`, `timing.mts`, `prepare-check.mts`, `analyze.py`,
  `tests.sh`, `baseline.md`: the gate (see README.md). `run.sh <treeA> <treeB> <outdir>`; tree A is cc3dd7f6.
- `corpus/`: the fixed corpus (975,489 letters, 8 shards, sha256 in `manifest.json`); the gate reads it as is.
  `gen/` rebuilds it from a harvest of the reviewers' harnesses (`gen/harvest-all.mts`), which this folder does not keep
  (843 MB, recorded from the session's review harnesses): use the corpus as kept. `gen/snap/` holds the redact.ts and
  test snapshots the corpus generators import.
- `residual-scripts/`: what wrote `redact.residuals.json`: `gen-residual.mts` / `gen-residual2.mts` (the gate's rows of
  each class, the numbers mapped to synthetic twins and checked sent in clear), `write-repo-residuals.mts` /
  `write-repo-residuals2.mts` (the table, the review rounds' rows added), `write-residuals3.py` and `set-about3.py` (the
  judge's review round 3: the rows the held date-of-birth rule now refuses dropped, the round's harness rows added).
  `gen-residual5.mts` and `write-residuals5.py` (review round 5: the "about" text brought to round 5, and the eight
  failSafe rows tagged "must-stay" that cc3dd7f6 did not send unchanged re-tagged "must-stay-changed-at-base").
- `round-harnesses/`: the judge's review round 3 harnesses whose rows are pinned or measured in ADR 0054
  (`dobperm.mts`, `gluedlabel.mts`, `frames.mts`, `lib.mts`; `natural2.mts`, `units.mts`, `units2.mts`, `extra.mts`,
  `lib-gateway.mts`).

The scripts still carry the absolute paths of the session that wrote them (the gate's corpus, the two checkouts, the
review folders): set those constants to this folder and to the checkouts before a run. Heavy runs go under
`flock /tmp/laneb-heavy.lock`.
