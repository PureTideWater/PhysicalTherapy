# Skeptic 2 of 3, security finding S2 (orphan backstops)
- Clone /home/user/sk-pcp-security-S2-1 at c369bc77... (offline frozen install, read only; removed after).
- Repro (log pcp/logs/sk-sec-S2-1-orphan.log): synthetic 3,779-byte xlsx, one sheet of 400,000 unclosed <row>,
  read via readDocumentPages from a tsx parent; parent SIGKILLed at ~4 s; reader reparented to PID 1 at 99-101% CPU,
  still alive 35 s after the kill (past the 1 s ppid check). Killed by hand; nothing left running.
- Corrections: the self-deadline is deadlineMs (60 s) + 5 s, so at 35 s it was not yet due; it cannot fire either way
  while the loop is blocked. In production node is not PID 1: compute.ts sets initProcessEnabled (an init is PID 1);
  the container still stops when the worker exits, so the PID namespace bounds the reader. serve()'s comment already
  says the backstops "run only when the loop is free"; what still overstates is READER_EXIT's comment (:390),
  pages.ts:478 ("a worker stopping mid-read leaves none behind") and ADR 0033 ("killed when the worker exits").
- Verdict: real, not refuted; nit. Fix: qualify those three statements (exit-handler kill on a normal or thrown exit,
  not SIGKILL/OOM kill; orphan exit 3 only when the loop is free; the container stop is the last bound).
