// Shared helpers for the B1 adversarial review. Synthetic data only.
import { pathToFileURL } from 'node:url';

export const TREES: Record<string, string> = {
  base: '/home/user/tree-ef3/packages/model-gateway/src/redact.ts',
  head: '/home/user/fix/packages/model-gateway/src/redact.ts',
  cc3: '/home/user/tree-cc3/packages/model-gateway/src/redact.ts',
};
export const load = async (name: string): Promise<any> => import(pathToFileURL(TREES[name]!).href);

export const P1 = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
export const C1 = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
export const P2 = { pseudonym: 'p', names: ['SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };

export interface Outcome { refused: boolean; sent: string; threw: string | null }
export function outcome(R: any, text: string, P: any = P1, C: any = C1): Outcome {
  try {
    const s = R.redactLetterForScreen(text, P, C);
    const refused = R.holdsIdentifier(s.text, P, C) as boolean;
    return { refused, sent: s.text as string, threw: null };
  } catch (e) {
    return { refused: false, sent: '', threw: String((e as Error)?.stack ?? e).slice(0, 300) };
  }
}

const digitValue = (cp: string) => { const at = cp.codePointAt(0) ?? 0; let zero = at; while (zero > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(zero - 1))) zero -= 1; return String((at - zero) % 10); };
/** The sent text as a reader sees it: placeholders a bar, invisible and control characters gone, every decimal digit its value. */
export const plain = (sent: string) => sent.normalize('NFKC').replace(/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g, '|').replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F]/gu, '').replace(/\p{Nd}/gu, digitValue);
/** Digits in clear, up to three characters that are no letter, digit or placeholder between two of them. */
export const D = (digits: string) => { const re = new RegExp([...digits].join('[^\\p{L}\\p{N}|]{0,3}'), 'u'); return (sent: string) => re.test(plain(sent)); };
/** A raw substring in clear. */
export const Rw = (raw: string) => (sent: string) => sent.normalize('NFKC').includes(raw.normalize('NFKC'));
/** All digits a reader sees, in order. */
export const digitsOf = (sent: string) => plain(sent).replace(/[^0-9]/g, '');
export const show = (text: string, max = 130) => { const j = JSON.stringify(text); return j.length > max ? `${j.slice(0, max)}…` : j; };

export interface Probe { g: string; t: string; leak: ((sent: string) => boolean)[]; P?: any; C?: any; note?: string }

export async function runProbes(probes: Probe[], opts: { all?: boolean; only?: string } = {}) {
  const base = await load('base');
  const head = await load('head');
  const counts: Record<string, Record<string, number>> = {};
  for (const p of probes) {
    if (opts.only && !p.g.startsWith(opts.only)) continue;
    const b = outcome(base, p.t, p.P ?? P1, p.C ?? C1);
    const h = outcome(head, p.t, p.P ?? P1, p.C ?? C1);
    const leaks = (o: Outcome) => !o.refused && o.threw === null && p.leak.some((f) => f(o.sent));
    const tag = (o: Outcome) => (o.threw !== null ? 'THREW' : o.refused ? 'REFUSED' : leaks(o) ? 'SENT-CLEAR' : 'sent-ok');
    const tb = tag(b); const th = tag(h);
    const flag = th === 'THREW' ? 'THROW' : tb === 'REFUSED' && th === 'SENT-CLEAR' ? 'FLIP-LEAK' : tb === 'REFUSED' && th === 'sent-ok' ? 'flip-ok' : tb === 'sent-ok' && th === 'SENT-CLEAR' ? 'UNREDACT' : th === 'SENT-CLEAR' ? 'LEAK' : '';
    (counts[p.g] ??= {})[`${tb}>${th}`] = ((counts[p.g] ??= {})[`${tb}>${th}`] ?? 0) + 1;
    if (opts.all || flag !== '') {
      console.log(`${flag.padEnd(9)} ${p.g.padEnd(8)} base=${tb.padEnd(10)} head=${th.padEnd(10)} ${show(p.t, 90)}${th === 'REFUSED' ? '' : ` => ${h.threw ?? show(h.sent, 100)}`}${p.note ? `  # ${p.note}` : ''}`);
    }
  }
  console.log('--- counts by group (base>head) ---');
  for (const [g, c] of Object.entries(counts)) console.log(g.padEnd(8), JSON.stringify(c));
}
