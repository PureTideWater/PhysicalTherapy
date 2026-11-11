# Gate report

- tree A: `/home/user/tree-cc3/packages/model-gateway/src` (redact.ts 1b9280e790dd)
- tree B: `/home/user/snap18/packages/model-gateway/src` (redact.ts 2ba7e0235c4b)
- corpus: 975489 letters, sha256 89a133ca67449143; 193 s
- stats: letters 975489, same 716195, differ 259294, refusedA 247791, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 975489, cachedB 975489, metadata 45830, annotated 213464, msRunA 85.379979010125, msRunB 70.38935198699482, msClassify 114661.6355380046, msParse 2475.5841590227774

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.amount: 1
- how: after an SSN/phone word 1
- by source: harness/rg-fixer-1b__fuzzK.mts__keep_4242 1
  - "Phone (2); 364.33\n15.00 12.00 3.00" [JANE Q ZEPHYRA] A: "Phone (2); 364.33\n15.00 12.00 3.00" B: "Phone (2); [PHONE].00 12.00 3.00"

### KEEP.changed.date: 298
- how: no SSN/phone word 298
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 150, harness/rg-review-phi-1__fuzzdob.mts__2 145, harness/rg-review-gateway-3__tok.mts__default 3
  - "DOS May 301" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS May 301" B: "DOS [PATIENT_NAME] 301"
  - "May 2020.Jan" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020.Jan" B: "[PATIENT_NAME] 2020.Jan"
  - "May 2020, Jan" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020, Jan" B: "[PATIENT_NAME] 2020, Jan"
  - "May 2020_12th" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020_12th" B: "[PATIENT_NAME] 2020_12th"
  - "May 2020/12th" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020/12th" B: "[PATIENT_NAME] 2020/12th"

### KEEP.changed.number: 17
- how: after an SSN/phone word 17
- by source: harness/rg-fixer-2__secfill.mts__4242 6, harness/rg-fixer-2__secfill.mts__9191 4, harness/rg-review-gateway-3__secfill.mts__9191 4, harness/rg-review-gateway-3__secfill.mts__4242 3
  - "Tel 7: is 802\n8185.55 0193Paid" [JANE Q ZEPHYRA] A: "Tel 7: is 802\n8185.55 0193Paid" B: "Tel 7: is [PHONE].55 0193Paid"
  - "Re: SSN 7: is 605 9147 2.78 64" [JANE Q ZEPHYRA] A: "Re: SSN 7: is 605 9147 2.78 64" B: "Re: SSN 7: is [SSN] 2.78 64"
  - "SSN: 0: is 728\n3705.55 0117Paid" [JANE Q ZEPHYRA] A: "SSN: 0: is 728\n3705.55 0117Paid" B: "SSN: 0: is [SSN].55 0117Paid"
  - "Re: Call 4: is 809 5045.55 0162 " [JANE Q ZEPHYRA] A: "Re: Call 4: is 809 5045.55 0162 " B: "Re: Call 4: is [PHONE].55 0162 "
  - "Cell 0: is 007\n2685.55 0188 Paid" [JANE Q ZEPHYRA] A: "Cell 0: is 007\n2685.55 0188 Paid" B: "Cell 0: is [PHONE].55 0188 Paid"

### KEEP.refused.letter-with-identifiers: 2882
- by source: harness/rg-review-phi-3__labname.mts__default 2191, T5/MOD-13 gluedLetterCase@3fcb9359 152, T5/MOD-15 ssnPhoneCase@3fcb9359 92, harness/rg-review-phi-3__sweep3.mts__default 89, harness/rg-fixer-2__secfill.mts__9191 58, harness/rg-fixer-2__secfill.mts__4242 45, harness/rg-review-phi-3__fuzz4.mts__11 40, harness/rg-review-gateway-3__secfill.mts__9191 30
  - "Paid 150.00A.UB😀 " [UB, AUGUST BSQ] A: "Paid 150.00A.[PATIENT_NAME]😀 " B: REFUSED
  - "Paid $10-$20G. WAEA, " [GVWGDCAS A WAEA] A: "Paid $10-$20G. [CLAIM_1], " B: REFUSED
  - "DOS 1961-03-03.May 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS [DATE_OF_BIRTH].May 2020" B: REFUSED
  - "DOS 013-3-61-2001-01-12" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS 013-3-61-[DATE_OF_BIRTH]" B: REFUSED
  - "Seen 2001-01-12.May 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen [DATE_OF_BIRTH].May 2020" B: REFUSED

