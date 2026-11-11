# Gate report

- tree A: `/home/user/tree-ef3/packages/model-gateway/src` (redact.ts 2ec4601af59f)
- tree B: `/home/user/snap17/packages/model-gateway/src` (redact.ts 53cb59aa8970)
- corpus: 975489 letters, sha256 89a133ca67449143; 754 s
- stats: letters 975489, same 928039, differ 47450, refusedA 422677, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 0, cachedB 0, metadata 15182, annotated 32268, msRunA 1281471.1558639714, msRunB 1677370.4587739762, msClassify 28832.216255990537, msParse 7423.23776300168

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

### KEEP.changed.amount: 1
- how: after an SSN/phone word 1
- by source: harness/rg-fixer-1b__fuzzK.mts__keep_4242 1
  - "Phone (2); 364.33\n15.00 12.00 3.00" [JANE Q ZEPHYRA] A: "Phone (2); 364.33\n15.00 12.00 3.00" B: "Phone (2); [PHONE].00 12.00 3.00"

### KEEP.changed.date: 308
- how: no SSN/phone word 308
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 156, harness/rg-review-phi-1__fuzzdob.mts__2 149, harness/rg-review-gateway-3__tok.mts__default 3
  - "DOS May 301" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS May 301" B: "DOS [PATIENT_NAME] 301"
  - "May 2020.Jan" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020.Jan" B: "[PATIENT_NAME] 2020.Jan"
  - "May 2020, Jan" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020, Jan" B: "[PATIENT_NAME] 2020, Jan"
  - "May 2020_12th" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020_12th" B: "[PATIENT_NAME] 2020_12th"
  - "May 2020/12th" [JUNE Q VANTREE; MAY ZEPHYRA] A: "May 2020/12th" B: "[PATIENT_NAME] 2020/12th"

### KEEP.changed.number: 17
- how: after an SSN/phone word 17
- by source: harness/rg-fixer-2__secfill.mts__4242 6, harness/rg-review-gateway-3__secfill.mts__9191 4, harness/rg-fixer-2__secfill.mts__9191 4, harness/rg-review-gateway-3__secfill.mts__4242 3
  - "Tel 7: is 802\n8185.55 0193Paid" [JANE Q ZEPHYRA] A: "Tel 7: is 802\n8185.55 0193Paid" B: "Tel 7: is [PHONE].55 0193Paid"
  - "Re: SSN 7: is 605 9147 2.78 64" [JANE Q ZEPHYRA] A: "Re: SSN 7: is 605 9147 2.78 64" B: "Re: SSN 7: is [SSN] 2.78 64"
  - "SSN: 0: is 728\n3705.55 0117Paid" [JANE Q ZEPHYRA] A: "SSN: 0: is 728\n3705.55 0117Paid" B: "SSN: 0: is [SSN].55 0117Paid"
  - "Re: Call 4: is 809 5045.55 0162 " [JANE Q ZEPHYRA] A: "Re: Call 4: is 809 5045.55 0162 " B: "Re: Call 4: is [PHONE].55 0162 "
  - "Cell 0: is 007\n2685.55 0188 Paid" [JANE Q ZEPHYRA] A: "Cell 0: is 007\n2685.55 0188 Paid" B: "Cell 0: is [PHONE].55 0188 Paid"

### KEEP.refused.letter-with-identifiers: 3877
- by source: harness/rg-review-phi-3__labname.mts__default 2191, harness/rg-review-phi-3__sweep3.mts__default 704, harness/rg-review-phi-3__ownid3.mts__default 265, harness/rg-skeptic-gateway__r4__glueinit.mts__default 197, harness/rg-review-gateway-3__fuzzord.mts__sec 114, harness/rg-review-phi-3__fuzz4.mts__11 48, harness/rg-review-phi-3__fuzz4.mts__22 34, harness/rg-skeptic-gateway__r4__glueshort.mts__default 29
  - "(JANE#0.00–01/02/2020)" [JANE Q ZEPHYRA] A: "([PATIENT_NAME]#0.00–01/02/2020)" B: REFUSED
  - "(Jane#0.00--2020-01-02)" [JANE Q ZEPHYRA] A: "([PATIENT_NAME]#0.00--2020-01-02)" B: REFUSED
  - "DOS 1961-03-03.May 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "DOS [DATE_OF_BIRTH].May 2020" B: REFUSED
  - "Seen 2001-01-12.May 2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen [DATE_OF_BIRTH].May 2020" B: REFUSED
  - "Seen Jane-0.00-01/02/2020" [JANE Q ZEPHYRA] A: "Seen [PATIENT_NAME]-0.00-01/02/2020" B: REFUSED

