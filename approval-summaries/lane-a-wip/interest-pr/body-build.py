import re,sys
S='/tmp/claude-0/-home-user-PhysicalTherapy/8410bd9b-2512-5777-b6c2-5d26543110f9/scratchpad'
b=open(f'{S}/body-before.md').read()
summary=open(f'{S}/dm-summary.md').read().strip()
CAS=open(f'{S}/cas425.txt').read().strip()
MUT=open(f'{S}/mutation.txt').read().strip()
def sec(title):
    m=re.search(r'^## '+re.escape(title)+r'\n(.*?)(?=^## |\Z)', b, re.S|re.M); assert m, title; return m.group(0).rstrip()+'\n'
what=sec('What changes')
later='''
**Rounds 3 to 6 (after 9824f4e9; ADR 0084 D13 to D19).** No migration, table, index or grant changed in them; the migration's header wording did, which is why the document's hash is now `bb7662c6…`.

- **Interest never ends a reconcile above the cash (D18).** Within one reconcile the PLB L6s are walked again until a walk writes nothing, at most (the entries they can still write) + 1 walks. A walk that still writes at the limit is a defect: the reconcile is refused (`InterestUnsettled`), its transaction rolls back whole, the job is retried, and the log names the job, the practice and the walk count, never an amount.
- **A take-back written in part, and a person's later match (MONEY-R4-1, R2M2-1).** A take-back counts whole only when written whole; interest a later hand match would put out of the PLB L6's reach is kept off the line.
- **One chain's interest on a line at a time (D19; RVM5-1, blocking, found in round 5).** One PLB L6 taking back two chains' interest held on the same line could write only one entry there (one entry per PLB L6 and line, as granted), leaving the second above the cash. A payment of a chain is now kept off a line while the line holds another chain's interest; it is written once the line is free, if the PLB L6 still owes it. See "The trade-off for the founder" below.
- **The chain walk reads each step's claim by its key, whatever the planner's statistics (round 6).** With no column statistics on `claim` (just loaded, not yet analyzed) the walk was planned as a hash of every claim of the practice once a step, and a 2,000-line reconcile did not end (CI's `db (1/4)`, cancelled twice). Same rows, a fenced keyed read; 32.5 s with no statistics, 21.1 s with (budget 60 s).
- **The base's pass-level reconcile (#134, ADR 0087) and lock rule (#136, ADR 0092) are merged in.** #134's per-line reference (CAS-49) now runs this pull request's interest step and reads `ledger_match.seq`; CAS-49.1 holds at zero the runs whose settle entries would differ row for row.
'''
what=what.rstrip()+'\n'+later
checks=f'''## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

CI is the suite of record. On the head, 8a61c612 (base 06cde5eb merged; the base has since moved, see the last section):

| Check | Result |
| --- | --- |
| `static`, `lint`, `build`, `images`, `unit`, `db (1/4)` to `db (4/4)`, `e2e (1/2)`, `e2e (2/2)` | Passed ([run 42946014889](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/42946014889)). `db (1/4)` in 11.5 min; it was cancelled at 20 min on bf2fc44f and e4ed0f0a with CAS-42.3 unfinished (the planner defect above, fixed in b8b4ec0d). |
| `domain model` | **Did not pass, expected:** `--check` and `--strict` hold; `--require-approval` fails on the blank approval line alone (SHA-256 `bb7662c681fbcc658b9845b83da6a1b8a0df13759a685849cde58d48fb456bf8`). |
| `all green` | **Did not pass**, from `domain model` only. |
| `mutation` | {MUT} |
| `release-capacity` (CAS-42.5, the weekly real-size run, dispatched by hand) | {CAS} |

Locally: the full suite ran once on f0a3b6ad (before the base moved), green through the end-to-end journeys and the money-ledger mutation shard, then was stopped for the base merge. On the merged tree: typecheck, lint, `lint:copy`, `lint:logs`, `check:fixtures`, `verify-content` and `db:domain-model --check --strict` passed on 97225576; db shard 1 passed 3,347 of 3,347 on e4ed0f0a; the reconcile, interest, chain, pass-equality and reconciliation-route database tests passed on 8a61c612's tree (169 of 169), CAS-42.3 at 21.1 s. No third full local run was made: the container restarted twice mid-run. Red first: RVM5-1 in the database (11.40 on the lines against 5.40 and 6.00 of cash) and in the composing property; the chain walk's plan test on the plain join.
'''
f=sec("Reviewer agents' findings")
for drop in ['**F-M2-3**, **DB2-3**','**F-M2-4**, **DB2-2**']:
    i=f.index(drop); a=f.rfind('\n',0,i)+1; e=f.index('\n',i)+1; f=f[:a]+f[e:]
