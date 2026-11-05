import re, sys, json
D='/tmp/claude-0/-home-user-PhysicalTherapy/e935a935-d2ff-5a27-860c-22677590c441/scratchpad/intfix'
before=open(f'{D}/body/body-before.md').read()
summary=open(f'{D}/logs/dm-summary.log').read().strip()
checks=open(f'{D}/body/checks.md').read().strip()
findings=open(f'{D}/body/findings.md').read().strip()

def section(text, title):
    m=re.search(r'^## '+re.escape(title)+r'\n(.*?)(?=^## |\Z)', text, re.S|re.M)
    return m.group(0)

what=section(before,'What changes')
# words: the reported group's label and note
old_words="""then once: "Interest is counted only as a check pays it or takes it back (PLB L6), in the list above." The empty text stays "No interest paid.\""""
new_words="""set apart as a group of their own under the label "Reported on the claim (AMT I), not counted" (its list named the same), then once: "Interest is counted only as a check pays it or takes it back (PLB L6), in the Interest list above." The empty text stays "No interest paid." (review UX-INT-1)"""
assert old_words in what, 'words'
what=what.replace(old_words,new_words)
old_once="""- **Once, however many reconciles run (D6).**"""
new_once="""- **Whom a named PLB L6 reaches (D5; review LED-R1).** A PLB L6 that names a chain reaches the case lines matched to any claim of that chain, whichever claim the reference carries: one naming the original, whose control number its reversal carries too, credits the lines its correction approved, as naming the correction or nothing does. Before the fix round it credited nothing.
- **Take-backs first (D5; review LED-R2).** One PLB L6 writes one entry on a line, so its take-backs are written before its payments, and a payment goes to the lines they left. When two chains' draws of opposite signs meet on a line no other line can take (an unlinked correction beside a linked chain's take-back, LED-24 `two-chains.835`), the payment is the one left unwritten: the figure errs low, never above the cash.
- **Once, however many reconciles run (D6).**"""
assert old_once in what
what=what.replace(old_once,new_once)
old_words_hdr="""- **What a person reads** (design section 7, word for word; `pnpm lint:copy` reads every one):"""
new_words_hdr="""- **What a person reads** (design section 7, word for word, but for the two marked as the fix round's; `pnpm lint:copy` reads every one):"""
assert old_words_hdr in what
what=what.replace(old_words_hdr,new_words_hdr)
old_nolist="""  - No screen offers the reversal of an interest match."""
new_nolist="""  - No screen offers the reversal of an interest match.
  - **Words the design did not list** (the fix round, review UX-INT-1): the group label "Reported on the claim (AMT I), not counted", and "in the Interest list above" where section 7 has "in the list above". Design section 7 is to be amended to match."""
assert old_nolist in what
what=what.replace(old_nolist,new_nolist)
old_mig="""  - A preflight checks that `ledger_match_rules()` is the body of 20261023120000 it replaces, that `ledger_entry_within_interest()` does not exist yet, and that `claim_by_superseded` exists."""
new_mig="""  - A preflight checks that `ledger_match_rules()` is the body of 20261023120000 it replaces, that `ledger_entry_within_interest()` does not exist yet, and that `claim_by_superseded` exists.
  - The table locks, without a queue (review INT-REL-3): it takes `ledger_entry`'s and `ledger_match`'s ACCESS EXCLUSIVE locks together with NOWAIT, once a second, up to 300 tries, as SUITE-CAP-1b's migration takes its own (ADR 0083). A refused try holds and queues nothing, so a reconcile caught between its read of `ledger_entry` and of `ledger_match`, or a page reading them the other way round, goes on and never deadlocks (40P01); if the tables stay in use for five minutes it fails with "ledger_entry or ledger_match stayed in use for five minutes; run the deploy again (docs/adr/0084)" before any service moves."""
