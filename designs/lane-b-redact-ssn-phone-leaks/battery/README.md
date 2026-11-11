# The battery and the gate for `co-001/redact-ssn-phone-leaks`: how to run them again in a fresh container

Everything here is synthetic (patients ZEPHYRA, VANTREE, JUNE MARCH; SSNs 900-xx-xxxx; phones 555-01xx; IDs SYN... and
ZZ...). `battery.sh` is the command as it ran on 74c32149 on 2026-11-11, with its seeds. The scripts carry absolute paths,
so rebuild the layout below first. Node 24 is at `/opt/node24/bin`; every script runs with
`export PATH=/opt/node24/bin:$PATH NODE_OPTIONS="--import /home/user/work/ts-resolve.mjs"`.

## The layout the scripts expect

| Path | What it is | How to make it |
| --- | --- | --- |
| `/home/user/leaks` | the worktree, on the branch | `git fetch origin co-001/wip-redact-ssn-phone-leaks`, then `git worktree add /home/user/leaks -b co-001/redact-ssn-phone-leaks origin/co-001/wip-redact-ssn-phone-leaks`; `pnpm install` there |
| `/home/user/ops` | this branch | `git worktree add /home/user/ops claude/build-ops` (push it from the hooked main checkout, never from here) |
| `/home/user/tree-ef3`, `/home/user/tree-cc3` | the two base trees | `git worktree add --detach /home/user/tree-ef3 ef3e8d20`, the same for `cc3dd7f6` |
| `/home/user/fix` | "head" for every reviewer's script: a bare copy of the head's two files | `mkdir -p /home/user/fix/packages/model-gateway/src` and copy `redact.ts` and `confusables.ts` from the worktree after every change |
| `/home/user/work/p16/before` | "before" for reviewer K's scripts (f2f9f05e) | the same two files from `git show f2f9f05e:packages/model-gateway/src/<file>`; reviewer J's scripts read `/home/user/work/p15/before` (24ad1075), I's `p14/before` (a66fee45), H's `p13/before` (8e599038), G's `p12/before` (91e1527a): each reviewer's `lib.mts` names its own |
| `/home/user/work` | the tools and fuzzers | copy `battery/b1fix`, `battery/c1fix`, `battery/d2p6`, `battery/stress16.mts`, `battery/prop-head.mts` there; `cmp.mts`, `rows.mts`, `revdiff.mjs` from `designs/lane-b-redact-ssn-phone/gate/leaks-scripts/`; `ts-resolve.mjs` and `ts-resolve-hooks.mjs` from `designs/lane-b-redact-ssn-phone/gate/`; `b2fix/` is `reviews/b2`, `d2fix/` is `reviews/d2` |
| `/home/user/review-c1`, `-c2`, `-d1/d1`, `-g1`, `-g2`, `-h1`, `-h2`, `-i1`, `-i2`, `-j`, `-k` | the reviewers' folders | copy `reviews/<id>/` to each (`reviews/d1` goes to `/home/user/review-d1/d1`, with an `out/` folder inside) |
| `/home/user/review-d1/d1/inst/redact.ts` | the head with its internals exported, for `fz.mts` and `fz3.mts` | the head's `redact.ts` plus one last line: `export const __t = { unbracketed, letterSubject, matchesIn, unmarked, written, merge, chainLeft, masked, survivorLeft };` |
| `/home/user/fix3` | the audit copy: the scan always reads a second time as ef3e8d20 read and prints `DEPART` where that reading is worse though nothing was flagged | the head's `redact.ts` with `survivorIn`'s last five lines replaced (the snippet below) |
| `/home/user/work/p12/fza/{b1fix,c1fix,d1,d2p6}` | the fuzzers pointed at the audit copy | copies of those folders with `/home/user/fix/` replaced by `/home/user/fix3/` in their `lib` files; `fza/d1/inst/redact.ts` is the audit copy plus the export line |
| `/home/user/gate` | the differential gate (975,489 synthetic letters) | copy `designs/lane-b-redact-ssn-phone/gate` there (it writes `cache/` and `trees/` beside itself; read its `README.md` and `KEEP.md`) |
| `/home/user/snapNN` | the tree the gate reads as B | `mkdir -p /home/user/snapNN/packages/model-gateway/src` and copy the worktree's whole `packages/model-gateway/src/` into it |

The audit copy's change, in `survivorIn`:

```ts
  if (!strict || read === 'survivor') {
    return read;
  }
  const flagged = departs.left;
  const base = survivorRead(text, false, departs);
  const worse = base === 'survivor' || read === null ? base : read;
  if (!flagged && worse !== read) {
    console.error('DEPART ' + JSON.stringify({ read, base, text: text.slice(0, 400) }));
  }
  return flagged ? worse : read;
}
```

After the base merge the file is `packages/redact/src/redact.ts`: the copies above keep the old directory names, only
their content changes.

## What a clean run reads (74c32149)

- Reproduction scripts: 0 lines differ from the run before. `d2fix/probe1.mts`: S1 249 new of 5,200, S2 140 of 3,600,
  S3 8 of 6,000 (the recorded costs).
- `fuzz1`, `fuzz2`, `fuzz3`, `fz2`, `withheld.mts`: 0 flips, 0 shapes, `SENT_WITHHELD` 0.
- `fz.mts` and `fz3.mts`: every flip is the month-named patient M's (ruling B). **`fz.mts 120 5923` also prints
  `SENT_WITHHELD 1, SHOWS 1`: the open finding in `../open-findings/` (the withheld match). After its fix both read 0.**
- The audit copy: `DEPART: 0`.
- The PHI reviews' generators: base flags 0.
- Must-stay: `fuzz-letters.mts 12000 11` 72 new refusals (71 `id.contact`, 1 letter-level); `stress16.mts ... 20000 42`
  bad 359; G2's RATE 3 layouts refuse 32 of 32 under a rule or a blank line (round K's recorded cost) and 4 of 32 in
  "wrapped label" (the noun with no space, which that layout writes over a blank line); RATE 4 33 of 180 and 44 of 192.
- The gate: no PHI class against ef3e8d20 or cc3dd7f6. Against ef3e8d20: SSN 16,325 letters more redacted or refused,
  phone 10,703, name 12,645, initial 635, date of birth 44; must-stay refused 3,877 with identifiers, 603 after an SSN or
  phone word, 3,359 others; changed: date 308, number 17, amount 1; unrefused 32 and 1. Against cc3dd7f6: refused 2,882,
  7,479 and 573; unplaced 385; changed: date 298, number 17, amount 1; slowest letter 1,035 ms (cc3dd7f6 514 ms; budget
  3,000 ms). Replayed against the run on 24ad1075: identical letter for letter but one more SSN letter closed.
