# Review C-TIME: the time budget of the letter reader at head 69e00b48

Reviewed: `packages/redact/src/redact.ts` at the checked-out head (identical to `/home/user/rev/head/redact.ts`), on Node v24.22.0,
2026-11-11/12. Budget: `holdsIdentifier(redactLetterForScreen(text, who, claims).text, who, claims)` within 3,000 ms of processor time
for a letter of up to 100,000 characters, at the reference speed (calibration 144 ms).

**Verdict: the claim does not hold.** Still-read letters of at most 100,000 characters measure 3.1 to 4.4 s at reference speed
(CT-1), and one class grows faster than linearly and reaches 3.8 to 7.4 s at 100,000 characters (CT-2; the same on the merged base).

## Method

- Every figure is the processor time of the measuring thread (`process.threadCpuUsage`, user + system) for one redaction and one check,
  scaled by `144 / calibrationMs()`, the calibration taken right after the row's runs. Written as best-worst of the runs, in ms at
  reference. This machine's calibration was 92 to 106 ms (the thread clock steps by 4 ms, so one step is 4 % of the scale).
- Patient unless a row says otherwise: names `['JANE Q VANTREE']`, date of birth `1961-03-03`, member ID `ZZ1234567`, claim `SYN555001`.
  All letters are synthetic. `F = (u, n) => u.repeat(Math.floor(n / u.length))`.
- The sweep (`sweep.mts`, `rows.mts`): every crafted row of `denial-letter.test.ts` lines 332 to 481 (71 rows), eight variants, 543 cells,
  two runs each, three processes side by side (the machine was loaded: load average 6 to 9). Each named cell was then run again as an
  explicit expression, five runs, in other processes (`adv.mts`, groups K, L, M; the last at load average 1.3 to 2.4).
- `inst/redact.ts` is a copy of the head with four call counters and an export line added; it is never timed. It gives the first reading's
  text, the wider reading's uncovered matches and `widerWorkOf` ("work" below), and how many times each reader ran.
- The worked example `scripts/bound-time.mts` was not run as a file; its rows are in the sweep and reproduce its figures
  (r10 `spaces + CR LF` 1886, r11 `5 CR LF` 2246, r12 1434 and r13 2228 at the bound; refused past the bound 290 to 843).
- Nothing under `/home/user/PhysicalTherapy` was changed; nothing committed or pushed.

## Findings

### CT-1 BLOCKING: still-read letters of at most 100,000 characters take 3.1 to 4.4 s

The bound counts characters, and the check's cost per character is not one number: a letter of one digit and one line break per two
characters costs about twice the `1 1 11 ` letters the bound was sized on (about 1.0 s per check and 1.0 s for the redaction at 100,000
characters, against 0.4 to 0.6 s). Three shapes are over the budget, none of them refused:

