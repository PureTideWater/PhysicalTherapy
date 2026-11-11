# Build the pull request's description from W5's drafts, made current for W13's rounds. Arg 1: the checks table file.
import sys
D='/home/user/ops/designs/lane-b-redact-ssn-phone-leaks/'
def rep(s, old, new):
    assert s.count(old) == 1, (old[:70], s.count(old)); return s.replace(old, new)
r = open(D+'pr-reviews-draft.md', encoding='utf-8').read().rstrip('\n')
r = rep(r, "and one reviewer with all three lenses (what is sent, what must stay, logic and time) on each of the last two (J, K). Every",
           "one reviewer with all three lenses (what is sent, what must stay, logic and time) on each of the next two (J, K), and one on each of the last three deltas, which are a few lines each (L, M, N). Every")
r = rep(r, "@@AUDIT@@", "456,096")
r = rep(r, "| K (three lenses, on 74c32149's delta) | @@K@@ | @@K_RESOLUTION@@ |",
"""| K (three lenses, on 74c32149's delta) | No blocking finding: no letter ef3e8d20 refuses sent and no digit shown that it redacts in 192,590 generated letters, no refusal of ordinary text outside the recorded costs, no slow letter. K-1 (major by its brief): a label's reach is counted in characters and a CR LF counts two, so a Social Security label 24 characters before a number that a noun names owns it in the writing with LF and not with CR LF. Five lesser forms. | Recorded, not changed here (the orchestrator's ruling of 2026-11-11): ef3e8d20, cc3dd7f6 and every head of this build but one send the K-1 letter. It and the lesser forms are residuals in ADR 0054, pinned as sent today in `redact.leaks.test.ts`, and queued to be closed before any real PHI is processed (`LANES.md` Queues item 26). |
| The fuzzers on 74c32149 (the first delta review's, seed 5923) | One letter in 31,200 showed a date that ef3e8d20's redaction replaced: for a patient whose one member ID ends another, the longer one written with a look-alike digit, a line break and a date. The Social Security pattern's match that begins in the ID's last digit was withheld for the check, the ID's placeholder replaced the run, and the date was sent as written. On every head of the build since the look-alike forms were read; no reviewer's generator drew such a patient. | Fixed in ac412151 by one condition in `matchesIn` (the orchestrator's ruling: fixed, not recorded): a pattern's match is withheld only for a run that no match of the call's own covers whole. Three rows and a property that failed first; the property's space in full reads 40 letters before and none after. |
| L (three lenses, on ac412151's delta) | No blocking finding: nothing ef3e8d20 refuses sent and nothing it redacts shown over about 480,000 generated letters; all 2,410 letters that take the branch where the covering match is not applied are refused. L-1 (major): a pattern's number that merges under the call's own placeholder was hidden in what is sent, which is right, and was no longer offered to the other-patient screen as it is written, where ef3e8d20 offers it; the build already did this for a patient with one identifier. L-2 (major, must stay, narrow): a letter with pattern-shaped digits right before such a writing of the ID under a phone or Social Security label is refused where ef3e8d20 sent it (32 of 4,480 letters of its family). | L-1 fixed in 247a53e3 (ruling: fix): the screen reads the letter once more with the call's own matches alone replaced. L-2 recorded as the fix's cost in ADR 0054, the safer reading, as it already was for a patient with one identifier. Its comment notes settled. |
| M (on 247a53e3's delta: what is sent unchanged, the screen offered at least what ef3e8d20 offers) | What is sent is unchanged and no candidate is lost over about 30,000 letters; time ratio 1.3 at most. M-1 (major): where a piece of the hidden number is itself a short identifier of the call's own (a claim number 0123), the second reading replaced that piece and the number was still not offered (576 of 11,136 letters of its family). | Fixed in c9dddaa7 (ruling: fix, the last change to `redact.ts`): the second reading follows `merge`'s own rule, an own match inside a pattern's number is that number's. Four rows that failed first. |
| N (on c9dddaa7's three lines, the same scope) | Nothing blocking: what is sent unchanged, no candidate lost, no identifier of the call's own offered in its own compact form, over about 20,000 letters. N-1 and N-2 (major by its brief): an identifier of the call's own that stands inside a hidden number is now offered to the screen joined to what follows, or in another script's digits, where no tree offered it; every tree offers the same where the number is sent as `[PHONE]`. | Recorded (ruling: any finding of this review that is not blocking is recorded): more is asked of the practice's own records, in memory, and nothing more is sent. Pinned as offered today in `redact.leaks.test.ts`, in ADR 0054, and in `LANES.md` Queues item 26. |""")
b = open(D+'pr-body-draft.md', encoding='utf-8').read()
b = rep(b, """- **A letter that itself writes one of the checks' three control characters (U+0001 to U+0003) is refused whole.**""",
"""- **The other-patient screen is offered a number that merges under one of the call's own placeholders.** Such a number is
  hidden in what is sent; the screen now reads the letter once more with the call's own matches alone replaced, so it is
  asked about the number as it is written, as ef3e8d20 asks.
- **A letter that itself writes one of the checks' three control characters (U+0001 to U+0003) is refused whole.**""")
b = rep(b, """## What it does not change
""", """## What is still not covered

Recorded in ADR 0054's amendment, each pinned in `redact.leaks.test.ts` as it behaves today, and queued in `LANES.md`
Queues item 26 to be closed before any real PHI is processed:

- **A Social Security label that a CR LF puts out of reach (review K-1).** A label owns a number up to 24 characters
  after it, counted in characters, and a CR LF counts as two. `SSN on file. Statement`, a line break and `No.
  900-12-3456150.00` is refused when the line break is LF and sent as written when it is CR LF, because the noun
  "Statement" then names the number as a reference. ef3e8d20 and cc3dd7f6 send it too; this change does not make it worse.
- **Two name forms (MOD-23).** A name written with a lower-case piece after a space or a period (`Zephy ra`) or letter by
  letter (`Z e p h y r a`) is sent in clear in a letter with no held range, as on ef3e8d20 and cc3dd7f6.
- **The screen is asked more than before in one case (reviews N-1, N-2).** Where one of the call's own identifiers stands
  inside a number that is hidden under another of its placeholders, the other-patient screen is now asked about that
  identifier joined to what follows it, or in another script's digits. Nothing more is sent; a match in the practice's
  records would refuse the letter.

The full list of forms no rule reads is the paragraph that ends the amendment.

## What it does not change
""")
b = rep(b, "@@REVIEWS@@", r)
b = rep(b, "https://claude.ai/code/session_019i9ifC8ouxG6CLPdZtgAcJ", "https://claude.ai/code/session_019i9ifADZcDuzjeUkfedYiW")
if len(sys.argv) > 1:
    b = rep(b, "@@CHECKS@@", open(sys.argv[1], encoding='utf-8').read().rstrip('\n'))
open('/home/user/work/w13/pr-body.md', 'w', encoding='utf-8').write(b)
print('body', len(b), 'characters;', 'placeholders left:', b.count('@@'))
