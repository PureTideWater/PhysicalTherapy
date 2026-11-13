# Lane B, Queues item 39: status

<!-- RESUME-BLOCK -->
- **Stage:** design note only (no product build, no PR). Folder `designs/lane-b-redact-item-39/`.
- **Done:** W25's figures reproduced (cold 4.13 s at 1,000x9; warm 6,300x9 over 3 s); causes found (cold: a RegExp per
  form per check, compiled by V8 on first use; G-1's square: viewOf's per-check store searched with findIndex once per
  identifier); prototypes as source patches (`variants.mts`); the full gate base against the recommended prototype
  (`aclazy`): 975,489 letters, 0 differing; item 40's windowed re-read (`item40/`): S-1 measured, item 40's generated
  set and the full gate head against the windows, 0 differing.
- **Next:** timing battery (`battery.sh`, out/battery.txt), then design-note.md, push, report to the orchestrator.
- **Trees:** base 4d40557f; item 40 head 107c87e1 (newer than e17c1192).
<!-- /RESUME-BLOCK -->
