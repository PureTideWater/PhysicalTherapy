// Lines that hold the call's own identifiers (the synthetic patient JANE Q ZEPHYRA) beside ordinary content, and letters built of lines.
import { makeGen, TAGLINES, type Gen, type Line } from './gen.mts';
export function idLine(g: Gen, tag?: string): Line {
  const nine = () => String(g.int(100000000, 999999999));
  const ten = () => `${g.int(1, 9)}${String(g.int(100000000, 999999999))}`;
  const name = () => g.pick(['JANE Q ZEPHYRA', 'Jane Q. Zephyra', 'ZEPHYRA, JANE Q', 'Jane Zephyra', 'JANE ZEPHYRA', 'Ms. Zephyra']);
  const T: Record<string, () => string> = {
    'id.patient': () => `${g.pick(['Patient:', 'Patient Name:', 'Member:', 'RE:', 'Subscriber:', 'Insured:', 'Dear'])} ${name()}`,
    'id.member': () => `${g.pick(['Member ID:', 'ID#', 'Subscriber ID', 'Member number:'])} SYNMEMBER0042`,
    'id.dob': () => `${g.pick(['DOB:', 'Date of birth:', 'Birth date'])} ${g.pick(['03/14/1980', 'March 14, 1980', '1980-03-14', '3/14/80'])}`,
    'id.claim': () => `${g.pick(['Claim Number:', 'Claim #', 'Claim', 'Re: Claim'])} SYNCLAIM0001`,
    'id.combo': () => `Patient: ${name()}   Member ID: SYNMEMBER0042   DOB: 03/14/1980   Claim: SYNCLAIM0001`,
    'id.contact': () => g.pick([
      `Contact: ${name()}, ${g.phone()}`, `Called ${name()} on ${g.date()} at ${g.phone()}`, `Phone call with ${name()} regarding claim ${nine()}`, `Member contacted: ${name()} ${g.date()}`,
      `Spoke with ${name()} re claim ${ten()}`, `Fax to ${name()} ${g.phone()}`, `Contact name: ${name()}   ${g.cpt()}   ${g.int(1, 8)}   ${g.amount()}   ${g.amount()}`, `We called ${name()} about check ${nine()}`,
      `Contact ${name()}, ${g.pick(['Springfield', 'Riverton'])}, IL ${String(g.int(60001, 62999))}-${String(g.int(1000, 9999))}`, `Telephone contact with ${name()}: authorization ${ten()} approved`, `Mobile ${name()} ${g.phone()}`, `Call ${name()} (${g.pick(['spouse', 'self'])}) re ICN ${nine()}`,
    ]),
    'id.row': () => g.pick([
      `${name()} ${g.dosRange()} ${g.cpt()} ${g.int(1, 8)} ${g.amount()} ${g.amount()}`, `SYNCLAIM0001 ${name()} ${g.date()} ${g.cpt()} ${g.amount()}`, `${name()}  SYNMEMBER0042  ${g.date()}  ${g.cpt()}  $${g.amount()}`,
      `Patient ${name()} Acct ${nine()} DOS ${g.date()}`, `Claim SYNCLAIM0001   ${g.cpt()}   ${g.int(1, 8)}   ${g.amount()}`, `${name()} 03/14/1980 SYNMEMBER0042 ${g.cpt()} ${g.int(1, 9)} ${g.amount()}`,
    ]),
    'id.claimlist': () => g.pick([
      `Claims SYNCLAIM0001 and ${nine()} were denied.`, `Claim numbers ${ten()}, SYNCLAIM0001`, `Claim SYNCLAIM0001, ICN ${String(g.int(10000000000, 99999999999))}`, `Claim: SYNCLAIM0001  ${nine()}  ${g.date()}`,
      `Claim numbers ${nine()}, SYNCLAIM0001 and ${nine()} were reprocessed.`, `Reference ${ten()} and SYNCLAIM0001`, `Claims SYNCLAIM0001, ${ten()}`, `Claim SYNCLAIM0001 (replaces claim ${nine()})`,
    ]),
  };
  const tags = Object.keys(T);
  const chosen = tag ?? g.pick(tags);
  return { tag: chosen, text: (T[chosen] as () => string)() };
}
export const ID_TAGS = ['id.patient', 'id.member', 'id.dob', 'id.claim', 'id.combo', 'id.contact', 'id.row', 'id.claimlist'];
const group = (g: Gen, prefix: string) => g.tags.filter((t) => t.startsWith(prefix));
/** A letter: header, the call's identifier lines, references, phones, service lines, deadlines, law, bank, prose, a tagline. */
export function letter(g: Gen, opts: { dashedRef?: number; ids?: boolean } = {}): Line[] {
  const lines: Line[] = [];
  const some = (prefix: string, lo: number, hi: number) => { const pool = group(g, prefix); for (let k = g.int(lo, hi); k > 0; k -= 1) lines.push(g.line(g.pick(pool))); };
  some('hdr.', 2, 4);
  if (opts.ids !== false) for (let k = g.int(1, 3); k > 0; k -= 1) lines.push(idLine(g, g.pick(['id.patient', 'id.member', 'id.dob', 'id.claim', 'id.combo', 'id.patient', 'id.claim'])));
  const plainRefs = ['ref.claim.digits', 'ref.claim.alnum', 'ref.auth', 'ref.check', 'ref.npi', 'ref.tin', 'ref.group', 'ref.provider.id'];
  for (let k = g.int(1, 3); k > 0; k -= 1) lines.push(g.line(g.pick(plainRefs)));
  if (g.rnd() < (opts.dashedRef ?? 0.5)) lines.push(g.line(g.pick(g.tags.filter((t) => /^ref\.[0-9yL]/.test(t)))));
  some('ph.', 1, 3);
  some('svc.', 2, 6);
  some('ddl.', 1, 2);
  some('law.', 0, 2);
  if (g.rnd() < 0.3) lines.push(g.line('bank.eft'));
  some('prose', 1, 3);
  if (g.rnd() < 0.3) lines.push({ tag: 'tagline', text: g.pick(TAGLINES) });
  if (opts.ids !== false && g.rnd() < 0.25) lines.push(idLine(g, g.pick(['id.contact', 'id.row', 'id.claimlist'])));
  // a light shuffle inside the body, the header kept first
  for (let i = lines.length - 1; i > 3; i -= 1) { const j = g.int(3, i); const t = lines[i]!; lines[i] = lines[j]!; lines[j] = t; }
  return lines;
}
const BREAKS = ['\n', '\n', '\n', '\r\n', '\n\n', '\n  '];
/** The letter's text and where each line starts in it. */
export function joinLines(g: Gen, lines: Line[]): { text: string; starts: number[] } {
  let text = '';
  const starts: number[] = [];
  lines.forEach((l, i) => { starts.push(text.length); text += l.text + (i === lines.length - 1 ? '' : g.pick(BREAKS)); });
  return { text, starts };
}
export { makeGen, TAGLINES };
