// Item 40's head (e.g. 107c87e1) and the windowed re-read the orchestrator asked for (S-1, S-2), as source patches, for
// measuring only. Synthetic data only.
//
//   head     item 40's head as pushed.
//   headwin  the two whole re-reads (unseen characters joined: refusedWithUnseenCharactersJoined; number characters as
//            one: refusedWithNumberCharactersAsOne) each read only windows around the characters that ask for them:
//            the character's place +-R (R = ITEM40_RADIUS, 128), each edge moved out to a whitespace character (taken
//            into the window) so no window cuts a run of letters, digits and joiners, merged where they overlap. Each
//            window is read as given and as the re-read writes it; refused where the re-read's check holds an
//            identifier, or the two writings differ (as the whole re-read's rule, window by window). Charged in full on
//            the letter's count, every window's readings and checks (S-2's check too).
type Patch = [string, string];
function apply(src: string, patches: Patch[]): string {
  for (const [from, to] of patches) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`item40 patch found ${n} times: ${from.slice(0, 80)}`);
    src = src.split(from).join(to);
  }
  return src;
}
const WINDOWS = `
// item 40 windows prototype.
export const item40Stats = { windows: 0, windowCharacters: 0, letters: 0 };
const ITEM40_RADIUS = Number(process.env.ITEM40_RADIUS ?? '128');
const ITEM40_SPACE = /\\s/u;
function item40Windows(text: string, find: RegExp): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  const search = new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags + 'g');
  for (let m = search.exec(text); m !== null; m = search.exec(text)) {
    let start = Math.max(0, m.index - ITEM40_RADIUS);
    let end = Math.min(text.length, m.index + m[0].length + ITEM40_RADIUS);
    while (start > 0 && !ITEM40_SPACE.test(text[start] as string)) start -= 1;
    while (end < text.length && !ITEM40_SPACE.test(text[end - 1] as string)) end += 1;
    // Never a window edge inside a surrogate pair.
    if (start > 0 && /[\\uDC00-\\uDFFF]/u.test(text[start] as string)) start -= 1;
    const last = found[found.length - 1];
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end); else found.push({ start, end });
    if (m[0].length === 0) search.lastIndex += 1;
  }
  return found;
}
function item40RefusedInWindows(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], find: RegExp, rewrite: (window: string) => string, further: { spent: number }): boolean {
  item40Stats.letters += 1;
  for (const { start, end } of item40Windows(text, find)) {
    const window = text.slice(start, end);
    item40Stats.windows += 1; item40Stats.windowCharacters += window.length;
    const given = redactLetterForScreenBesideNumberCharacters(window, patient, claims, further.spent);
    further.spent = checkWorkOf(given);
    if (further.spent > CHECK_WORK_BUDGET) return true;
    const again = redactLetterForScreenBesideNumberCharacters(rewrite(window), patient, claims, further.spent);
    further.spent = checkWorkOf(again);
    if (further.spent > CHECK_WORK_BUDGET) return true;
    if (holdsIdentifierCounted(again.text, patient, claims, further.spent, further) || again.text !== rewrite(given.text)) return true;
  }
  return false;
}
function item40NumberWindows(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], further: { spent: number }): boolean {
  for (const { start, end } of item40Windows(text, NUMBER_CHARACTERS)) {
    const window = text.slice(start, end);
    item40Stats.windows += 1; item40Stats.windowCharacters += window.length;
    const inner = { spent: further.spent };
    const refused = refusedWithNumberCharactersAsOne(window, patient, claims, further.spent, inner);
    further.spent = inner.spent;
    if (refused || further.spent > CHECK_WORK_BUDGET) return true;
  }
  return false;
}
`;
export function patchedHead(src: string, variant: string): string {
  if (variant === 'head') return src;
  if (variant !== 'headwin') throw new Error(`unknown ${variant}`);
  return apply(src, [
    ['  const refused = refusedWithUnseenCharactersJoined(text, patient, claims, read.text, further);',
     '  const refused = item40RefusedInWindows(text, patient, claims, UNSEEN_CHARACTERS, (w) => w.replace(UNSEEN_CHARACTERS, UNSEEN_JOINED), further);'],
    ['  const refused = refusedWithNumberCharactersAsOne(text, patient, claims, spent, further, read);',
     '  const refused = item40NumberWindows(text, patient, claims, further);'],
    // S-2 inside the number re-read: its check counted on the letter's count (the window's), as the doc comment says.
    ['    (asGiven === undefined && holdsIdentifier(again.text, patient, claims, counted))',
     '    (asGiven === undefined && holdsIdentifierCounted(again.text, patient, claims, counted, further))'],
  ]) + WINDOWS;
}
