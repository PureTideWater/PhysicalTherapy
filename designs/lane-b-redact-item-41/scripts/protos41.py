#!/usr/bin/env python3
# protos41.py <root>: the three prototypes the orchestrator's widening asks to measure (2026-11-13 19:54 UTC), each on a
# copy of item 40's reader (<root>/head), outside packages/; each a design measurement, not product code.
#  head-s5: S-5. The initials' gaps take "/", ":", "·" and "。" as well, and an initial's period may come after a run of
#           unseen characters (\p{Cc}, \p{Cf}), for the initial itself and for the taken initial before it.
#  head-f:  ruling (f)'s partial fix as the review words it: "Name.X." is taken when X has its own period (another period
#           follows), and an undotted capital after an initial already taken is taken before a lower-case word, except
#           A, I and O.
#  head-ph: ruling (c)'s option, before the reader: a phone pass over the letter as given that reads every number
#           character that is no decimal digit (\p{Nl}\p{No}) as a space; such characters touching or inside a phone-shaped
#           run become spaces, and the reader's own phone reading takes the number (a wrapper; offsets hold).
import sys, os, shutil, hashlib
root = sys.argv[1]; src = lambda t: os.path.join(root, t, 'packages/model-gateway/src')
head = open(os.path.join(src('head'), 'redact.ts')).read()
def tree(name, text, extra=None):
    d = src(name); os.makedirs(d, exist_ok=True)
    shutil.copy(os.path.join(src('head'), 'confusables.ts'), d)
    if extra is None:
        open(os.path.join(d, 'redact.ts'), 'w').write(text)
    else:
        open(os.path.join(d, 'redact-core.ts'), 'w').write(text); open(os.path.join(d, 'redact.ts'), 'w').write(extra)
    print(name, hashlib.sha256(open(os.path.join(d, 'redact.ts'), 'rb').read()).hexdigest()[:12])
def sub(text, old, new):
    assert text.count(old) == 1, old[:60]; return text.replace(old, new)
# S-5
s5 = head
s5 = sub(s5, "const INITIAL_GAP = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD]*$/u;", "const INITIAL_GAP = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD/:·。]*$/u;")
s5 = sub(s5, "const INITIAL_GAP_AFTER = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD]*(?:,[\\s\\u00AD]*)?$/u;", "const INITIAL_GAP_AFTER = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD/:·。]*(?:,[\\s\\u00AD]*)?$/u;")
s5 = sub(s5, "const GAP_CHARACTER = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD,]$/u;", "const GAP_CHARACTER = /^[\\s'‘’ʼʹˊ`´\\p{Pd}−⁃_\\u00AD,/:·。]$/u;\nconst periodAt = (text: string, at: number): number => { let k = at; while (k < text.length && /[\\p{Cc}\\p{Cf}]/u.test(text[k] ?? '')) k += 1; return text[k] === '.' ? k : -1; };")
s5 = sub(s5, "    const dotted = view.text[candidate.end] === '.';\n    const resume = candidate.end + (dotted ? 1 : 0);",
             "    const dotAt = periodAt(view.text, candidate.end);\n    const dotted = dotAt >= 0;\n    const resume = dotted ? dotAt + 1 : candidate.end;")
s5 = sub(s5, "    const itsPeriod = preceding !== undefined && view.text[preceding.end] === '.' && (preceding === before || (wider && endsInLetterAlone(view.text, preceding)));\n    const gapFrom = preceding === undefined ? 0 : preceding.end + (itsPeriod ? 1 : 0);",
             "    const precedingDot = preceding === undefined ? -1 : periodAt(view.text, preceding.end);\n    const itsPeriod = preceding !== undefined && precedingDot >= 0 && (preceding === before || (wider && endsInLetterAlone(view.text, preceding)));\n    const gapFrom = preceding === undefined ? 0 : itsPeriod ? precedingDot + 1 : preceding.end;")
tree('head-s5', s5)
# (f)
f = head
f = sub(f, "(preceding === before || (wider && endsInLetterAlone(view.text, preceding)));", "(preceding === before || (wider && endsInLetterAlone(view.text, preceding)) || (dotted && preceding === earlier));")
f = sub(f, "cased(preceding) && (dotted || !beforeLowerCaseWord(view, normal, candidate.end, known));",
           "cased(preceding) && (dotted || !beforeLowerCaseWord(view, normal, candidate.end, known) || (preceding === before && !['A', 'I', 'O'].includes(written(candidate).toUpperCase())));")
tree('head-f', f)
# phone pass
ph = """// Item 40's reader behind a phone pass that reads number characters as spaces (Queues item 41, ruling (c)'s option). A prototype.
// On the letter as given (before NFKC): every number character that is no decimal digit (\\p{Nl}\\p{No}) touching or inside a
// phone-shaped run, read with such characters as spaces, becomes spaces (one per code unit, so offsets hold); then the
// reader reads it as it reads any letter, and its own phone reading takes the number.
export * from './redact-core';
import * as core from './redact-core';
type P = Parameters<typeof core.redactLetter>[1]; type C = Parameters<typeof core.redactLetter>[2];
const NUMBER_CHARACTER = /[\\p{Nl}\\p{No}]/u;
const PHONE = /(?<!\\p{Nd})(?:\\(?\\d{3}\\)?[ .-]{0,3})?\\d{3}[ .-]{0,3}\\d{4}(?!\\p{Nd})/gu;
export function phoneRead(text: string): string {
  if (!NUMBER_CHARACTER.test(text)) return text;
  let read = ''; const isNum: boolean[] = [];
  for (const u of text) { const n = NUMBER_CHARACTER.test(u); read += n ? ' '.repeat(u.length) : u; for (let k = 0; k < u.length; k += 1) isNum.push(n); }
  const blank = new Set<number>();
  for (const m of read.matchAll(PHONE)) {
    let start = m.index!, end = start + m[0].length;
    while (start > 0 && isNum[start - 1]) start -= 1; while (end < text.length && isNum[end]) end += 1;
    for (let k = start; k < end; k += 1) if (isNum[k]) blank.add(k);
  }
  if (blank.size === 0) return text;
  let out = ''; for (let k = 0; k < text.length; k += 1) out += blank.has(k) ? ' ' : text[k]; return out;
}
export function redactLetter(text: string, p: P, c: C) { return core.redactLetter(phoneRead(text), p, c); }
export function redactLetterForScreen(text: string, p: P, c: C) { return core.redactLetterForScreen(phoneRead(text), p, c); }
export function redactionSpans(text: string, p: P, c: C) { return core.redactionSpans(phoneRead(text), p, c); }
"""
tree('head-ph', head, ph)