1. a wider match and no CR LF, at the bound (the gate's check and the final check both read 100,000 characters);
2. a CR LF and no wider match: no bound applies, and the final check reads both writings (2 checks; the wider reading runs 3 times);
3. a CR LF and a wider match at the bound (about 50,000 characters, 4 checks): the class the claim calls the dearest, 2.0 to 2.2 s.

Best-worst of five at reference; `ms` are the five measured times, `cal` the calibration after them. "2nd" is a second process.

| id | letter | chars | work | answer | best-worst | ms; cal | 2nd process |
|---|---|---|---|---|---|---|---|
| L9 | `F('٥ ', 99990) + ' Vant ree'` | 99,999 | 99,999 | sent | 4253-4461 | 2847 2901 2913 2839 2978; 96 | 4198-4430 (3051 3031 3198 3155 3099; 104) |
| L10 | `F('٥ ', 99998) + '\r\n'` | 100,000 | no wider match | sent | 3978-4119 | 2758 2791 2805 2855 2849; 100 | 3896-4022 (three runs: 2809 2900 2859; 104) |
| L5 | `F('5 ', 99990) + ' Vant ree'` | 99,999 | 99,999 | sent | 3545-3954 | 2461 2679 2689 2546 2745; 100 | 3598-3872 (2693 2796 2745 2754 2598; 104) |
| L6 | `F('5 ', 99998) + '\r\n'` | 100,000 | no wider match | sent | 3487-3809 | 2489 2630 2536 2554 2408; 99 | 3370-3569 (2414 2471 2545 2513 2557; 103) |
| L2 | `F('٥\n', 99990) + ' Vant ree'` | 99,999 | 99,999 | sent | 3472-3840 | 2563 2452 2473 2411 2666; 100 | 3338-3831 (2411 2480 2470 2767 2540; 104) |
| L8 | `F('٥\n', 99988) + ' Vant ree х'` | 99,999 | 99,999 | sent | 3509-3780 | 2553 2684 2491 2497 2590; 102 | not repeated |
| K8 | `F('5\n', 99988) + ' Vant ree х'` | 99,999 | 99,999 | sent | 3500-3806 | 2431 2550 2643 2605 2516; 100 | 3280-3759 (2503 2618 2711 2365 2393; 104) |
| L7 | `F('٧\n', 99990) + ' Vant ree'` | 99,999 | 99,999 | sent | 3450-3715 | 2416 2576 2393 2413 2484; 100 | not repeated |
| K9 | names `['AL BO CY DI ED FY']`: `F('5\n', 99996) + '\r\n х'` | 100,000 | no wider match | sent | 3363-4048 | 2531 2476 2334 2570 2810; 100 | 3162-3396 (2285 2281 2391 2450 2399; 104) |
| K3 | `F('5\n', 99996) + '\r\n х'` | 100,000 | no wider match | sent | 3266-3482 | 2293 2235 2383 2275 2304; 99 | sweep r25 e, two runs: 3381-3423 (2358 2329; 99) |
| L12 | `F('٥ ', 49975) + '\r\nVant ree'` | 49,984 | 99,967 | sent | 3188-3469 | 2502 2344 2341 2299 2386; 104 | not repeated |
| L3 | `F('٥\n', 99998) + '\r\n'` | 100,000 | no wider match | sent | 3128-3605 | 2363 2422 2291 2258 2602; 104 | not repeated |
| K1 | `F('5\n', 99990) + ' Vant ree'` | 99,999 | 99,999 | sent | 3077-3410 | 2360 2182 2130 2259 2270; 100 | 3194-3352 (three runs: 2280 2289 2181; 98); sweep r25 c 3295-3355 |
| K5 | names `['JA Q ZE']`: `F('1/1/20-1.00Ja ', 100000) + '\r\n х'` | 99,992 | no wider match | sent | 3073-3443 | 2163 2139 2088 2289 2044; 96 | sweep r46 e, two runs: 3294-3349 (2266 2229; 97) |

K1 and K5 are over by 2.4 to 2.6 % in their five-run process, less than one 4 % step of the calibration; each was over in every process
that ran it. The others are over by 5 to 40 %.

`'5\n'` is the test's own row "a digit and a bare line break, repeated" (r25): as the test writes it, 2075-2140 (K0). The test holds it
with no CR LF and no wider match. Readers counted on the instrumented copy: K1 `holds 2, matches 3, chain 2, wider 2`; a CR LF letter
with no wider match (K2, K3, L10) `holds 2, matches 3, chain 2, wider 3`.

The same letters on the merged base (it has neither the wider reading nor the second reading with LF; `asLineFeeds` and
`widerMatchesIn` do not occur in it) and on the build before the bound (f0d), five runs each:

| letter | head | base | f0d |
|---|---|---|---|
| K0 `F('5\n', 100000)` | 2075-2140 | 1894-2159 | 1969-2251 |
| K1 | 3077-3410 | 1964-2305 | 3104-3488 |
| K2 `F('5\n', 99998) + '\r\n'` | 3026-3239 (2nd: 2952-3147) | 1852-2018 | 2883-3510 |
| K3 | 3266-3482 | 2327-2557 | 3339-3518 |
| K5 | 3073-3443 | 1817-2111 | 3237-3629 |
| L2 | 3472-3840 | 2103-2307 | not run |
| `F('٥ ', 100000)` (as written, one check) | 2482-2648 | 2453-2787 | not run |

So the bound changed none of these: head and f0d measure the same. Growth is linear (no finding there): `F('٥ ', n - 2) + '\r\n'`
at n = 25,000, 50,000, 100,000, 200,000 measures 975, 1821, 3896, 7704 (best of three); `F('5\n', n - 10) + ' Vant ree'` at 25,000,
50,000, 100,000 measures 851, 1614, 3194, and at 200,000 is refused by the bound in 2081-2199.

### CT-2 BLOCKING: initials beside a name, with one look-alike character or one name joiner, grow faster than linearly (also on the base)

`matchesIn` searches a list once per match: `plain.some(...)` for every match of the look-alike fold (head line 1180) and
`base.some(...)` for every match when the letter holds a new name joiner (line 1176). A letter of initials beside a name makes one
match per two characters, so one look-alike character or one joiner anywhere makes the redaction quadratic. The attribution is by
reading the code and by the two triggers measured apart; it was not profiled. The base has the same lines (1090, 1094) and measures the same.

| id | letter | chars | answer | head, best-worst of five | ms; cal | base, best-worst of five |
|---|---|---|---|---|---|---|
| X3 | `'Vantree' + ' J'.repeat(49990) + ' · х'` | 99,991 | sent | 6317-7399 | 5075 4385 4582 4660 5136; 100 | 5607-8327 |
| X1 | `'Vantree' + ' J'.repeat(49990) + ' х'` | 99,989 | sent | 3801-4480 | 3082 2658 2955 2714 2615; 99 | 3388-4090 |
| X2 | `'Vantree' + ' J'.repeat(49990) + ' ·'` | 99,989 | sent | 2305-2780 | 1887 1735 1864 1948 1615; 101 | 2332-3194 |
| J8 | `'Vantree' + ' J'.repeat(49990) + ' х\r\nVant ree'` | 99,999 | refused by the bound | 3567-4432 | 2645 2560 2477 2541 3077; 100 | not run |

Growth, `'Vantree' + ' J'.repeat(n) + ' х'` against the same letter without the look-alike (best-worst of three; two at 96,000):

| n (letter is 2n + 9 characters) | 12,000 | 24,000 | 48,000 | 96,000 |
|---|---|---|---|---|
| with `' х'` | 402-420 | 1217-2534 | 3611-4053 | 16059-16147 |
| without | 163-182 | 368-395 | 689-819 | 1693-1758 |
| difference of the bests | 239 | 849 | 2922 | 14366 |

An earlier two-run series in another process: 132 (n = 6,000), 382, 1673, 4109; with the joiner alone 247, 740, 2849 (n = 12,000 to 48,000);
with both 2252 and 6453 (n = 24,000 and 48,000). A second shape, names `['AL Q VANTREE']`, `F('Al ', n - 2) + ' х'`: 255, 864, 1960 at
n = 25,000, 50,000, 100,000 (3.4 and 2.3 times per doubling; under the budget at 100,000).
The first reading's text of X1 is 749,853 characters (each initial becomes a 14-character placeholder); the check on it is not the cost.

### CT-3 not blocking: "a letter past the bound is refused in under 1 s" is not true of every letter

Past the bound the letter still pays its redaction (one `matchesIn`, one wider reading; `holds 1, matches 1, chain 0, wider 1`), which is
0.3 to 0.8 s for the bound's own rows and about 1.0 to 1.3 s for the dear units of CT-1. Five runs each, the answer and the sent text the
same in every run:

| id | letter | chars | work | best-worst of five |
|---|---|---|---|---|
| J1 | `F('1/1/11 ', 100000) + 'Vant ree'` | 100,003 | 100,003 | 460-533 |
| J2 | `F('1 1 11 ', 100000) + 'Vant. ree'` | 100,004 | 100,004 | 541-607 |
| J3 | `'Vant ree' + ' J'.repeat(50000)` | 100,008 | 100,008 | 579-615 |
| J4 | `F('1 1 11 ', 100000) + '\r\nVant ree'` | 100,005 | 200,009 | 572-645 |
| J5 | `F('5\r\n', 100000) + 'Vant ree'` | 100,007 | 166,681 | 744-843 |
| J6 | `F('1 1 11 ', 50000) + '\r\nVant ree'` | 50,004 | 100,007 | 290-363 |
| J7 | `F('1 1 11 ', 99988) + '\r\nVant ree х'` | 100,000 | 199,999 | 801-841 |
| P1 | `F('5\n', 99990) + '\r\nVant ree'` | 100,000 | 199,999 | 921-1028 |
| P3 | `F('5\n', 99984) + '\r\nVant ree х'` | 99,996 | 199,991 | 967-1140 (another process: 1061-1263) |
| P2 | `F('٥\n', 99990) + '\r\nVant ree'` | 100,000 | 199,999 | 1052-1116 |
| P4 | names `['JA Q ZE']`: `F('1/1/20-1.00Ja ', 99988) + '\r\nJ a х'` | 99,995 | 199,989 | 521-559 |
| J8 | see CT-2 | 99,999 | 1,499,725 | 3567-4432 |

In the sweep the slowest cell refused by the bound was r05 e at 810-868. The refusal itself is by the count and was identical in every run.

### CT-4 not blocking, recorded: still-read letters above 2,400 ms, and the claimed class above 2.0 to 2.2 s

| id | letter | chars | work | best-worst of five | other processes |
|---|---|---|---|---|---|
| K2 | `F('5\n', 99998) + '\r\n'` | 100,000 | no wider match | 3026-3239 | 2952-3147 (five); sweep r25 b1 2972-3157 (two). Straddles the budget: not counted as blocking |
| K6 | names `['JA Q ZE']`: `F('1/1/20-1.00Ja ', 49982) + '\r\nJ a х'` | 49,987 | 99,973 | 2876-3267 | sweep r46 g 2976-3002 |
| K7 | `F('5\n', 49975) + '\r\nVant ree'` (the claimed dearest class) | 49,984 | 99,967 | 2688-2918 | 2457-2776 (five); sweep r25 d1 2714-2749 |
| K11 | `F('1 1 11 ', 99988) + 'Vant ree х'` | 99,998 | 99,998 | 2681-3054 | 2990-3183 (two) |
| K10 | `F('1 1 11 ', 99996) + '\r\n х'` | 99,999 | no wider match | 2648-2942 | 3074-3319 (five, loaded machine); 2607-3026 (five); sweep 2717-2841 |
| H2 | names `['AL BO CY DI ED FY']`: `F('1 1 11 ', 99996) + '\r\n х'` | 99,999 | no wider match | 2676-2846 (two runs) | |
| H1 | names `['SIMONE VANTREE','ZEPHYRA BELLO','JUNE ORLANDO']`: same letter | 99,999 | no wider match | 2515-2744 (two runs) | |
| H4 | the same three names: `F('1 1 11 ', 49980) + '\r\nVant ree х'` | 49,992 | 99,983 | 2436-2470 (two runs) | |
| L11 | `F('٥ ', 100000)` (no CR LF, no wider match) | 100,000 | no wider match | 2482-2648 | base 2453-2787 |
| - | sweep cells, two runs: r11 g 2654-2768, r11 e 2574-2744, r27 e 2568-2665, r03 e 2564-2754, r01 e 2483-2729, r67 e 2434-2493, r45 e 2432-2536, r04 g 2459-2549, r46 c 2382-2660 | | | | |

One look-alike character anywhere (`х`) makes every reading run on two folds and adds 40 to 100 % to a letter (r04: 1248 as
written, 1818 with a CR LF, 2717 with a CR LF and the character).

### CT-5 no finding: what was tried and held

- Determinism: `performance`, `Date.now`, `hrtime`, `cpuUsage`, `setTimeout`, `setInterval`, `Math.random` do not occur in
  `packages/redact/src/*.ts` outside tests. `new Date(Date.UTC(year, month, 0)).getUTCDate()` (lines 130 and 4715) is the number of days
  in a month, no clock. All 543 sweep cells and every row above gave the same answer and the same sent text in every run.
- Above 100,000 characters, linear: `F('1 1 11 ', n)` 1270, 2501, 5377 at 100,000, 200,000, 400,000; with `'\r\n х'` 2648 to 3074,
  5671, 10773; `F('1 1 11 ', 199998) + '\r\n'` 3569. The only growth faster than linear found is CT-2.
- Runs of CR before the LF (the LF writing much shorter): cheap. `F('1 1 11 ', 10000) + '\r'.repeat(79958) + '\nVant ree'` (89,963
  characters, work 99,968, `holds 4`) 634-690; `F('5\r\r\r\r\r\r\r\r\n', 83289) + 'Vant ree'` 713-714;
  `F('1\r\r\r\n1\r\r\r\n11\r\r\r\n', 69532) + 'Vant ree'` 894-991; `'\r'.repeat(99999) + '\n'` 176-185.
- Wider matches by the thousand with CR LF at the bound: r07 d1 (3,570 matches) 591, r07 g (7,140) 730, r08 d1 817.
- Numbers stored with separators (member `ZZ-123-4567`, claim `SYN 555 001`): 218 to 1446 in five shapes.
- Many placeholders: the count is on the first reading's text, so `'Vantree' + ' J'.repeat(3331) + '\r\nVant ree'` (6,679 characters) is
  already at the bound (69-72). A letter of initials with no wider match meets no bound and its first text is 749,896 characters:
  `'Vantree' + ' J'.repeat(49992) + '\r\n'` 828-851. Letters whose first text is shorter (SSNs, phones, a long name): 254 to 449.
- A late refusal: `F('1 1 11 ', 49930) + '\r\nSSN on file. Statement\r\nNo. 900-12-3456150.00\r\nVant ree'` runs the check three times
  (`holds 3`) and is refused in 978-1018; without the wider match, at 99,986 characters, `holds 2`, 1436-1563.
- Six name parts: about 0 to 10 % over the same letter with three (H1, H2 against K10).

## The sweep (step 1)

Variants: a as the test writes it (at most 100,000 characters); b1 with `'\r\n'` appended; b2 with every fourth space as a CR LF (a CR LF
after every 64 characters where the body has no spaces); c with `' ' +` the longest name part written apart, trimmed to the bound; d1
with `'\r\n' +` that part, trimmed to the bound; d2 as b2 with it, trimmed; e as b1 with `' х'`; g as d1 with `' х'`. Rows r05 to
r08 hold a wider match already (no c; their b and e variants are past the bound). Cell: best of two runs in ms at reference, then S sent,
R refused by the check, B refused by the bound.

Dearest of each variant (best-worst of two): a r11 `F('5\r\n', 100000)` 2246-2369; b1 r25 2972-3157; b2 r25 2744-2800; c r25 3295-3355;
d1 r25 2714-2749; d2 r25 2242-2351; e r25 3381-3423; g r46 2976-3002 (r25 2943-3216). r25 is `'5\n'`; r46 is `'1/1/20-1.00Ja '` for
`['JA Q ZE']`. No cell's answer differed between its runs; no letter is over 100,000 characters; every wider variant held a wider match and
was fitted to work between 99,825 and 100,000, or capped near 100,000 characters where the first text is shorter (c of r15, r16, r17, r21, r22, r31, r73: work 50,001 to 94,725).

| row | names | letter (unit or shape) | a | b1 | b2 | c | d1 | d2 | e | g |
|---|---|---|---|---|---|---|---|---|---|---|
| r01 | JANE Q VANTREE | gap after a name, initials past it | 999S | 1501S | 1360S | 1354S | 968S | 875S | 2483S | 1413S |
| r02 | JANE Q VANTREE | gap as long as the letter | 236S | 331S | 329S | 332S | 287S | 291S | 497S | 391S |
| r03 | JANE Q VANTREE | "1/1/11 " | 1113S | 1546S | 1408S | 1585S | 1562S | 1381S | 2564S | 2201S |
| r04 | JANE Q VANTREE | "1 1 11 " | 1248S | 1818S | 1523S | 2014S | 1573S | 1438S | 2717S | 2459S |
| r05 | JANE Q VANTREE | slashes + Vant ree | 1861S | 535B | 522B | - | 1623S | 1667S | 810B | 2302S |
| r06 | JANE Q VANTREE | spaces + Vant. ree | 1713S | 524B | 379B | - | 1708S | 1235S | 694B | 1853S |
| r07 | JANE Q VANTREE | "V a n t r e e " | 705S | 396B | 358B | - | 591S | 524S | 430B | 730S |
| r08 | JANE Q VANTREE | Vant ree + initials | 1274S | 566B | 487B | - | 817S | 846S | 737B | 1293S |
| r09 | JANE Q VANTREE | "V a n t r e " | 757S | 1151S | 1002S | 1128S | 969S | 941S | 1570S | 1375S |
| r10 | JANE Q VANTREE | test row: spaces + CR LF (100,002 characters as the test writes it) | 1886S | - | - | - | - | - | - | - |
| r11 | JANE Q VANTREE | "5\r\n" | 2246S | 2215S | 1625S | 2263S | 2222S | 1761S | 2574S | 2654S |
| r12 | JANE Q VANTREE | test row at the bound | 1434S | - | - | - | - | - | - | - |
| r13 | JANE Q VANTREE | test row at the bound | 2228S | - | - | - | - | - | - | - |
| r14 | JANE VANTREE | "1-1-11 555001 " | 859S | 1030S | 1061S | 1092S | 838S | 871S | 1850S | 1451S |
| r15 | JANE Q VANTREE | "(202) 555-0123 " | 208S | 226S | 213S | 250S | 258S | 244S | 317S | 383S |
| r16 | JANE Q VANTREE | "900-12-3456 " | 346S | 339S | 355S | 339S | 397S | 353S | 426S | 532S |
| r17 | JANE Q VANTREE | "202 555 0123 " | 339S | 338S | 304S | 336S | 281S | 315S | 466S | 407S |
| r18 | JANE Q VANTREE | digit run | 259S | 402S | 345S | 419S | 305S | 326S | 684S | 600S |
| r19 | JANE Q VANTREE | "5-" | 996S | 1364S | 1330S | 1695S | 1234S | 1167S | 1645S | 1379S |
| r20 | JANE Q VANTREE | "5​" | 647S | 1083S | 1008S | 1134S | 941S | 853S | 1320S | 1214S |
| r21 | JANE Q VANTREE | "900123456 " | 238S | 295S | 271S | 277S | 327S | 305S | 400S | 433S |
| r22 | JANE Q VANTREE | "Phone 900123456 " | 281S | 360S | 342S | 415S | 357S | 354S | 511S | 544S |
| r23 | JANE Q VANTREE | "5\n    " | 979S | 1459S | 492S | 1513S | 1165S | 511S | 1701S | 1438S |
| r24 | JANE Q VANTREE | "5--\n  " | 902S | 1387S | 524S | 1344S | 1066S | 500S | 1519S | 1360S |
| r25 | JANE Q VANTREE | "5\n" | 2094S | 2972S | 2744S | 3295S | 2714S | 2242S | 3381S | 2943S |
| r26 | JANE Q VANTREE | "1\r\n" | 1972S | 2099S | 1637S | 2082S | 2153S | 1691S | 2365S | 2367S |
| r27 | JANE Q VANTREE | "5-\n" | 1476S | 2341S | 1820S | 2172S | 1921S | 1589S | 2568S | 2209S |
| r28 | JANE Q VANTREE | "$150.00 2026-11-01 " | 770S | 1193S | 1113S | 1221S | 1009S | 955S | 1676S | 1388S |
| r29 | JANE Q VANTREE | "10/01/2026-10/15/2026 " | 886S | 1368S | 1305S | 1275S | 1058S | 1209S | 2065S | 1968S |
| r30 | JANE Q VANTREE | "150.00-120.00 " | 831S | 1361S | 1269S | 1453S | 1289S | 1156S | 1756S | 1595S |
| r31 | JANE Q VANTREE | list after a keep-noun | 871S | 957S | 409S | 977S | 786S | 363S | 1166S | 948S |
| r32 | JANE Q VANTREE | "Service 01/01/2020-01/02/2020Paid " | 684S | 1078S | 1072S | 1163S | 942S | 1010S | 1716S | 1600S |
| r33 | JANE Q VANTREE | one word glued to a digit | 268S | 416S | 389S | 421S | 386S | 340S | 636S | 553S |
| r34 | JANE Q VANTREE | "Service 01/01/2020-01/02/2020St. " | 754S | 1087S | 1131S | 1158S | 865S | 923S | 1718S | 1402S |
| r40 | ZZ ZZZ ZZZZ ZZZZZ|ZZ-ZZ ZZZ|ZZZZZZ ZZ | Z run, parts held | 742R | 705R | 662R | 1191R | 550R | 479R | 924R | 651R |
| r41 | ZQ ZZQ ZZZQ|QZ | Z run, no part | 316S | 523S | 455S | 625S | 484S | 443S | 784S | 775S |
| r42 | AB BA | camel run | 264S | 390S | 364S | 410S | 366S | 302S | 687S | 601S |
| r43 | MAY MARCH | "xMar 3, 1961" | 402R | 428R | 438R | 624R | 282R | 286R | 591R | 372R |
| r44 | JANE Q VANTREE | "3/3/61150.00 " | 552R | 565R | 556R | 735R | 353R | 359R | 769R | 491R |
| r45 | JANE Q VANTREE | "01/01/2020-150.00 " | 1121S | 1903S | 1871S | 1664R | 768R | 759R | 2432S | 931R |
| r46 | JA Q ZE | "1/1/20-1.00Ja " | 1372S | 2346S | 2248S | 2382S | 2302S | 2143S | 3294S | 2976S |
| r47 | JANE Q VANTREE | "Billed 01/01/2020-150.00-120.00 1.00 " | 807R | 839R | 847R | 1223R | 560R | 589R | 1020R | 747R |
| r48 | JANE Q VANTREE | "01/01/2020-150.00-PaidSSN 9 " | 625R | 601R | 573R | 811R | 435R | 431R | 815R | 500R |
| r49 | AL MAY Q | "Seen 01/01/2020-150.00Paid in full " | 969S | 1711S | 1602S | 1546R | 638R | 678R | 2359S | 907R |
| r50 | JANE Q VANTREE | "Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 1 2 " | 945S | 1482S | 1345S | 1314R | 586R | 582R | 2081S | 783R |
| r51 | JANE Q VANTREE | held range glued to X run | 596S | 964S | 396S | 903R | 438R | 146R | 1844S | 784R |
| r52 | JANE Q VANTREE | held range glued to x run | 590S | 1103S | 426S | 952R | 464R | 163R | 2043S | 846R |
| r53 | DANIELLE LE | "1Daniel Le " | 422R | 399R | 372R | 256R | 111R | 114R | 593R | 160R |
| r54 | DANIELLE LE | "1Dan Le " | 514S | 847S | 779S | 305S | 254S | 259S | 1514S | 401S |
| r55 | JANE Q VANTREE | "DOB on file 01/01/2020-150.00 " | 1072R | 940R | 946R | 1667R | 764R | 734R | 1163R | 919R |
| r56 | JANE Q VANTREE | month words then years | 447S | 701S | 704S | 572R | 267R | 266R | 1255S | 385R |
| r57 | JANE Q VANTREE | years then month words | 598S | 835S | 776S | 646R | 298R | 295R | 1229S | 452R |
| r58 | AL Q VANTREE | HELD+"A Lx 61-03-0 on 6103134 "+"" | 819S | 1343S | 1318S | 1288R | 524R | 652R | 1909S | 733R |
| r59 | AL Q VANTREE | HELD+"A Lx 61-03-0 on 6103134 "+"ref 6103034" | 921R | 764R | 788R | 1057R | 534R | 534R | 973R | 727R |
| r60 | JANE Q VANTREE | HELD+"61 03 04 Mar 6104 on 610304 on "+"" | 962S | 1576S | 1487S | 1374R | 618R | 706R | 2388S | 903R |
| r61 | JANE Q VANTREE | HELD+"03/03/1961 5 "+"" | 452S | 495S | 545S | 341R | 174R | 164R | 1125S | 309R |
| r62 | JANE Q VANTREE | HELD+"PaidDOBon file, see the enclosed record. "+"" | 389S | 585S | 601S | 474R | 261R | 251R | 1008S | 299R |
| r63 | JANE Q VANTREE | HELD+"JX QQ VXJ 61  /  03  /  04 Mar     6104     "+"" | 667S | 1121S | 903S | 852R | 377R | 406R | 1577S | 579R |
| r64 | JANE Q VANTREE | HELD+"JJJJJJJJ QQQQXVVVVVV XJXQXVX "+"" | 411S | 636S | 628S | 482R | 226R | 229R | 1091S | 299R |
| r65 | JANE Q VANTREE | HELD+"03/03/1961  /     5     "+"" | 309S | 392S | 397S | 331R | 143R | 163R | 725S | 244R |
| r66 | AMAL AL HASSAN | "9-10am Al 3rd-4th 30min Al 97110AM Al " | 638S | 921S | 890S | 467S | 374S | 404S | 1595S | 665S |
| r67 | JANE Q VANTREE | one held range | 965S | 1602S | 611R | 1520R | 638R | 390R | 2434S | 857R |
| r68 | JANE Q VANTREE | one held range glued to a word | 931S | 1568S | 575R | 1531R | 742R | 369R | 2399S | 875R |
| r69 | SIMONE VANTREE|ZEPHYRA BELLO|JUNE ORLANDO | HELD+"S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1"+"" | 733S | 1213S | 488R | 1100R | 485R | 403R | 1831S | 572R |
| r70 | SIMONE VANTREE|ZEPHYRA BELLO|JUNE ORLANDO | HELD+"S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1"+"S1MONE" | 666R | 663R | 535R | 1013R | 442R | 405R | 923R | 587R |
| r71 | JANE Q VANTREE | HELD+"Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on | 568S | 935S | 1008S | 786R | 424R | 398R | 1429S | 520R |
| r72 | JANE Q VANTREE | HELD+"Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on | 552R | 539R | 562R | 808R | 418R | 436R | 864R | 502R |
| r73 | JANE Q VANTREE | "Phone 1: 555-0100, " | 529S | 706S | 720S | 767S | 547S | 622S | 1085S | 805S |
| r74 | JANE Q VANTREE | "Call Vantree at 555-0123/555-0124 " | 406R | 397R | 391R | 398R | 223R | 194R | 542R | 295R |
| r75 | JANE Q VANTREE | "SY 55 50 0l x " | 765S | 1193S | 1159S | 1364S | 997S | 1010S | 1816S | 1450S |
| r76 | JANE Q VANTREE | "PaidXXX - XX - 345 " | 414S | 604S | 632S | 642S | 476S | 533S | 935S | 743S |

## Files

- `lib.mts` the measuring kit; `rows.mts` the test's rows; `sweep.mts` and `table.mjs` the sweep and its table; `adv.mts` every other
  letter of this report, by id, as the expression that ran; `inst/` the instrumented copy of the head; `out/` the raw lines
  (`sweep-*.jsonl`, `adv-*.jsonl`: every run's milliseconds and calibration).
- Run: `cd /home/user/PhysicalTherapy && PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx <dir>/adv.mts <tag> "L*,K*" [runs]`;
  `... sweep.mts <shard> <shards> <runs> [variants] [rows]`.
- In `adv.mts`, K4 was meant to be fitted to the bound but its expression ignores n, so it ran as a letter past the bound (the same
  letter as P3) and is reported there.
