# Fix check K2, round 1 (adversarial verifier)

Scope: security N1, critic G3, critic G4, docs (ADR 0071, ADR 0066 N32, ci.md, content-updates.md, reconciliation-001).

- [x] Clone /home/user/fx-cft-K2-1 at WIP head 6a3c9258... 
- [x] Remote: WIP 6a3c9258... = origin; no co-001/ci-findings-transport; live base claude/build-platform 35422a92... (#116, committed 22:33 UTC), past c7bed0f7... (#117) the records name (checked "~22:30 UTC"). G4: records already stale (nit).
- [x] Install 0; content-calendar tests 15/15 green at 6a3c9258 (K2-1/green.log).
- [x] Security N1 code: both jobs `timeout -k 10 ... gh run download ... > /dev/null 2>&1 || code=$?`; fixed printf line; head/jq stderr to /dev/null; no other gh-derived text in the block. Mutant: both redirects -> `2>/dev/null` (stdout leaks) fails 3 (mut-stdout.log); handoff-only stderr leak fails 1 (mut-handoff-stderr.log, by the equality test). Fake prints the signed address on stdout on every download call, so every path's assertion bites. Workflow restored, tree clean.
- [x] Docs: ADR 0071 Amendment, N32, ci.md, content-updates.md, reconciliation-001:685 match the code. Nits: ci.md handoff row does not say its failed tries log only the fixed line; content-updates "124: stopped after 60 seconds" omits 137 when the kill after 10 s is needed.
- [x] G3: extract.mjs on the clone's workflow writes proposed-notify.sh/proposed-handoff.sh byte-identical to proof/work (651d4854...6f20, 495a4dde...e6fe); prove.mjs exit 0 in 20 s; output byte-identical to proof/local-proof.txt (6728e00c...55a9); script hashes match §7 (b306eeb0...c186, 2e035f0a...006f). Stall cases present (notify 1 and 3 stalls, exit 124 logged; handoff 1 stall then artifact, 3 stalls). Nit: §7's row "Any case: signed address ... never" is wider than local-proof.txt records (sections 2 and 3 print no leak column); a patched copy printing it shows false in every 2/3 case (K2-1/s/prove-leak.mjs).
- [x] G4: records name c7bed0f7... (#117) as live base "checked ~22:30 UTC", written 22:57 UTC; live is 35422a92... (#116, 22:33 UTC). 30871f72..35422a92 touches no workflow, tools/test, ci.md, content-updates or ADR 0066/0071 file. Nit: refresh the base line before the base merge.
- [x] Ops files: no model name, no new full-length hash.
- [x] Clone removed.

Verdict: security N1, G3 resolved; G4 resolved at its check time, now stale (nit); docs match the code, two nits. No blocking, no should.