### KEEP.refused.must-stay.after-ssn-phone-word: 7479
- by source: harness/rg-fixer-2__labkeep2.mts__default 2236, data/reviewer-files 1740, harness/rg-fixer-1__fuzz2.mts__sec 1257, harness/rg-skeptic-gateway__fuzz2.mts__sec 892, harness/rg-fixer-1b__fuzzK.mts__keep_4242 442, harness/rg-fixer-2__splitfuzz.mts__default 366, harness/rg-fixer-1__fuzz2.mts__keep 127, harness/rg-skeptic-gateway__r2__fuzzK.mts__keep_4242 124
  - "SSN 95,727081.8" [JANE Q ZEPHYRA] A: "SSN 95,727081.8" B: REFUSED
  - "SSN 9,068184.05" [JANE Q ZEPHYRA] A: "SSN 9,068184.05" B: REFUSED
  - "SSN 926711 98.0" [JANE Q ZEPHYRA] A: "SSN 926711 98.0" B: REFUSED
  - "Tel 99 54768.25" [JANE Q ZEPHYRA] A: "Tel 99 54768.25" B: REFUSED
  - "Tel 9535874 1.4" [JANE Q ZEPHYRA] A: "Tel 9535874 1.4" B: REFUSED

### KEEP.refused.must-stay.other: 573
- by source: data/reviewer-files 476, harness/rg-review-phi-3__ownid3.mts__default 37, harness/rg-review-phi-1__fuzzdob.mts__1 17, harness/rg-sweep__sweep.mts__sec 15, harness/rg-review-phi-1__fuzzdob.mts__2 7, harness/rg-review-gateway-3__fuzzord.mts__sec 6, harness/rg-review-phi-3__sweep3.mts__default 5, harness/rg-fixer-1__fuzz.mts__sec 3
  - "6103.03.61" [JUNE Q VANTREE; MAY ZEPHYRA] A: "6103.03.61" B: REFUSED
  - "May 312 Jan 2001" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 312 Jan 2001" B: REFUSED
  - "$10.00555-012-3456" [JANE Q ZEPHYRA] A: "$10.00555-012-3456" B: REFUSED
  - "$10.00555.012.3456" [JANE Q ZEPHYRA] A: "$10.00555.012.3456" B: REFUSED
  - "DOS 12th.6101/12/01" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS 12th.6101/12/01" B: REFUSED

## (1b) Unplaced: B sends a letter A refused that has 7+ digits after an SSN/phone word but no SSN/phone the oracle can place

_a fuzz letter of a random 9xx SSN, or a must-stay row after a phone word: judge by the examples and hits file_

### UNPLACED.unrefused.after-ssn-phone-word: 385
- by source: T5/MOD-16 keptSegment@3fcb9359 141, harness/rg-review-phi-3__sweep3.mts__default 130, T5/MOD-16 seeds@3fcb9359 16, harness/rg-fixer-1b__fuzzK.mts__keep_4242 13, harness/rg-fixer-1__fuzz2.mts__keep 13, harness/rg-review-gateway-3__fuzzord.mts__sec 11, harness/rg-skeptic-gateway__fuzz2.mts__keep 11, harness/rg-review-phi-1__fuzz2l.mts__303 8
  - "Phone 965–84–4458－12/01/2025-0.00" [JANE Q ZEPHYRA] A: REFUSED B: "Phone [SSN]-12/01/2025-0.00"
  - "SSN #XXX-XX-3456/01.02.2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "SSN #[SSN]/01.02.2020-150.00"
  - "[SSN] XXX-XX-3456\n01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "(SSN) [SSN]\n01/01/2020-150.00"
  - "[SSN] ***-**-3456-01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "(SSN) [SSN]-01/01/2020-150.00"
  - "[SSN] ***-**-3456˗01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "(SSN) [SSN]˗01/01/2020-150.00"

## (3a) Reverse PHI: A sent in clear, B redacts or refuses

_information_

### REVERSE.PHI.claim: 9157
- how: B refused 9157
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): d|p (refused) 1496, d|_ (refused) 1039, d|u (refused) 914, d|d (refused) 838, l|d (refused) 655, d|l (refused) 608, _|d (refused) 534, l|p (refused) 455, l|_ (refused) 411, l|u (refused) 409, _|u (refused) 404, u|_ (refused) 335
- by source: harness/rg-review-phi-3__ownid3.mts__default 6127, T2/label-own-number 788, T1/claim 787, T5/MOD-13 gluedLetterCase@3fcb9359 412, data/reviewer-files 341, harness/rg-review-phi-3__fuzz4.mts__11 279, harness/rg-review-phi-3__fuzz4.mts__22 266, harness/rg-fixer-2__ownid2.mts__default 156
  - "synclaim00011" [JANE Q ZEPHYRA] A: "synclaim00011" B: REFUSED
  - "SYNCLAIM0001TH" [JANE Q ZEPHYRA] A: "SYNCLAIM0001TH" B: REFUSED
  - "1SYNCLAIM0001_" [JANE Q ZEPHYRA] A: "1SYNCLAIM0001_" B: REFUSED
  - "(c20260004171)" [JANE Q ZEPHYRA] A: "(c20260004171)" B: REFUSED
  - "MsSYNCLAIM0001_" [JANE Q ZEPHYRA] A: "MsSYNCLAIM0001_" B: REFUSED

