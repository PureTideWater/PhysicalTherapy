# Skeptic C: unseen character / joiner before an initial's period

Verdict: REPRODUCED (pre-existing on base; mechanism right for the unseen characters only).

Probe: my own script $S/skeptic/C/probe.ts, run with `npx tsx` from {head,base}/packages/model-gateway, on the
production path of src/functions/denial-letter.ts: redactLetterForScreen, then holdsIdentifier(text, patient, claims,
checkWorkOf(redacted)); null = refused. Patient JANE Q ZEPHYRA, members SYNMEMBER0042/ZZ7654321, claims SYNCLAIM0001/
C2026000417 (as redact.leaks.test.ts builds them). No letter below is refused on either commit.

| input | head e17c1192 | base 17c234d2 |
|---|---|---|
| `Dear Zephyr A.J.Q., your claim` | `Dear [PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]., your claim` | `Dear [PATIENT_NAME].J.Q., your claim` |
| `Dear Zephyr A\u0085.J\u0085.Q\u0085., your claim` | `Dear [PATIENT_NAME]\u0085.J\u0085.Q\u0085., your claim` | same |
| same with ​, ­, ⁠ | J and Q sent | same |
| `Dear Zephyra J\u0085.Q\u0085., your claim` | `Dear [PATIENT_NAME] [PATIENT_NAME]\u0085.Q\u0085., your claim` | same |
| same with ​ | Q sent | same |
| `Dear Zephyr A/J/Q/`, `A:J:Q:`, `A·J·Q·`, `A。J。Q。` | `[PATIENT_NAME]<sep>J<sep>Q<sep>` | same |
| `Dear Zephyra J/Q/`, `J:Q:` | Q sent | same |
| extra: `Dear J​. Q​. Zephyra, your claim` | `Dear J​. Q​. [PATIENT_NAME], your claim` | same |
| control `Dear Zephyra J.Q.` / `J Q` / `J. Q. Zephyra` | all replaced | all replaced |

Mechanism: right for the unseen characters. redact.ts:1826-1828: itsPeriod needs `view.text[preceding.end] === '.'`, so
with \u0085/​ between the taken range and its period gapFrom = preceding.end, and the gap "\u0085." fails
INITIAL_GAP_AFTER (line 1755, no '.'); likewise `dotted` (candidate.end === '.') is false for `J​.`. The joiners
("/", ":", "·", "。") are a different cause: they are not in INITIAL_GAP_AFTER/INITIAL_GAP at all, so no period
skip is involved. The extra row shows the same gap class also drops initials BEFORE the name.

Severity (corrected): low, pre-existing, not a regression. Every row behaves identically on base except the plain
dotted chain, which head fixes; the finding is that head's new ruling-(A) fix is bypassed by variants, not that head
leaks something base did not. What leaks is only the first and middle initials (J, Q); surname, member IDs and claim
numbers are never sent, and holdsIdentifier does not count initials. Still, the head's own tests treat a sent initial as a
failure to fix, not as a residual: redact.leaks.test.ts:3216-3285 (MOD-25 stage 4, ruling A) pins `Zephyr A.J.Q.` ->
all three replaced and a property asserting "no letter of it is sent"; and the pre-name case `J. Q. Zephyra` is replaced.
So under this product initials beside the patient's name are an identifier to be withheld (contract says so), but they
are a partial identifier only; the inputs need a zero-width/NEL/soft-hyphen/word-joiner char inside an initial chain or
an unusual joiner, plausible from OCR/encoding noise (\u0085 is cp1252 "..." mis-decoded; ­ from hyphenation) but
rare. Should-fix (follow-up), not a blocker for this item.
