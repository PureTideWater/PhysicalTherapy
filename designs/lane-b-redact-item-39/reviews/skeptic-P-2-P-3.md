# Skeptic check of P-2 and P-3 (item 39)

Head: /home/user/item39 at c1caa7306ecf0e03fc5f6d9c6db39870313365e9. Base: /home/user/PhysicalTherapy at 6299c550.
Synthetic data only. Own scripts in /home/user/sk2/ (load.mts, p2.mts, p3.mts); no tracked file edited. The scripts load a
copy of each tree's packages/redact/src/redact.ts (confusables import made absolute); p3 appends one harness-only line
exporting the module's `spansOfReading` so the entry can be inspected.

## P-2: REPRODUCED

Command: `cd /home/user/sk2 && /opt/node24/bin/node --no-warnings p2.mts`

Letter `'Ref 76543210x on file. ' + prose(600) + ' Paid ½ of the charge. ' + prose(300)` (1010 characters), 76543210 held
as member ID, and separately as claim number. Same result for both:

| letter | base last code point / verdict | head last code point / verdict | texts equal | equal once a trailing U+0001 is dropped |
|---|---|---|---|---|
| ½ about 600 after the identifier | U+0001 / HELD | U+002E / HELD | no | yes |
| ½ about 300 after | U+0001 / HELD | U+002E / HELD | no | yes |
| ½ within 100 (prose(50)) | U+0001 / HELD | U+0001 / HELD | yes | yes |
| "half" spelled out (control) | U+002E / HELD | U+002E / HELD | yes | yes |
| ½, no identifier (control) | U+002E / sent | U+002E / sent | yes | yes |

So with the number character far from the glued identifier, the base's returned text carries exactly one U+0001 (at the
end) and the head's carries none; the texts are otherwise identical, and both still contain the glued "76543210x"
unredacted. `holdsIdentifier(r.text, patient, claims, checkWorkOf(r))` holds both, so the verdict is unchanged; only the
returned text differs. With the ½ near the identifier both mark. The far case differs at 300 as well as 600 characters.

## P-3: REPRODUCED (retention while the result is alive; freed with the result)

Reading (head, packages/redact/src/redact.ts):
- line 4032: "Nothing here is kept past the call."
- line 4044: `const spansOfReading = new WeakMap<object, { readonly normal: string; readonly spans: readonly PlacedSpan[] }>();`
  module level; the value holds `normal`, the letter's whole NFKC writing (unbracketed, unredacted), not only indices.
- lines 4046-4049 `withSpans(redacted, normal, spans)` sets it on the object it returns; lines 4365, 4380, 4382 return
  `withSpans(...)` from redactLetterForScreenAsGiven, and the exported redactLetterForScreen (3967-3973) returns that same
  object (`return read`) when nothing further refuses it. So the caller's result is the key.
- The base has no `spansOfReading` at all (grep: no match in the base's redact.ts).

Command: `cd /home/user/sk2 && for w in base head; do /opt/node24/bin/node --no-warnings --expose-gc p3.mts $w; done`

1. Direct: for a 508-character letter with member ID, name, date of birth and claim number, the head's returned object
   has own keys text, claims, replaced, candidates, none holding the identifier (text is redacted), but
   `spansOfReading.get(result)` exists, with `normal.length` 508, `normal === letter.normalize('NFKC')` true, and it
   contains the member ID, the name and the date of birth; 4 spans. Base: no such map, and no own value of the result
   holds the identifier.
2. Heap: 400 unique letters (6.72 MB of characters in all, mostly a 33-character synthetic name; returned text 3.82 MB),
   results kept, letters dropped, gc twice.
   - heap growth with results held: base about 0 MB (-0.34), head 14.95 MB.
   - heap snapshot, live strings that are an unredacted letter: base 1 (the last loop variable), head 400.
   - after dropping the results and gc: head returns to the base's level (-4.36 MB against -4.40 MB) and the snapshot
     shows 1. So the entry is freed when the result is; it is a WeakMap, not a leak past the result's life.

Verdict on the parts of the claim:
- value holds the whole normalised unredacted letter: yes.
- keyed by the returned object, lives exactly as long as it: yes (and freed with it).
- contradicts "Nothing here is kept past the call": yes, the text outlives the call for as long as the caller keeps the
  result.
- worse than base: yes. The base's returned object references nothing of the raw letter beyond what its redacted `text`
  itself contains; the head adds a hidden reference to the full unredacted text (not reachable through the object's
  properties or the module's exports, but alive in the heap, so in a heap dump or core).
- Not covered: results the entry builds afresh (the marked `{ ...read, text }` and the past-budget object) are not keys,
  so they carry no entry once the inner object is dropped.