### REVERSE.PHI.dob: 24929
- how: B refused 24762, B redacted 167
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): p|u (refused) 8601, p|l (refused) 3139, u|_ (refused) 2502, u|p (refused) 2113, _|u (refused) 1874, _|d (refused) 1025, _|l (refused) 907, u|d (refused) 589, d|u (refused) 528, p|d (refused) 466, l|p (refused) 425, d|p (refused) 420
- by source: harness/rg-fixer-2__ownid.mts__default 8652, harness/rg-review-phi-3__ownid3.mts__default 4554, T2/label-own-number 4304, T1/dob 4132, harness/rg-fixer-2__ownidc.mts__default 676, harness/rg-review-phi-3__fuzz4.mts__11 668, harness/rg-review-phi-3__fuzz4.mts__22 668, T5/MOD-13 gluedLetterCase@3fcb9359 430
  - "3/14/80TH" [JANE Q ZEPHYRA] A: "3/14/80TH" B: REFUSED
  - "13/14/80_" [JANE Q ZEPHYRA] A: "13/14/80_" B: REFUSED
  - "3-3-61May" [JUNE Q VANTREE; MAY ZEPHYRA] A: "3-3-61May" B: REFUSED
  - "Ms3/14/80_" [JANE Q ZEPHYRA] A: "Ms3/14/80_" B: REFUSED
  - "13/14/80th" [JANE Q ZEPHYRA] A: "13/14/80th" B: REFUSED

### REVERSE.PHI.initial: 19965
- how: B refused 19965
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): d|_ (refused) 6241, d|p (refused) 5416, _|u (refused) 2835, l|_ (refused) 1767, l|p (refused) 1651, d|u (refused) 560, _|_ (refused) 412, _|p (refused) 383, l|d (refused) 131, l|u (refused) 117, _|l (refused) 108, _|d (refused) 106
- by source: harness/rg-skeptic-gateway__r4__glueinit.mts__default 8865, harness/rg-review-phi-3__sweep1.mts__default 4798, T1/name 2704, harness/rg-review-phi-3__ownid3.mts__default 1413, harness/rg-fixer-2__ownid.mts__default 842, T2/label-own-number 423, harness/rg-review-phi-3__fuzz4.mts__11 312, harness/rg-review-phi-3__fuzz4.mts__22 286
  - "1J. Ma" [JANE MA] A: "1J. [PATIENT_NAME]" B: REFUSED
  - "1J. Ma." [JANE MA] A: "1J. [PATIENT_NAME]." B: REFUSED
  - "(JaneQ1)" [JANE Q ZEPHYRA] A: "(JaneQ1)" B: REFUSED
  - "$10JaneQ_" [JANE Q ZEPHYRA] A: "$10JaneQ_" B: REFUSED
  - "(1J. Ma_)" [JANE MA] A: "(1J. [PATIENT_NAME]_)" B: REFUSED

### REVERSE.PHI.member: 14263
- how: B refused 14263
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): d|p (refused) 2614, d|_ (refused) 1887, d|u (refused) 1802, d|l (refused) 1197, d|d (refused) 1063, l|u (refused) 803, l|p (refused) 709, l|d (refused) 623, _|u (refused) 558, _|d (refused) 553, u|_ (refused) 542, l|_ (refused) 538
- by source: harness/rg-review-phi-3__ownid3.mts__default 10595, T1/member 1633, T2/label-own-number 732, data/reviewer-files 592, harness/rg-fixer-2__ownid2.mts__default 314, T5/MOD-13 gluedLetterCase@3fcb9359 238, harness/rg-review-phi-3__fuzz4.mts__11 84, harness/rg-review-phi-3__fuzz4.mts__22 74
  - "1ZZ7654321" [JANE Q ZEPHYRA] A: "1ZZ7654321" B: REFUSED
  - "MsZZ7654321" [JANE Q ZEPHYRA] A: "MsZZ7654321" B: REFUSED
  - "1ZZ7654321." [JANE Q ZEPHYRA] A: "1ZZ7654321." B: REFUSED
  - "ZZ 76543211" [JANE Q ZEPHYRA] A: "ZZ 76543211" B: REFUSED
  - "zz7654321th" [JANE Q ZEPHYRA] A: "zz7654321th" B: REFUSED

