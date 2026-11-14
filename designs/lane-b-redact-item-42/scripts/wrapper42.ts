// wrapper42.ts, laid as redact.ts by lay42.sh: the base's reader (redact-core.ts, byte for byte) behind one of Queues
// item 42's candidate rules, read from rule42.json beside it. A measuring prototype: the reader's own rules are
// untouched, the rule only adds. act=refuse: holdsIdentifier is also true where the rule finds a hit in the text it
// is given. act=replace: each hit is written as its placeholder in the text for the screen and added to the spans.
export * from './redact-core';
import fs from 'node:fs';
import * as core from './redact-core';
import { hitsOf, normalOf, placeholderOf, ruleOf, type C, type P } from './rules42';

const RULE = ruleOf(JSON.parse(fs.readFileSync(new URL('./rule42.json', import.meta.url), 'utf8')).rule);
const replaced = (text: string, p: P, c: C): string => {
  let out = text;
  // Until no hit is left (a replacement can bring two pieces together); each pass replaces from the right.
  for (let pass = 0; pass < 4; pass += 1) {
    const hits = hitsOf(RULE, out, p, c);
    if (hits.length === 0) break;
    for (const h of hits.reverse()) out = out.slice(0, h.start) + placeholderOf(h) + out.slice(h.end);
  }
  return out;
};
export function redactLetterForScreen(text: string, p: P, c: C) {
  const read = core.redactLetterForScreen(text, p, c);
  return RULE.act === 'replace' ? { ...read, text: replaced(read.text, p, c) } : read;
}
export function redactLetter(text: string, p: P, c: C) {
  const read = core.redactLetter(text, p, c);
  return RULE.act === 'replace' ? { ...read, text: replaced(read.text, p, c) } : read;
}
export function redactionSpans(text: string, p: P, c: C) {
  const read = core.redactionSpans(text, p, c);
  if (RULE.act !== 'replace') return read;
  const own = hitsOf(RULE, normalOf(text), p, c).map((h) => ({ start: h.start, end: h.end, placeholder: placeholderOf(h) }));
  return { ...read, spans: [...read.spans, ...own] };
}
export function holdsIdentifier(text: string, p: P, c: C, spent = 0) {
  if (core.holdsIdentifier(text, p, c, spent)) return true;
  // The text given here is the text sent: its placeholders stand in square brackets and are barriers to the rule.
  return hitsOf(RULE, text.normalize('NFKC'), p, c).length > 0;
}
