# The judge's review round 4 harnesses (synthetic only), for designs/lane-b-redact-ssn-phone/gate/round-harnesses/round4/

ADR 0054's round-4 counts come from these, run by `harness-all.sh` against cc3dd7f6 (A) and the candidate (B):
- phi/: gap.mts (PHIJ4-1: 4,992 letters, 1,356 sent at 69a3a2fe, 0 at 88a2882b), init2.mts (PHIJ4-2: 6,808, 2,024 -> 0),
  short5.mts (1,920, 105 -> 0), short4.mts, own4.mts, numid4.mts, heldmis.mts, perm.mts (the skeptic's QJZ / seven parts);
  frames4.json is their 296 held frames.
- gateway/: natural4.mts, natural5.mts (GATEWAYJ4-1: 312 sentences, 66 refused at 69a3a2fe, 0 at 88a2882b),
  phij31prop4.mts (the widened PHIJ3-1 property replica: 28 of 30,000 runs before the placeholder rule read wide gaps, 0 of 60,000 at d99f666a),
  skeptic/ (repro1, mod, extra, dirty: the skeptic's rows and 756 dirty variants, none cc3dd7f6 refused sent).
- r4.mts, may.mts, may2.mts: the round's pinned rows against both trees.
The scripts carry the session's absolute paths (the two checkouts, the scratch folders): set them before a run.
