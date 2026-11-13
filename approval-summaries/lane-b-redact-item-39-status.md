# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** design note only (no product build, no PR). Folder `designs/lane-b-redact-item-39/`.
- **Done:** W25's figures reproduced (cold 4.13 s at 1,000x9; warm 6,300x9 over 3 s); causes found (cold: a RegExp per
  form per check, compiled by V8 on first use; G-1's square: viewOf's per-check store searched with findIndex once per
  identifier); prototypes as source patches (`variants.mts`); the full gate base against the recommended prototype
  (`aclazy`): 975,489 letters, 0 differing; item 40's windowed re-read (`item40/`): S-1 measured, item 40's generated
  set and the full gate head against the windows, 0 differing.
- **Done too:** timing battery (98 rows, out/battery-table.md; same outputs and units on every variant); design-note.md
  written (recommendation and stages, section 6; questions, section 8). Reported to the orchestrator.
- **Next:** none in this stage. The build (co-001/redact-item-39) waits for the rulings in section 8.
- **Trees:** base 4d40557f; item 40 head 107c87e1 (newer than e17c1192).
<!-- /RESUME-BLOCK -->