i=f.index('What the reviews did not see:')
rounds='''Rounds 3 to 6 (each change to money or database code reviewed by two adversarial reviewers, every finding checked against the code before any fix):

| Round | Finding | Resolution |
| --- | --- | --- |
| 3 and 4 | **F-M2-1** (should-fix, upheld by 3 of 3 judges). LED-R1's widening mis-split a PLB L6 naming the latest correction. | Fixed (c7f152cc): it reaches that correction's lines only. |
| 4 | **MONEY-R4-1** (blocking). A person's later claim match could put interest above the cash. | Fixed: interest out of the PLB L6's reach is kept off the line. |
| 4 | **R2M2-1 / RV-DB2-1**. A take-back first written in part left the outcome order-dependent. **R2M2-2, RVM3-2, RVM3-3**: tests missing for the holding condition, the out-of-reach rule and two take-backs of one chain. | Fixed, each with a failing-first test. |
| 4 | A per-reconcile overshoot (169 against 168; 7 against 6) for one reconcile before the next corrected it. | Fixed: the bounded re-walk (D18); the property asserts interest at most the cash after every reconcile. |
| 5 | **RVM5-1** (blocking, money). One PLB L6 taking back two chains' interest on one line wrote only the first. **RVM5-2, RV-DB5-1** (nits). | Fixed (1f3e2260): D19. Red first; 400,000 property runs clean. Nits fixed in 64aa14d9. |
| 5 | **RVM6-1** (nit): ADR 0084 did not name the hand-match route for a kept-off share. | Fixed (f0a3b6ad). |
| 6, base merge | The base's per-line reference copied the old interest code; its settle-order check and comments assumed the old match order. | Aligned (b1c1b161, 97225576, d0a46a42); CAS-49.1 30 of 30. |
| 6 | A reviewer's suggested practice predicates inside the walk's link lookups. | **Declined after measuring:** they moved the plan off the link indexes and CAS-42.3 did not end; the walk stays scoped where it takes a claim in, under forced row-level security. `hashesOf` keeps its predicate. |
| 6 | CI `mutation`: an equivalent mutant of `allocateByWeight`'s tie-break reported killed on bf2fc44f (it survives locally and cannot change a result). | Read as a long property failing by time under the mutation run; the four longest take an explicit limit (e4ed0f0a); 120 runs with fresh seeds clean. |
| 6 | CI `db (1/4)` cancelled twice: the chain walk with no planner statistics. | Fixed (b8b4ec0d, 8a61c612), two reviews: same rows; tenant scope unchanged. |

**The trade-off for the founder (D19).** While a line holds one chain's interest, a payment of another chain is kept off it and written later, once the line is free and if the PLB L6 still owes it. The ledger then shows less interest than the cash for that time, never more. The exact alternative, one entry per PLB L6, line and chain, needs the unique index `ledger_match_standing` to carry the claim, which is outside the freeze exception below (section 10.1) and would be a new founder exception. ADR 0084 records both. Earlier trade-off, unchanged: a payment netted against a take-back of a reversal whose claim is never uploaded is never credited.

**Owed, each its own item, not in this pull request:** (1) with no statistics the walk's link lookups are still planned against a practice-wide index once a step (slower, bounded here; the durable answer is analyzing `claim` after a load); (2) CAS-50 and CAS-51 seeded with PLB L6s and the interest statements bounded; (3) the settle entries compared row for row in place of the set comparison (ADR 0087); (4) a composite foreign key (practice, link) on a claim's reversal and correction links, a migration for the schema queue.

'''
f=f[:i]+rounds+f[i:]
approval=f'''## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks (`docs/runbooks/github-governance.md`, 3i; reconciliation 001, D4 (a)). The review is the record of the
approval, not anything written here; a new commit dismisses it. The build then merges, and never reviews.

The approval line is line 7469 of `docs/product/domain-model.md`, posted as a suggested change in one comment on that line; the founder commits it, as on #104 and #110. The document's SHA-256 is `bb7662c681fbcc658b9845b83da6a1b8a0df13759a685849cde58d48fb456bf8`.

The base has moved since 06cde5eb (ef3e8d20, #138, and #129 to come), and its ruleset requires the branch up to date, so one base merge comes before the merge. Neither changes a migration or a function file, so the hash is expected to stay; if it does not, the summary is regenerated and a new line suggested.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifDkbzUJwNMrtB7Yriz
'''
parts=[summary+'\n', what, sec('Why'), sec('What it does not change'), checks, f, sec('Freeze exception'), sec('Domain model'), approval]
out='\n'.join(p.rstrip()+'\n' for p in parts)
out=out.replace('f1b603ca24d3414d3524127e0eae134ecd5df1c67a528bcf2b88c44e94601ef7','bb7662c681fbcc658b9845b83da6a1b8a0df13759a685849cde58d48fb456bf8')
open(f'{S}/body-after.md','w').write(out)
print(len(out.encode()), [m.start() for m in re.finditer('f1b603ca',out)], out.count('9824f4e9'))
for m in re.finditer('f1b603ca',out): print(repr(out[max(0,m.start()-160):m.start()+60]))
