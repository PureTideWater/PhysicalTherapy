# Build ADR 0054's amendment from W5's draft with W13's rounds (L, M, N), and append it to the ADR in the worktree.
import sys, glob
N_TEXT = open('/home/user/work/w13/n-text.txt', encoding='utf-8').read().strip()
GATE_MS = sys.argv[1]            # slowest letter of the gate's timing set on the final tree
draft = open('/home/user/ops/designs/lane-b-redact-ssn-phone-leaks/adr-0054-amendment-draft.md', encoding='utf-8').read()
def rep(s, old, new):
    assert s.count(old) == 1, (old[:60], s.count(old))
    return s.replace(old, new)
d = draft
d = rep(d, "the letter reader leaves the run whole and its check refuses it). The first\n    build tested instead",
"""the letter reader leaves the run whole and its check refuses it). The letter
    reader leaves a pattern's match so only for a run that no match of the call's own covers whole. Where one member ID
    ends another (`ZZ7654321` and `7654321`), the longer one written with a look-alike digit is such a run and is the
    longer one's own match whole: until this build's last round the pattern's match was withheld there, the ID's
    placeholder replaced the run, nothing was left for the check, and what ef3e8d20's pattern read from the run's last
    digit on was sent as written (`ID ZZ76543<U+A6EF>1`, a line break and `01-02-2020`: ef3e8d20 reads the 1, the break
    and the date as a Social Security number and sends `ID ZZ76543<U+A6EF>[SSN]`; the build sent `ID [MEMBER_ID]` and the
    date). It was the one exception to this principle, found by the builder's fuzzer after review K (one letter in
    31,200; no reviewer's generator had drawn a patient whose one identifier ends another), and it is closed by one
    condition in `matchesIn`: the pattern's match is applied there and merges under the ID's placeholder, as it does for
    a patient with one member ID, and where the covering match is not applied (the settled matches alone) the scan as
    ef3e8d20 read it refuses the text (2,410 such letters in review L, all refused). Its cost, the safer reading: a
    letter with pattern-shaped digits right before such a writing of the ID, under a phone or Social Security label, is
    refused where ef3e8d20 and the build before sent it (`Tel. 345-62`, a line break and `03l41980` before a held range,
    for a patient whose member IDs include 03141980 and one that ends it: 32 of 4,480 letters of that family, review
    L-2), as it already was for a patient with one identifier. The first
    build tested instead""")
d = rep(d, "368,640 fuzz letters by the builder", "456,096 fuzz letters by the builder")
d = rep(d, """last change: no letter ef3e8d20 refuses that this head sends in 162,416 letters, and no match left as written and
    sent in 61,696; the first delta review's two fuzzers, 62,688 letters: 79 such letters, every one the patient whose
    names are months.""",
"""last change to what is sent: no letter ef3e8d20 refuses that this head sends in 153,008 letters, and no match left as
    written and sent in 49,600; the first delta review's two fuzzers, 79,584 letters: 104 such letters, every one the
    patient whose names are months, and no letter in which this head shows what ef3e8d20's redaction replaced (one on the
    round before, the withheld match above). The property that found nothing for eleven rounds is now run for a patient
    whose one member ID ends another too, in the tests and in full (44,352 letters: 40 on the round before, none now).""")
d = rep(d, "  - *Reviews.* Two adversarial reviews of the design;",
"""  - *The one-patient screen.* A pattern's number that merges under one of the call's own placeholders is hidden in what
    is sent and is still offered to the other-patient check as it is written: `redactLetterForScreen` reads the letter
    once more with the call's own matches alone replaced and adds that reading's candidates (`Member ID: ZZ1980O314`, a
    line break and `555-0123` for member ID ZZ19800314 is sent as `Member ID: [MEMBER_ID]` and offers 5550123, as
    ef3e8d20 offers it). The build had offered only the pattern's own reading there (3145550123) for a patient with one
    identifier, and the withheld match's fix carried that to a patient whose identifier ends or begins another, whose
    letter the build before refused (review L-1: 900 of 7,200 letters of that family). A match of the call's own inside
    a pattern's number, and not the whole of it, is that number's in this reading as it is in `merge` (R6b): a claim
    number 0123 or a member ID 555 that is a piece of the number stays as written with it (review M-1: 576 of 11,136
    letters of that family before, none now). What is sent does not change, no candidate is dropped and none of the
    call's own identifiers is offered in its own compact form (51,840 and 21,504 letters of the two families and about 75,000 generated ones);
    a run the base offers only because it does not read the call's own identifier in a look-alike writing (a piece of
    that identifier joined to its neighbour) is not offered, the identifier being replaced. Recorded, and pinned in the
    leaks tests as it is offered today (review N-1 and N-2; `LANES.md` Queues item 26): an identifier of the call's own
    that stands inside such a hidden number is the number's in this reading, so the screen is asked about it joined to
    what follows (`ID 77 202-555-0123 88` for member IDs 77202 and 5550123 is sent as `ID [MEMBER_ID] 88` and offers
    555012388) or in another script's digits (`555<U+0660>123`), where no tree before asked, though every tree asks the
    same where the number is sent as `[PHONE]`. It is more asked of the practice's own records, in memory, and nothing
    more sent; a records match on such a run would refuse the letter. The second reading costs about a quarter more time
    in this function on a 200 KB letter with a merged number on every line (548 and 675 ms).
  - *Reviews.* Two adversarial reviews of the design;""")
d = rep(d, """residuals below). Every finding was run before it was
    fixed, and each""",
"""residuals below); one of the delta that closed the withheld match (L: no letter ef3e8d20 refuses sent and nothing its
    redaction replaced shown over about 480,000 generated letters; L-1, the screen's candidates, and L-2, the cost
    recorded above); one of the screen's second reading (M: what is sent unchanged and no candidate lost over about
    30,000 letters; M-1, a short identifier of the call's own inside the number); and one of the three lines that closed
    M-1 (""" + N_TEXT + """). Every finding was run before it was
    fixed, and each""")
d = rep(d, "takes 1,035 ms (514 ms at cc3dd7f6; the budget is 3,000 ms)", "takes " + GATE_MS + " ms (" + sys.argv[2] + " ms at cc3dd7f6; the budget is 3,000 ms)")
open('/home/user/work/w13/amendment.md', 'w', encoding='utf-8').write(d)
print('amendment built', len(d))

adr = glob.glob('/home/user/leaks/docs/adr/0054-*.md')[0]
a = open(adr, encoding='utf-8').read()
assert 'co-001/redact-ssn-phone-leaks`, 2026-11-11' not in a
open(adr, 'w', encoding='utf-8').write(a.rstrip('\n') + '\n' + d.rstrip('\n') + '\n')
print('appended to', adr.split('/')[-1][:40])