### KEEP.refused.must-stay.after-ssn-phone-word: 603
- by source: data/reviewer-files 214, harness/rg-fixer-1b__fuzzK.mts__keep_4242 183, harness/rg-review-phi-3__sweep3.mts__default 71, harness/rg-skeptic-gateway__r2__fuzzK.mts__keep_4242 50, T5/MOD-16 keptSegment@3fcb9359 36, harness/rg-fixer-1b__fuzzK.mts__sec_4242 17, harness/rg-review-gateway-3__fuzzord.mts__sec 8, harness/rg-review-phi-1__fuzz.mts__1 5
  - "TTY (2), 70.55\n150.00" [JANE Q ZEPHYRA] A: "TTY (2), 70.55\n150.00" B: REFUSED
  - "SSN (2)\n716.74 150.00" [JANE Q ZEPHYRA] A: "SSN (2)\n716.74 150.00" B: REFUSED
  - "SSN: (2)\n35.80 150.00" [JANE Q ZEPHYRA] A: "SSN: (2)\n35.80 150.00" B: REFUSED
  - "SSN (2); 764.23 150.00" [JANE Q ZEPHYRA] A: "SSN (2); 764.23 150.00" B: REFUSED
  - "TTY 1: 7,439.10 150.00" [JANE Q ZEPHYRA] A: "TTY 1: 7,439.10 150.00" B: REFUSED

### KEEP.refused.must-stay.other: 3359
- by source: data/reviewer-files 1519, harness/rg-review-gateway-3__fuzzord.mts__keep 742, T4/mod16-shape 188, harness/rg-fixer-2__sweep.mts__default 185, T5/MOD-16 keptSegment@3fcb9359 116, harness/rg-fixer-1__fuzz.mts__keep 99, harness/rg-review-gateway-1__fuzz.mts__keep 79, harness/rg-review-phi-3__sweep3.mts__default 78
  - "0.00➖12/25/2027" [JANE Q ZEPHYRA] A: "0.00➖12/25/2027" B: REFUSED
  - "519.80⁃10/10/25" [JANE Q ZEPHYRA] A: "519.80⁃10/10/25" B: REFUSED
  - "0.00-2025/04/13." [JANE Q ZEPHYRA] A: "0.00-2025/04/13." B: REFUSED
  - "x150.00‐01/02/20" [JANE Q ZEPHYRA] A: "x150.00‐01/02/20" B: REFUSED
  - "x150.00➖01/02/20" [JANE Q ZEPHYRA] A: "x150.00➖01/02/20" B: REFUSED

## (1b) Unplaced: B sends a letter A refused that has 7+ digits after an SSN/phone word but no SSN/phone the oracle can place

_a fuzz letter of a random 9xx SSN, or a must-stay row after a phone word: judge by the examples and hits file_

none

## (3a) Reverse PHI: A sent in clear, B redacts or refuses

_information_

### REVERSE.PHI.dob: 44
- how: B refused 44
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): d|d (refused) 22, p|d (refused) 11, _|d (refused) 11
- by source: T1/dob 44
  - "103141980150.00" [JANE Q ZEPHYRA] A: "103141980150.00" B: REFUSED
  - "#03141980150.00" [JANE Q ZEPHYRA] A: "#03141980150.00" B: REFUSED
  - "(150.00031419801)" [JANE Q ZEPHYRA] A: "(150.00031419801)" B: REFUSED
  - "(119800314150.00)" [JANE Q ZEPHYRA] A: "(119800314150.00)" B: REFUSED
  - "(#19800314150.00)" [JANE Q ZEPHYRA] A: "(#19800314150.00)" B: REFUSED

