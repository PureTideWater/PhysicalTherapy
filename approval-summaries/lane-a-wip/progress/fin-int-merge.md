# fin-int-merge progress
- start: /home/user/interest at d39b72c0, clean
- merge --no-ff --no-commit 048bc843 started (merge-base ce408d2f). Conflict: docs/product/domain-model.md only (generated -> regenerate). Auto-merged both-sides: reconciliation-001.md, test-matrix.md, synth matrix.ts, registry.ts, watched-paths.txt.
- 20261110 re-read: merge changes 20261107 (mail only, no ledger) and not 20261109; ledger_entry_within_*/ledger: lock bodies unmoved -> 20261110 unchanged, no marker route needed.
- regenerated: install (lock unchanged), domain-model --out --strict on tp_intmerge_1 (100 tables, 0 functions written), watched.ts --write (552 lines, unchanged), synth --all (0 written). domain-model staged.
- typecheck pass (22 projects); lint pass (1,737 files, 0/0); db:domain-model --check pass
- unit tests of merge-touched files: 17 files / 326 tests passed
- db tests of merge-touched files (excl. triage.large): 5 files / 172 tests passed
- committed 379fed9f, pushed co-001/ledger-interest-once (e0646746..379fed9f) through pre-push hook; tp_intmerge_1 dropped. DONE. Open: triage.large.db.test.ts not run (integrator's full suite).
