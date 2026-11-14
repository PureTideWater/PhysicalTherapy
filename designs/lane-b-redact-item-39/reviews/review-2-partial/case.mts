// One case in one fresh process: node case.mts '<spec json>'. Prints one JSON line. Synthetic data only.
import { H, once, cpu, tag, who, one } from './h.mts';
const spec = JSON.parse(process.argv[2] ?? '{}');
const SENT = 'The claim was reviewed and paid in full by the plan. ';
const prose = (n: number) => SENT.repeat(Math.ceil(n / SENT.length)).slice(0, n);
const fill = '0918273645QWRTYPSDFGHJKLZXCVBNM';
function ids(count: number, len: string | number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (len === 'cjk1') return i < 20000 ? String.fromCodePoint(0x4e00 + i) : String.fromCodePoint(0x20000 + i - 20000);
    if (len === 'cjk2') return String.fromCodePoint(0x4e00 + (i % 20000), 0x4e00 + Math.floor(i / 20000));
    if (len === 'slash') return `SYN/${String(556000 + i)}`;
    const l = len as number;
    return l >= 9 ? `SYN${String(556000 + i)}${fill.slice(0, l - 9)}` : i.toString(36).toUpperCase().padStart(l, '0');
  });
}
function build(s: any): { text: string; p: any; c: any } {
  if (s.kind === 'ids') {
    return { text: s.letter === 'tiny' ? 'The claim was paid.' : prose(s.n ?? 5830), p: who, c: one(ids(s.count, s.len)) };
  }
  if (s.kind === 'long') {
    // few very long identifiers: count of them, each len characters, distinct
    return { text: 'The claim was paid.', p: who, c: one(Array.from({ length: s.count }, (_, i) => `SYN${String(556000 + i)}` + fill.repeat(Math.ceil(s.len / fill.length)).slice(0, s.len - 9))) };
  }
  if (s.kind === 'chain') {
    const chain = Array.from({ length: s.L }, (_, k) => s.ch.repeat(k + 1)).slice((s.from ?? 1) - 1);
    const text = s.sep !== undefined ? `${s.ch}${s.sep}`.repeat(s.n) : s.spaced ? `${s.ch} `.repeat(s.n / 2) : s.ch.repeat(s.n);
    return { text: s.wrap ? `Claim ${text} was paid.` : text, p: who, c: one(chain) };
  }
  if (s.kind === 'win') {
    let body = prose(s.n);
    if (!s.ws) body = body.replaceAll(' ', '.');
    const from = s.edges ? 2000 : 0;
    const to = s.edges ? s.n - 2000 : s.n;
    const parts: string[] = [];
    let at = 0;
    for (let i = from + s.d; i < to; i += s.d) {
      parts.push(body.slice(at, i - 1), s.marker);
      at = i;
    }
    parts.push(body.slice(at));
    let text = parts.join('');
    if (s.own) {
      const third = Math.floor(text.length / 3);
      text = `${text.slice(0, third)} Patient JANE Q ZEPHYRA, member ID ZZ1234567, claim SYN556001. ${text.slice(third)}`;
    }
    return { text, p: who, c: one(s.count ? ids(s.count, 9) : ['SYN556001']) };
  }
  if (s.kind === 'dense') {
    const written = 'Jane was seen. '.repeat(s.m);
    const total = s.total ?? 130000;
    return { text: prose(Math.max(0, total - written.length) / 2) + written + prose(Math.max(0, total - written.length) / 2), p: who, c: one(['SYN556001']) };
  }
  if (s.kind === 'prefix') {
    let x = 12345;
    const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let S = '';
    for (let i = 0; i < s.L; i += 1) { x = (x * 1103515245 + 12345) & 0x7fffffff; S += al[x % al.length]; }
    const list = Array.from({ length: s.L - 5 }, (_, k) => S.slice(0, k + 6));
    return { text: prose(20000) + ` ${S}`.repeat(s.reps) + ' ' + prose(20000), p: who, c: one(list) };
  }
  if (s.kind === 'skel') {
    const unit: Record<string, string> = { astral: '\u{1D400}', mark: '́', mixed: 'é́', emoji: '\u{1F600}', cjk: '一', astralsp: '\u{1D400}\u{1D401} ' };
    const u = unit[s.what] ?? 'x';
    return { text: u.repeat(Math.floor(s.n / u.length)), p: who, c: one(['SYN556001']) };
  }
  throw new Error('unknown kind');
}
const { text, p, c } = build(spec);
function run() {
  (globalThis as any).__po = { ns: 0n, calls: 0, places: 0 };
  if (spec.plain) {
    const a = cpu();
    const out = H.redactLetter(text, p, c);
    const po = (globalThis as any).__po;
    return { ms: Math.round(cpu() - a), out: `plain:${String(out.replaced)}`, units: 0, poMs: Math.round(Number(po.ns) / 1e6), poCalls: po.calls, places: po.places };
  }
  let r: ReturnType<typeof once>;
  let w = { windows: -1, fallbacks: -1 };
  if (H.matchingForTests?.withWindows) {
    const x = H.matchingForTests.withWindows({}, () => once(text, p, c));
    r = x.result;
    w = x;
  } else r = once(text, p, c);
  const po = (globalThis as any).__po;
  return { ms: Math.round(r.ms), redactMs: Math.round(r.redact), out: r.out, units: r.units, redactUnits: r.redactUnits, clear: r.out === 'sent' && /ZEPHYRA|JANE|ZZ1234567|SYN556001/i.test(r.text), poMs: Math.round(Number(po.ns) / 1e6), poCalls: po.calls, places: po.places, windows: w.windows, fallbacks: w.fallbacks };
}
const cold = run();
const warm = cold.ms < 25000 ? run() : null;
console.log(JSON.stringify({ tree: tag, spec, textLen: text.length, cold, warm, rssMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