assert old_mig in what
what=what.replace(old_mig,new_mig)
old_win="""  - In the deploy window, adding `seq` and validating the two CHECKs hold ACCESS EXCLUSIVE locks on `ledger_match` and `ledger_entry` to the migration's end; a reconcile or ledger page waits, then proceeds (well under a second at launch size)."""
new_win="""  - In the deploy window, once the loop holds them, the two locks last to the migration's end (adding `seq` and validating the two CHECKs); a reconcile or ledger page waits, then proceeds (well under a second at launch size)."""
assert old_win in what
what=what.replace(old_win,new_win)
old_rec="""Since 74a6b290, a take-back is also cut to the line's interest as a whole, so two chains on one line after a specialist's correction can never meet the line floor and roll back a practice's reconcile."""
new_rec="""Since 74a6b290, a take-back is also cut to the line's interest as a whole, so two chains on one line after a specialist's correction can never meet the line floor and roll back a practice's reconcile. The interest path reads each claim's standing claim matches, each PLB L6's entries, each interest match's chain and each line's holdings through lookups built once a pass and kept current as it writes (review INT-REL-2): a draw reads only its own claims' lines, never every case line against every match, and the attribution's rows are grouped once by remittance, hash and chain."""
assert old_rec in what
what=what.replace(old_rec,new_rec)
old_tests="""and the new journey `apps/web/e2e/ledger-interest.spec.ts`."""
new_tests="""and the new journey `apps/web/e2e/ledger-interest.spec.ts`, which signs in a billing manager of its own, `interest-manager` (`apps/web/scripts/synthetic-personas.ts`; review INT-REL-1). The fix round adds LED-23 `named-original.835` and `later-l6-original.835`, LED-24 `two-chains.835`, the deploy-window test `packages/db/src/ledger-interest.db.test.ts`, and CAS-42.3 (`reconcile.large.db.test.ts`) with the implementation guide's interest in every check: AMT I 0.50 on each correction and one PLB L6 per check, credited once and walked again by the measured pass within its 150 s budget."""
assert old_tests in what
what=what.replace(old_tests,new_tests)
old_docs="""- **Documents:** ADR 0084 (new, with the founder's exception word for word);"""
new_docs="""- **Documents:** ADR 0084 (new, with the founder's exception word for word; the fix round amends D5 (a named chain's claims, the take-back's cut to the line's interest as a whole, take-backs first), D16 (the lock loop) and its consequences (two chains on one line; at size));"""
assert old_docs in what
what=what.replace(old_docs,new_docs)
# base merges
m=re.search(r'- \*\*This round:\*\*.*?\n(?=- \*\*Earlier:\*\*)', what, re.S)
assert m
what=what.replace(m.group(0), """- **The fix round:** `claude/build-platform` 0f4a5ed5 (#125, Cognito's code emails) merged into a8b4a088 as 15f3359d, then 23b25ad0 (#127, a payer letter's SSN and phone numbers redacted) into 35e7762a as 23369ae6, the head. No conflict in either: `test-matrix.md`, the synth matrix and registry, `watched-paths.txt`, `PRD.md` and `reconciliation-001.md` auto-merged with every line either side added kept. Neither delta touches a migration, function file, ledger or reconcile file. Each time: `pnpm install` up to date, `watched.ts --write` 577 lines unchanged, `pnpm db:domain-model --out --strict` on a freshly migrated database (the provenance line only), `synth --all` 0 written.
- **Before it:** f7d609cc (SUITE-CAP-1b merged as #110, with the founder's approval line 61fc4e6c, its provenance commit 5199c2a6 and #121's brand settlement), merged into 650a3108 as c49367c5: one conflict, in `docs/product/domain-model.md`, on the provenance and approval lines, the base's side taken and regenerated.
""")
what=what.replace("- **Earlier:** 1b's heads","- **Earlier still:** 1b's heads")
old_reread="""The marker route was not used."""
new_reread="""The marker route was not used for the merges. The fix round edited 20261110090000 once, through the new-migration marker route (shell-created, trap-removed, never committed), for its lock loop and header (review INT-REL-3), with its failing-first test; no object, body, check or grant changed, so the function files did not."""
assert old_reread in what
what=what.replace(old_reread,new_reread)

why=section(before,'Why')
notchange=section(before,'What it does not change')
nc_old="""Ledger (`packages/ledger`): changes, within the granted exception only: `interest.ts` and its tests,"""
assert nc_old in notchange
freeze=section(before,'Freeze exception')
fz_old="""- **This pull request stays within it.** Of the ledger files, it changes only those section 10.1 lists (`pass.ts`, listed, needed no change). Every other changed file is a test, a synthetic fixture, a generated file or a record that design section 11 lists, plus `streamed.db.test.ts` (it reads matches by `seq`) and LED-25's generated `expected.json`."""
fz_new="""- **This pull request stays within it.** Of the ledger files, it changes only those section 10.1 lists (`pass.ts`, listed, needed no change). Every other changed file is a test, a synthetic fixture, a generated file or a record that design section 11 lists, plus `streamed.db.test.ts` (it reads matches by `seq`) and LED-25's generated `expected.json`.
- **The fix round stays within it too.** Its code changes are in listed files only: `packages/ledger/src/interest.ts` (take-backs first; behaviour 4's "never below zero on a line", and behaviour 1's caps, unchanged), `interest-chains.ts` and `remittances.ts` (a named chain's claims, PRD 13's granted "the claims the PLB L6 names", behaviour 2; the lookups, which change no amount), the reconciliation display and page (the reported rows' label), and the migration, whose new lock loop takes the two tables' locks and changes no object, so section 10.1's DDL is unchanged. Its other files are tests, synthetic fixtures and a synthetic e2e persona (`synthetic-personas.ts`), ADR 0084 and the generated domain model. None changes the WO's naming, the walk's order, a principal amount, recovered or the proof cap."""
assert fz_old in freeze
freeze=freeze.replace(fz_old,fz_new)

dm=section(before,'Domain model')
dm_old=re.search(r'- \*\*SHA-256 before and after\.\*\*.*?\n(?=- \*\*Function files)', dm, re.S).group(0)
dm_new="""- **SHA-256 before and after.** Before: `e024cf9fce732e2c94795c0cacf8dfc890cef486413c92039108034854efc4df`, the base's, approved by Tyler Williams on 2026-11-05 (61fc4e6c). After: `f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7` at 23369ae6, as `--summary-since` and `--check --require-approval` print it. It moved from 47887070…eb8ef because the fix round's lock loop changed the migration's SHA-256 (now `35e53da4b31b3c6671800eba9591db9a3b10af6a9a1f154ff28e3fb281f37741`) and the ADRs its header cites (ADR 0083 joins 0009 and 0084); the schema did not change. The approval line is line 7469, the document's last line, and it is blank. Both are provisional until the final head.
"""
dm=dm.replace(dm_old,dm_new)
dm=dm.replace("""- **Function files:** the 2 listed above, 1 added and 0 removed, none flagged SECURITY DEFINER, tenant scope, privileges or PUBLIC. Each diff was read:""","""- **Function files:** the 2 listed above, 1 added and 0 removed, none flagged SECURITY DEFINER, tenant scope, privileges or PUBLIC, unchanged by the fix round (`--out` wrote 0 of 382). Each diff was read:""")
approval=section(before,"The founder's approval")
footer = approval  # includes trailer
body='\n\n'.join(x.strip('\n') for x in [summary, what, why, notchange, '## Checks\n\n'+checks, "## Reviewer agents' findings\n\n"+findings, freeze, dm, approval])+'\n'
open(f'{D}/body/body-new.md','w').write(body)
print(len(body))