### REVERSE.PHI.name: 115579
- how: B refused 115416, B redacted 163
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|d (refused) 27600, _|u (refused) 17450, d|p (refused) 13447, d|_ (refused) 10913, l|d (refused) 10468, d|u (refused) 6815, l|p (refused) 5382, l|_ (refused) 5021, u|d (refused) 3560, u|_ (refused) 3369, u|p (refused) 3065, d|d (refused) 2935
- by source: harness/rg-review-phi-3__sweep1.mts__default 39563, harness/rg-review-phi-3__ownid3.mts__default 24705, harness/rg-review-phi-3__sweep2.mts__default 16300, T1/name 10773, harness/rg-fixer-2__ownid.mts__default 6471, T2/label-own-number 5829, harness/rg-review-phi-3__fuzz4.mts__22 3043, harness/rg-review-phi-3__fuzz4.mts__11 2985
  - "JANE1" [JANE Q ZEPHYRA] A: "JANE1" B: REFUSED
  - "1Jane" [JANE MA] A: "1Jane" B: REFUSED
  - "1Jane." [JANE Q ZEPHYRA] A: "1Jane." B: REFUSED
  - "(jane1)" [JANE Q ZEPHYRA] A: "(jane1)" B: REFUSED
  - "(1JANE)" [JANE MA] A: "(1JANE)" B: REFUSED

### REVERSE.PHI.phone: 48443
- how: B refused 45256, B redacted 3187
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|_ (refused) 15003, _|p (refused) 7964, l|_ (refused) 4734, _|u (refused) 4279, l|p (refused) 2526, _|_ 1820, u|_ (refused) 1606, l|u (refused) 1498, p|_ (refused) 1495, u|p (refused) 1032, p|p (refused) 963, _|d (refused) 811
- by source: harness/rg-review-phi-3__sweep1.mts__default 12847, T2/label-own-number 9225, harness/rg-review-phi-3__sweep2.mts__default 8407, harness/rg-fixer-2__secfill.mts__4242 2617, harness/rg-fixer-2__secfill.mts__9191 2570, harness/rg-review-phi-3__fuzz4.mts__22 2005, harness/rg-review-phi-3__fuzz4.mts__11 1957, harness/rg-review-gateway-3__secfill.mts__9191 1338
  - "Fax Ty 555 0141" [TY Q ZEPHYRA] A: "Fax [PATIENT_NAME] 555 0141" B: "Fax [PATIENT_NAME] [PHONE]"
  - "TTY Sn\n555 0108" [SN VANTREE] A: "TTY [PATIENT_NAME]\n555 0108" B: "TTY [PATIENT_NAME]\n[PHONE]"
  - "SSN#Sn 555 0192" [SN VANTREE] A: "SSN#[PATIENT_NAME] 555 0192" B: "SSN#[PATIENT_NAME] [SSN]"
  - "SSN Al\n555-0103" [AL ZEPHYRA] A: "SSN [PATIENT_NAME]\n555-0103" B: "SSN [PATIENT_NAME]\n[SSN]"
  - "Fax Ma\n555.0145" [JANE MA] A: "Fax [PATIENT_NAME]\n555.0145" B: "Fax [PATIENT_NAME]\n[PHONE]"

### REVERSE.PHI.ssn: 68168
- how: B refused 64811, B redacted 3357
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|_ (refused) 18855, _|p (refused) 18741, _|u (refused) 5326, p|u (refused) 4457, _|d (refused) 3012, p|_ (refused) 2174, l|_ (refused) 2164, p|l (refused) 1384, l|p (refused) 1382, p|p (refused) 1328, d|_ (refused) 1245, _|_ 1092
- by source: harness/rg-review-phi-3__sweep1.mts__default 16733, T2/label-own-number 12356, harness/rg-review-phi-3__sweep2.mts__default 5254, harness/rg-fixer-2__ownid.mts__default 4777, harness/rg-fixer-2__secfill.mts__9191 3947, harness/rg-fixer-2__secfill.mts__4242 3891, harness/rg-review-phi-3__fuzz4.mts__22 2917, harness/rg-review-phi-3__fuzz4.mts__11 2904
  - "SSN 90012 34.56" [JANE Q ZEPHYRA] A: "SSN 90012 34.56" B: REFUSED
  - "SSN 900 11 59.52" [JANE Q ZEPHYRA] A: "SSN 900 11 59.52" B: REFUSED
  - "SSN 90012 3.4 56" [JANE Q ZEPHYRA] A: "SSN 90012 3.4 56" B: REFUSED
  - "SSN 9001 2.34 56" [JANE Q ZEPHYRA] A: "SSN 9001 2.34 56" B: REFUSED
  - "SSN 900 82.63 71" [JANE Q ZEPHYRA] A: "SSN 900 82.63 71" B: REFUSED

