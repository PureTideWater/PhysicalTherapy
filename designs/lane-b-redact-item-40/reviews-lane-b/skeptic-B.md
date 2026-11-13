# Skeptic B: holdsNameOrNumber and a \p{Nl}/\p{No} character inside a name

Verdict: PARTLY REPRODUCED. The behaviour reproduces exactly; the framing as a regression and its severity do not.

## Production arguments
apps/worker/src/packets/identifiers.ts builds `names` from the decrypted parts separately (last, first, insured last,
insured first), never a joined full name; `numbers` = claim control no., patient control no., member IDs. The gateway
(packages/model-gateway/src/functions/narrative.ts, prepare -> mentionsIdentifier -> holdsNameOrNumber) refuses the
input with identifier_in_input when it returns true. Probes used names ['ZEPHYRA','JANE'], numbers ['ZZ7654321','76543210'],
and also the full-name form ['JANE ZEPHYRA'].

## Results (scripts: S/skeptic/B/probe.ts, probe2.ts; this Node's ICU gives 1154 \p{Nl}/\p{No} code points, 1012 that do not NFKC to a digit; the reviewer's 953 is a different count, same outcome)
| input | head e17c1192 | base 17c234d2 |
|---|---|---|
| `Patient Zeph<ch>yra x`, all 1154 ch, parts names | 0 caught | 0 caught |
| same, full name 'JANE ZEPHYRA' | 0 | 0 |
| same, input NFKC-normalized first | 0 | 0 |
| `Patient Ja<ch>ne x` | 0 | 0 |
| `Patient Zephↀyra x` / `Zeph²yra` | false / false | false / false |
| `Patient Zeph yra x` (space) | false | false |
| `Patient Zeph·yra x` | false | false |
| `Patient Zeph-yra x` | true | true |
| `Patient Zeph​yra x` (unseen) | true | true |
| `Patient Zephyra<ch> x` (beside) | 1154 caught | 30 caught |
| `Claim 7654<ch>3210 x` | 1154 caught | 0 caught |
| `Member ZZ765<ch>4321 x` | 1154 caught | 0 caught |
| `Claim 76543210<ch> x` | 1154 caught | 87 caught |
| verifier nameOrNumberMatches('Patient Zephↀyra x') | [] | [] |

## Reasoning
The claim's facts hold: a number character inside a name is not caught on head or base, numbers in the same
position are now refused on head where base sent them, and the stated mechanism is right (the 'apart' reading at
redact.ts:5454 turns the character into a space, and the narrative's reading deliberately does not read a name split
apart: 'Zeph yra' is false on both, and redact.leaks.test.ts:840-843 and 1768-1772 pin that "a part split so is no
name" for the narrative check, which the packet verifier shares). So this is not a regression of item 40 and not a
new leak: head is identical to base for names inside and strictly stronger for numbers and for a character beside a
name. It is the already-known, test-pinned cost of the narrative reading not joining a name split by a separator,
reached with one more kind of separator. Severity: low. A stored name could be sent in clear only if the
pattern-level facts held a name with an exotic number character planted inside it (the facts are code-built
pattern figures, not free text), and the same holds for a plain space or middle dot today. Not a blocker for the
change; at most a note that item 40 could have joined (dropped) the character for names as it does unseen characters.
