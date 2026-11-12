# Gate report

- tree A: `/home/user/tree-base/packages/redact/src` (redact.ts 2ba7e0235c4b)
- tree B: `/home/user/headsrc` (redact.ts aa41c5e46483)
- corpus: 975489 letters, sha256 89a133ca67449143; 966 s
- stats: letters 975489, same 975489, differ 0, refusedA 462984, refusedB 462984, errorsA 0, errorsB 0, spanMismatch 0, cachedA 975489, cachedB 0, metadata 0, annotated 0, msRunA 133.99932288951698, msRunB 1917005.0109260145, msClassify 0, msParse 6559.630580052023

## (1) PHI: A redacted or refused, B sends it in clear

_by kind; note = how A protected it_

none

## (2) KEEP: B changes or refuses what A sent unchanged

_changed.<class> = a character of that class B covers and A did not, outside every own identifier_

none

## (1b) Unplaced: B sends a letter A refused that has 7+ digits after an SSN/phone word but no SSN/phone the oracle can place

_a fuzz letter of a random 9xx SSN, or a must-stay row after a phone word: judge by the examples and hits file_

none

## (3a) Reverse PHI: A sent in clear, B redacts or refuses

_information_

none

## (3b) Reverse KEEP: A changed or refused, B sends unchanged

_information_

none

## Information

_partial-in-clear: some but not all letters/digits of an occurrence sent by B where A sent none_

none

## (4) Timing (ms, one run after a warm-up, redactLetterForScreen + holdsIdentifier)

max A 0 ms, max B 0 ms, budget 3000 ms; over budget in B: none

| case | chars | A | B |
|---|---:|---:|---:|