## (3b) Reverse KEEP: A changed or refused, B sends unchanged

_information_

### REVERSE.KEEP.changed.date: 14
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 5, harness/rg-review-phi-3__june.mts__default 4, harness/rg-review-gateway-2__phi13.mts__default 4, harness/rg-review-phi-1__fuzzdob.mts__2 1
  - "Seen 1 May/12\nMay.01" [JUNE MAY VANTREE] A: "Seen 1 May/12\n[PATIENT_NAME].01" B: "Seen 1 May/12\nMay.01"
  - "0.00|1 Jan 01.May-01" [JUNE Q VANTREE; MAY ZEPHYRA] A: "0.00|1 Jan 01.[PATIENT_NAME]-01" B: "0.00|1 Jan 01.May-01"
  - "1 Jan 01_June 13-3-61" [JUNE MAY VANTREE] A: "1 Jan 01_[PATIENT_NAME] 13-3-61" B: "1 Jan 01_June 13-3-61"
  - "DOS 1 Jan 01 / June\n01" [JUNE Q VANTREE] A: "DOS 1 Jan 01 / [PATIENT_NAME]\n01" B: "DOS 1 Jan 01 / June\n01"
  - "Seen 1 Jan 01 May-12, 3rd" [MAY ZEPHYRA] A: "Seen 1 Jan 01 [PATIENT_NAME]-12, 3rd" B: "Seen 1 Jan 01 May-12, 3rd"

### REVERSE.KEEP.unrefused.letter-with-identifiers: 4483
- by source: harness/rg-review-phi-3__sweep3.mts__default 1444, harness/rg-review-phi-3__ownid3.mts__default 667, harness/rg-review-phi-3__ord.mts__default 514, harness/rg-skeptic-gateway__r4__glueinit.mts__default 354, harness/rg-review-gateway-3__fuzzord.mts__sec 331, harness/rg-sweep__sweep.mts__sec 92, harness/rg-review-phi-1__fuzz2l.mts__101 86, harness/rg-review-phi-1__fuzz2.mts__33 84
  - "1. 03/03/1961" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "1. [DATE_OF_BIRTH]"
  - "June. 1961-03-03" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "[PATIENT_NAME]. [DATE_OF_BIRTH]"
  - "01.01/12/01 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "01.[DATE_OF_BIRTH] 2020"
  - "(0.00–03-14-1980)" [JANE Q ZEPHYRA] A: REFUSED B: "(0.00–[DATE_OF_BIRTH])"
  - "(0.00–3.14.1980_)" [JANE Q ZEPHYRA] A: REFUSED B: "(0.00–[DATE_OF_BIRTH]_)"

### REVERSE.KEEP.unrefused.must-stay: 13575
- by source: data/reviewer-files 5092, harness/rg-fixer-2__sweep.mts__default 4186, harness/rg-review-gateway-3__fuzzord.mts__keep 1627, T4/mod16-shape 783, T5/MOD-16 keptSegment@3fcb9359 401, harness/rg-sweep__sweep.mts__keep 231, harness/rg-fixer-1__fuzz.mts__keep 223, harness/rg-review-gateway-1__fuzz.mts__keep 222
  - "150.00➖150.00." [JANE Q ZEPHYRA] A: REFUSED B: "150.00➖150.00."
  - "150.00➖150.00)" [JANE Q ZEPHYRA] A: REFUSED B: "150.00➖150.00)"
  - "03/16/2021–0.00" [JANE Q ZEPHYRA] A: REFUSED B: "03/16/2021–0.00"
  - "(1,234.56⁃150.00" [JANE Q ZEPHYRA] A: REFUSED B: "(1,234.56⁃150.00"
  - "x1/1/2020–150.00" [JANE Q ZEPHYRA] A: REFUSED B: "x1/1/2020–150.00"

## Information

_partial-in-clear: some but not all letters/digits of an occurrence sent by B where A sent none_

### INFO.partial-in-clear.claim: 366
- by source: harness/rg-review-phi-3__ownid3.mts__default 286, harness/rg-fixer-2__ownid2.mts__default 42, T1/claim 38
  - "01/01/2020-150.00C2026000417" [JANE Q ZEPHYRA] A: REFUSED B: "01/01/2020-150.00C[PHONE]"
  - "01/01/2020-150.00C2026000417." [JANE Q ZEPHYRA] A: REFUSED B: "01/01/2020-150.00C[PHONE]."
  - "(01/01/2020-150.00C2026000417_)" [JANE Q ZEPHYRA] A: REFUSED B: "(01/01/2020-150.00C[PHONE]_)"
  - "01/01/2020-150.00C2026000417Seen" [JANE Q ZEPHYRA] A: REFUSED B: "01/01/2020-150.00C[PHONE]Seen"
  - "(01/01/2020-150.00C2026000417th)" [JANE Q ZEPHYRA] A: REFUSED B: "(01/01/2020-150.00C[PHONE]th)"

