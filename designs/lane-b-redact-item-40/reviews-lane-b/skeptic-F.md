# Skeptic F: long ordinary letter with one fraction and one invisible control refused on cost

Verdict: PARTLY REPRODUCED (the cost blow-up and a refusal of ordinary prose under the product's 100,000-character promise are reproduced; the "5\n" x 28,378 detail is not; severity is availability, not a leak).

Scripts (my own): $S/skeptic/F/probe.ts, $S/skeptic/F/five.ts, run with npx tsx from <tree>/packages/model-gateway.
Path: the gateway's own (denial-letter.ts prepare): redactLetterForScreen, then holdsIdentifier(text, patient, claims, checkWorkOf(redacted)).
Patient JANE Q ZEPHYRA, DOB 1980-03-14, member IDs SYNMEMBER0042 and ZZ7654321; claims SYNCLAIM0001 and C2026000417 (as redact.leaks.test.ts).
Prose: 'We reviewed the claim for date of service 03/02/2026 and the amount paid of $123.45 under the fee schedule. ' repeated to n chars.
Variants appended: plain; half = ' ½'; nel = '\u0085 '; both = ' ½ unit\u0085 '; sup = ' x² unit\u0085 '. CHECK_WORK_BUDGET = 420M.

Redaction work (checkWorkOf), head e17c1192 vs base 17c234d2:
| n | plain | half | nel | both | base (all variants) |
| 30,000 | 27.6M | 55.1M | 84.4M | 140.5M | 27.6M |
| 60,000 | 54.9M | 109.8M | 168.2M | 279.9M | 54.9M |
| 100,000 | 91.4M | 182.8M | 279.8M | REFUSED | 91.4M, sent |

Refusal length thresholds (binary search, +-200 chars):
- head: plain ~254,000; half ~163,500; nel ~118,500; both ~77,600; sup ~76,600.
- base: ~254,000 for every variant (~250,200 for sup).
So on head one ½ and one \u0085 lower the longest sendable ordinary letter from ~254k to ~77.6k chars, below the product's stated budget (time-budget.ts: "a letter of 100,000 characters is redacted and checked within 3 seconds"). Base sends the same 77.6k-100k letters. The claimed "somewhere between 30k and 100k" holds (77.6k).

"5\n" repeated: base already REFUSES 28,378 and 28,379 copies (redaction work 204.7M, check then passes the budget), with or without \u0085; it is not the largest the base sends in my run. The effect is still there at smaller sizes: 20,000 copies + '\u0085' is sent on base (144.3M) and refused on head (420.0M, text replaced). Same for a patient with no digit 5 in any identifier.

Severity: a false refusal (fail-closed, InputRefusedError 'identifier_left'), never an identifier in clear; no stored identifier is sent on any input tried. Head-only (base work is identical across variants). Mechanism is right: an unseen character (\p{C}, \u0085 not in JS \s) sends the whole letter through refusedWithUnseenCharactersJoined, which re-reads the entire letter and charges it on the same counter (~3x); a number character (½, ²) adds a further full re-read (~2x); combined ~5x.

Plausibility: no payer-letter text fixtures exist in fixtures/synthetic (letters enter as PDFs; no letter length cap found in packages/model-gateway or packages/redact beyond the 100k/3 s promise). A 77k-char letter is ~25-30 pages: uncommon for a denial letter (typically 2-10k chars) but plausible for a letter with appended EOB/claim listings, and PDF text extraction can yield stray C1 controls like \u0085 and fractions like 1/2 in fee text. Real but low-frequency, and it breaks the documented 100k promise: worth a fix (charge or bound the re-reads), not a privacy defect.