### REVERSE.PHI.initial: 635
- how: B refused 635
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|u (refused) 551, l|d (refused) 33, l|p (refused) 24, l|_ (refused) 12, l|u (refused) 5, u|u (refused) 5, p|u (refused) 3, p|p (refused) 1, _|p (refused) 1
- by source: harness/rg-review-phi-3__sweep1.mts__default 390, T2/label-own-number 110, harness/rg-review-phi-3__fuzz4.mts__22 67, harness/rg-review-phi-3__fuzz4.mts__11 66, harness/rg-review-phi-3__ownid3.mts__default 2
  - "SSNJaneQ900674296\n" [JANE Q ZEPHYRA] A: "SSNJaneQ[SSN]\n" B: REFUSED
  - "Tel: JaneQ2025550146\n" [JANE Q ZEPHYRA] A: "Tel: JaneQ[PHONE]\n" B: REFUSED
  - "TTY JaneQ900-34-2483." [JANE Q ZEPHYRA] A: "TTY JaneQ[SSN]." B: REFUSED
  - "TelJaneQ312.555.0145\n" [JANE Q ZEPHYRA] A: "TelJaneQ[PHONE]\n" B: REFUSED
  - "Re: SSN: JaneQ900296865." [JANE Q ZEPHYRA] A: "Re: SSN: JaneQ[SSN]." B: REFUSED

### REVERSE.PHI.name: 12645
- how: B refused 12477, B redacted 168
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): l|d (refused) 4729, _|u (refused) 4282, u|d (refused) 1451, l|p (refused) 945, d|l (refused) 255, l|u (refused) 165, _|d (refused) 155, l|_ (refused) 131, u|p (refused) 113, u|u (refused) 88, _|_ 87, p|u (refused) 85
- by source: harness/rg-review-phi-3__sweep2.mts__default 4774, harness/rg-review-phi-3__sweep1.mts__default 4679, T2/label-own-number 1502, harness/rg-review-phi-3__fuzz4.mts__22 535, harness/rg-review-phi-3__ownid3.mts__default 490, harness/rg-review-phi-3__fuzz4.mts__11 484, harness/rg-review-phi-1__fuzzdob.mts__1 56, T1/name 54
  - "May-150.00" [MAY ZEPHYRA] A: "May-150.00" B: "[PATIENT_NAME]-150.00"
  - "#may-150.00" [MAY ZEPHYRA] A: "#may-150.00" B: "#[PATIENT_NAME]-150.00"
  - "(MAY-150.00)" [MAY ZEPHYRA] A: "(MAY-150.00)" B: "([PATIENT_NAME]-150.00)"
  - "#JUNE-150.00" [JUNE Q VANTREE] A: "#JUNE-150.00" B: "#[PATIENT_NAME]-150.00"
  - "Seen May 361" [JUNE Q VANTREE; MAY ZEPHYRA] A: "Seen May 361" B: "Seen [PATIENT_NAME] 361"

### REVERSE.PHI.phone: 10703
- how: B refused 7475, B redacted 3228
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|_ (refused) 2786, _|_ 1845, _|p (refused) 1569, _|u (refused) 674, _|p 597, _|d (refused) 566, _|u 551, p|d (refused) 461, p|_ (refused) 387, p|p (refused) 291, u|_ (refused) 164, u|p (refused) 147
- by source: T2/label-own-number 5618, harness/rg-review-phi-3__fuzz4.mts__11 947, harness/rg-review-phi-3__fuzz4.mts__22 932, harness/rg-review-phi-3__sweep2.mts__default 864, data/reviewer-files 853, harness/rg-review-phi-3__sweep3.mts__default 394, harness/rg-fixer-2__secfill.mts__4242 246, harness/rg-fixer-2__secfill.mts__9191 220
  - "Fax Ty 555 0141" [TY Q ZEPHYRA] A: "Fax [PATIENT_NAME] 555 0141" B: "Fax [PATIENT_NAME] [PHONE]"
  - "TTY Sn\n555 0108" [SN VANTREE] A: "TTY [PATIENT_NAME]\n555 0108" B: "TTY [PATIENT_NAME]\n[PHONE]"
  - "SSN#Sn 555 0192" [SN VANTREE] A: "SSN#[PATIENT_NAME] 555 0192" B: "SSN#[PATIENT_NAME] [SSN]"
  - "SSN Al\n555-0103" [AL ZEPHYRA] A: "SSN [PATIENT_NAME]\n555-0103" B: "SSN [PATIENT_NAME]\n[SSN]"
  - "Fax Ma\n555.0145" [JANE MA] A: "Fax [PATIENT_NAME]\n555.0145" B: "Fax [PATIENT_NAME]\n[PHONE]"