### INFO.partial-in-clear.dob: 1
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 1
  - "DOS 1 May_May-2001-01-12 01" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "DOS 1 [PATIENT_NAME]_[PATIENT_NAME]-[DATE_OF_BIRTH] 01"

### INFO.partial-in-clear.phone: 74
- by source: harness/rg-review-phi-3__ord.mts__default 59, harness/rg-review-phi-3__sweep3.mts__default 8, harness/rg-review-gateway-3__fuzzord.mts__sec 2, harness/rg-review-phi-2__fuzz3.mts__404 1, harness/rg-review-phi-3__fuzz4.mts__22 1, harness/rg-review-phi-1__fuzz2l.mts__303 1, harness/rg-review-phi-2__fuzz3.mts__303 1, harness/rg-review-phi-3__fuzz4.mts__11 1
  - "SSN 555-0123-01/01/2020-150.00 Paid" [ZEPHYRA Q VANTREE] A: REFUSED B: "SSN [SSN]-01/01/2020-150.00 Paid"
  - "SSN 555-0123–01/01/2020-150.00 Paid" [ZEPHYRA Q VANTREE] A: REFUSED B: "SSN [SSN]–01/01/2020-150.00 Paid"
  - "Paid SSN 555-0123−01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "Paid SSN [SSN]−01/01/2020-150.00"
  - "SSN 555-0123-​01/01/2020-150.00Paid" [ZEPHYRA Q VANTREE] A: REFUSED B: "SSN [SSN]-​01/01/2020-150.00Paid"
  - "Paid SSN 555-0123­01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: "Paid SSN [SSN]­01/01/2020-150.00"

### INFO.partial-in-clear.ssn: 4
- by source: harness/rg-review-phi-1__fuzz2.mts__44 1, harness/rg-review-phi-1__fuzz2.mts__11 1, harness/rg-review-phi-2__fuzz3.mts__404 1, harness/rg-review-phi-1__fuzz2.mts__33 1
  - ". [CLAIM_1]St1-555-012-3456-01/01/2020-150.00" [ZEPHYRA Q VANTREE] A: REFUSED B: ". (CLAIM_1)St1-[PHONE]-01/01/2020-150.00"
  - "Billed 01/01/2020–150.00'SSN1-555-012-3456St. Mary" [ZEPHYRA Q VANTREE] A: REFUSED B: "Billed 01/01/2020–150.00'SSN1-[PHONE]St. Mary"
  - "Reference 01/01/2020–150.00'$5-12.00\n1-SSN1-555-012-3456 Paid" [ZEPHYRA Q VANTREE] A: REFUSED B: "Reference 01/01/2020–150.00'$5-12.00\n1-SSN1-[PHONE] Paid"
  - "DOS 10/01/2026-10/15/2026StxTH1-555-012-3456th01/01/2020–150.00\nPaid" [ZEPHYRA Q VANTREE] A: REFUSED B: "DOS 10/01/2026-10/15/2026StxTH1-[PHONE]th01/01/2020–150.00\nPaid"

## (4) Timing (ms, one run after a warm-up, redactLetterForScreen + holdsIdentifier)

max A 559 ms, max B 1137 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
| dl: digit and bare break | 100000 | 538 | 1137 |
| dl: dates with spaces | 99995 | 476 | 1037 |
| r3 timez: many parts run zZ | 100002 | 134 | 938 |
| harvest: rg-review-gateway-3__timez.mts__default #2 | 100002 | 126 | 893 |
| dl: dates with slashes | 99995 | 559 | 886 |
| r3 timez: many parts run ZzZ | 100002 | 140 | 812 |
| dl: digit dash break | 99999 | 508 | 801 |
| harvest: rg-review-phi-3__scale.mts__default #3 | 100000 | 232 | 758 |
| harvest: rg-review-gateway-3__timez.mts__default #3 | 100002 | 116 | 750 |
| dl: digit and CRLF | 99999 | 424 | 731 |
| dl: digit and dash | 100000 | 349 | 698 |
| r3 timez: many parts run | 100002 | 132 | 670 |
| dl: amount ranges | 99988 | 222 | 651 |
| dl: digit and ZWSP | 100000 | 387 | 646 |
| dl: dates with a claim between | 99988 | 402 | 644 |
| r3 timey: Q1Q initials | 100000 | 317 | 632 |
| dl: date ranges | 99990 | 334 | 628 |
| dl: date ranges glued to next word | 99994 | 345 | 621 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #2 | 100000 | 186 | 613 |
| dl: amount before a date | 99997 | 319 | 607 |
| r3 timey: month words + overlap dates | 100000 | 408 | 604 |
| dl: long gap after a name and many initials | 100008 | 271 | 601 |
| dl: keep-noun list | 100004 | 431 | 599 |
| dl: amounts after a range | 99974 | 226 | 599 |
| r3 timey: spaced member chars | 100000 | 306 | 598 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #3 | 100000 | 283 | 590 |
| harvest: rg-review-phi-2__timing.mts__default #1 | 100000 | 262 | 574 |
| harvest: rg-review-phi-1__timing.mts__default #3 | 100000 | 280 | 567 |
| dl: ranges glued to ordinal-like word | 99990 | 317 | 544 |
| harvest: rg-skeptic-gateway__time.mts__default #3 | 100000 | 303 | 527 |
| harvest: rg-review-gateway-1__time.mts__default #3 | 100000 | 298 | 523 |
| harvest: rg-fixer-2__time.mts__default #3 | 100000 | 356 | 518 |
| dl: digit and indented break | 99996 | 401 | 512 |
| r3 timey: Z1 near-miss | 100000 | 277 | 511 |
| harvest: rg-review-gateway-2__timexE.mts__default #3 | 100000 | 295 | 508 |
| harvest: rg-review-gateway-2__timex.mts__default #3 | 100000 | 325 | 498 |
| harvest: rg-review-gateway-1__timex.mts__default #3 | 100000 | 323 | 496 |
| r3 timex: overlap dates 1.1.1 | 100000 | 302 | 493 |
| harvest: rg-review-gateway-3__timex.mts__default #3 | 100000 | 318 | 493 |
| harvest: rg-review-phi-2__timing.mts__default #3 | 100000 | 279 | 492 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #3 | 100000 | 290 | 491 |
| harvest: rg-fixer-1__time.mts__default #3 | 100000 | 288 | 487 |
| harvest: rg-fixer-2__time-final.mts__default #3 | 100000 | 368 | 482 |
| harvest: rg-fixer-1b__time.mts__default #3 | 100000 | 295 | 478 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #3 | 100000 | 344 | 478 |
| harvest: rg-review-phi-1__timing.mts__default #1 | 100000 | 239 | 467 |
| dl: digit two dashes break | 99996 | 349 | 455 |
| r3 timey: placeholder glued digits | 100000 | 196 | 430 |
| r3 timey: SSN label glued own name | 100000 | 200 | 423 |
| r3 timey: Q1 initials | 100000 | 149 | 395 |
| harvest: rg-review-phi-2__timing.mts__default #2 | 100000 | 342 | 395 |
| r3 timey: own number near-miss | 100000 | 181 | 371 |
| harvest: rg-review-gateway-3__timey.mts__default #3 | 100000 | 156 | 371 |
| r3 timey: long glued zZ run | 100002 | 116 | 366 |
| r3 timey: month glued dense | 100000 | 199 | 366 |
| r3 timex: long word one glue | 100000 | 161 | 361 |
| r3 timey: own number glued | 100000 | 180 | 345 |
| r3 timez: ZZ/ZZZ run | 100002 | 122 | 343 |
| harvest: rg-review-phi-1__timing.mts__default #2 | 100000 | 225 | 342 |
| r3 timey: placeholders chain | 100004 | 173 | 330 |
| harvest: rg-review-gateway-2__timexE.mts__default #2 | 100000 | 196 | 320 |
| r3 timex: words glued both sides | 100000 | 155 | 319 |
| r3 timey: Jane1 repeated | 100000 | 175 | 313 |
| harvest: rg-review-gateway-3__timer.mts__default #1 | 100000 | 202 | 312 |
| harvest: rg-review-gateway-3__timey.mts__default #2 | 100000 | 177 | 312 |
| harvest: rg-skeptic-gateway__time.mts__default #2 | 100000 | 162 | 306 |
| harvest: rg-fixer-2__time.mts__default #2 | 100000 | 151 | 304 |
| harvest: rg-review-gateway-1__timex.mts__default #2 | 100000 | 203 | 303 |
| harvest: rg-fixer-1__time.mts__default #2 | 100000 | 148 | 302 |
| harvest: rg-review-gateway-2__timex.mts__default #2 | 100000 | 168 | 300 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #2 | 100000 | 175 | 300 |
| harvest: rg-fixer-2__time-final.mts__default #2 | 100000 | 153 | 298 |
| r3 timey: month words at run ends | 100000 | 186 | 297 |
| harvest: rg-review-gateway-1__time.mts__default #2 | 100000 | 152 | 297 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #2 | 100000 | 146 | 293 |
| harvest: rg-fixer-1b__time.mts__default #2 | 100000 | 148 | 289 |
| harvest: rg-review-gateway-3__timez.mts__default #1 | 100002 | 133 | 289 |
| harvest: rg-review-phi-3__scale.mts__default #1 | 100000 | 151 | 289 |
| r3 timey: long glued ZZZ run | 100002 | 112 | 288 |
| harvest: rg-review-gateway-3__timex.mts__default #2 | 100000 | 224 | 288 |
| harvest: rg-review-phi-3__scale.mts__default #2 | 100000 | 136 | 286 |
| r3 timey: DOB glued readings | 100000 | 195 | 274 |
| dl: gap after a name as long as the letter | 99990 | 108 | 270 |
| r3 timer: DE LA glued words | 100000 | 158 | 268 |
| harvest: rg-review-phi-3__timing.mts__default #1 | 100000 | 160 | 268 |
| r3 timer: DE LA run 3 names caps | 100002 | 142 | 266 |
| r3 timey: camel own name before label numbers | 100000 | 180 | 265 |
| harvest: rg-review-phi-3__timing.mts__default #2 | 100000 | 138 | 262 |
| r3 timer: DE LA run 2 names | 100002 | 155 | 256 |
| dl: spaced phone chains | 99996 | 152 | 253 |
| r3 timey: JaneZephyraQ repeated glued | 100002 | 121 | 249 |
| harvest: rg-review-gateway-1__time.mts__default #1 | 100000 | 123 | 245 |
| harvest: rg-review-phi-3__timing.mts__default #3 | 100000 | 170 | 245 |
| r3 timey: zephyra pieces spaced | 100004 | 161 | 244 |
| harvest: rg-skeptic-gateway__r2__time.mts__default #1 | 100000 | 109 | 244 |
| harvest: rg-skeptic-gateway__time.mts__default #1 | 100000 | 114 | 243 |
| harvest: rg-skeptic-gateway__r3__time.mts__default #1 | 100000 | 109 | 242 |
| dl: SSNs back to back | 99996 | 143 | 240 |
| r3 timer: XU MA run | 100002 | 176 | 238 |
| harvest: rg-review-gateway-2__timexE.mts__default #1 | 100000 | 114 | 238 |
| dl: nine-digit runs | 100000 | 164 | 236 |
| r3 timez: initials Z run | 100002 | 112 | 236 |
| harvest: rg-review-gateway-1__timex.mts__default #1 | 100000 | 109 | 236 |
| harvest: rg-fixer-1b__time.mts__default #1 | 100000 | 106 | 234 |
| r3 timer: DE LA run camel | 100002 | 129 | 230 |
| harvest: rg-fixer-2__time.mts__default #1 | 100000 | 109 | 230 |
| harvest: rg-review-gateway-2__timex.mts__default #1 | 100000 | 110 | 230 |
| dl: 100 k digit run | 100000 | 130 | 228 |
| dl: phone label before nine digits | 100000 | 172 | 228 |
| harvest: rg-fixer-2__time-final.mts__default #1 | 100000 | 106 | 228 |
| harvest: rg-review-gateway-3__timex.mts__default #1 | 100000 | 108 | 228 |
| dl: one word glued to a digit | 100000 | 108 | 227 |
| r3 timer: LI run | 100002 | 125 | 226 |
| harvest: rg-review-gateway-3__timer.mts__default #2 | 100000 | 124 | 226 |
| dl: initials run after a name | 40008 | 118 | 225 |
| r3 timey: JANE repeated glued | 100002 | 167 | 224 |
| harvest: rg-fixer-1__time.mts__default #1 | 100000 | 107 | 224 |
| harvest: rg-review-gateway-3__timer.mts__default #3 | 100002 | 145 | 223 |
| harvest: rg-skeptic-gateway__r4__time.mts__default #1 | 100000 | 135 | 222 |
| r3 timer: DE LA run caps | 100002 | 123 | 219 |
| r3 timer: LI camel words | 100000 | 118 | 212 |
| dl: initials run before a name | 40007 | 110 | 208 |
| r3 timey: camel AbAb glued | 100002 | 131 | 199 |
| r3 timey: camel aB | 100000 | 138 | 191 |
| r3 timex: medium words before digits | 100002 | 122 | 189 |
| harvest: rg-review-gateway-3__timey.mts__default #1 | 100000 | 188 | 181 |
| dl: phones back to back | 99990 | 130 | 160 |