### REVERSE.PHI.ssn: 16325
- how: B refused 12965, B redacted 3360
- glued (left|right: d digit, l lower, u upper, p punct, _ space/end): _|_ (refused) 5074, _|p (refused) 2717, _|u (refused) 1305, _|_ 1092, _|d (refused) 804, p|_ (refused) 778, d|_ 697, _|p 554, d|p 458, p|p (refused) 452, u|_ (refused) 427, _|u 262
- by source: T2/label-own-number 7760, harness/rg-review-phi-3__sweep2.mts__default 1975, harness/rg-review-phi-3__fuzz4.mts__11 1675, harness/rg-review-phi-3__fuzz4.mts__22 1664, data/reviewer-files 501, harness/rg-fixer-2__secfill.mts__9191 374, harness/rg-review-phi-3__sweep3.mts__default 372, harness/rg-fixer-2__secfill.mts__4242 331
  - "thSSN 989-668243" [JANE Q ZEPHYRA] A: "thSSN 989-668243" B: REFUSED
  - "963.73960878731-" [JANE Q ZEPHYRA] A: "963.73960878731-" B: REFUSED
  - "ndSSN 91585-2635" [JANE Q ZEPHYRA] A: "ndSSN 91585-2635" B: REFUSED
  - "934-551-904206.3" [JANE Q ZEPHYRA] A: "934-551-904206.3" B: REFUSED
  - "RdSSN 942-276128" [JANE Q ZEPHYRA] A: "RdSSN 942-276128" B: REFUSED

## (3b) Reverse KEEP: A changed or refused, B sends unchanged

_information_

### REVERSE.KEEP.unrefused.letter-with-identifiers: 32
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 18, harness/rg-review-phi-1__fuzzdob.mts__2 14
  - "June. 1961-03-03" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "[PATIENT_NAME]. [DATE_OF_BIRTH]"
  - "DOS May|2001-01-12" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "DOS [PATIENT_NAME]|[DATE_OF_BIRTH]"
  - "May-2001-01-12$0.00" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "[PATIENT_NAME]-[DATE_OF_BIRTH]$0.00"
  - "Seen June_1961-03-03" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "Seen [PATIENT_NAME]_[DATE_OF_BIRTH]"
  - "Seen June. 1961-03-03" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "Seen [PATIENT_NAME]. [DATE_OF_BIRTH]"

### REVERSE.KEEP.unrefused.must-stay: 1
- by source: harness/rg-review-phi-1__fuzzdob.mts__2 1
  - "DOS May / 150.00_2020" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "DOS [PATIENT_NAME] / [SSN]"

## Information

_partial-in-clear: some but not all letters/digits of an occurrence sent by B where A sent none_

### INFO.partial-in-clear.dob: 1
- by source: harness/rg-review-phi-1__fuzzdob.mts__1 1
  - "DOS 1 May_May-2001-01-12 01" [JUNE Q VANTREE; MAY ZEPHYRA] A: REFUSED B: "DOS 1 [PATIENT_NAME]_[PATIENT_NAME]-[DATE_OF_BIRTH] 01"

## (4) Timing (ms, one run after a warm-up, redactLetterForScreen + holdsIdentifier)

max A 0 ms, max B 0 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
