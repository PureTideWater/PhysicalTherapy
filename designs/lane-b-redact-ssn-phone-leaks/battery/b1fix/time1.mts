// Avenue 5: time of redactLetterForScreen + holdsIdentifier on one stress letter (at most 100,000 characters) on one tree.
// node time1.mts <case> <base|head>   (prints: case tree length ms outcome)
import { load, P1, C1 } from './lib.mts';
const [, , name, tree] = process.argv;
const rep = (s: string, total = 100000) => s.repeat(Math.floor(total / s.length));
const H = 'Seen 01/01/2020-150.00Paid in full. ';
const CASES: Record<string, () => string> = {
  cyr: () => rep('я'),
  cyrwords: () => rep('яяяяяяя '),
  nearcross: () => rep('Z3PHYR4 '),
  longtoken: () => rep('ZEPHYR'),
  longtoken2: () => rep('Z3PHYR'),
  longtoken3: () => rep('SYNMEMBER004'),
  longtoken4: () => rep('5YNMEMBERO04'),
  ranges: () => rep('01/01/2020-01/31/2020 '),
  heldmany: () => rep(H),
  names: () => rep('Zephyra '),
  listnum: () => rep('Phone 1: 555-0100 '),
  through: () => rep('Call Zephyra at 555-0123 '),
  heldmar: () => H + rep('MAR ', 99900),
  heldmarch: () => H + rep('March the ', 99900),
  helddigits: () => H + rep('12 34 56 78 ', 99900),
  heldones: () => H + rep('1 ', 99900),
  heldfives: () => H + rep('12345 ', 99900),
  heldamounts: () => H + rep('150.00 ', 99900),
  heldamounts2: () => H + rep('1,234.56-', 99900),
  glued: () => rep('900-12-3456a '),
  ownrun: () => 'Phone ' + rep('Zephyra, ', 99000) + '555-0123',
  ownruns: () => rep('Zephyra '.repeat(60) + '555-0123\n'),
  ownruns2: () => rep('Phone ' + '03/14/1980 '.repeat(40) + '555-0123 '),
  arabic: () => rep('٩'),
  arabicgroups: () => rep('٩٠٠-١٢-٣٤٥٦ '),
  greekname: () => rep('ΖΕΡΗΥRΑ '),
  zwsp: () => rep('​'),
  azwsp: () => rep('a​'),
  dzwsp: () => rep('1​'),
  currency: () => rep('$1 '),
  ssnlabels: () => H + rep('SSN ', 99900),
  doblabels: () => rep('DOB '),
  helddoblabels: () => H + rep('DOB ', 99900),
  heldborn: () => H + rep('born on ', 99900),
  heldranges: () => H + rep('01/01/2020-01/31/2020 ', 99900),
  heldrangenum: () => H + rep('7 01/01/2020-01/31/2020 9 ', 99900),
  heldlocal: () => H + rep('555 0123 Paid ', 99900),
  heldcodes: () => H + rep('97110 ', 99900),
  heldcodelist: () => H + 'CPT ' + rep('97110, ', 99900),
  heldzip: () => H + rep('IL 62701-1234 ', 99900),
  heldword: () => H + rep('a1 ', 99900),
  heldmask: () => H + rep('aXXX-XX-345 ', 99900),
  heldyearwords: () => H + rep('March nineteen ', 99900),
  heldroman: () => H + rep('14 III ', 99900),
  marks: () => rep('ã'),
  digitmarks: () => rep('1̃'),
  named: () => rep('Inquiry # 150-98-68279 '),
  namedlong: () => rep('abcdefghij 900-12-34567 '),
  gluedshape: () => rep('900-12-3456150.00 '),
  dashes: () => rep('1-'),
  dots: () => rep('1.'),
  slashes: () => rep('1/'),
  spaces1: () => rep('1 '),
  heldslashes: () => H + rep('1/', 99900),
  helddashes: () => H + rep('1-', 99900),
  heldcomma: () => H + rep('1,', 99900),
  heldparen: () => H + rep('(1)', 99900),
  months: () => rep('May '),
  monthnum: () => rep('May 5 '),
  heldmonthnum: () => H + rep('Mar 1 ', 99900),
  heldspaces: () => H + 'March' + ' '.repeat(99000) + '14',
  spacesdate: () => rep('1' + ' '.repeat(49)),
  spacesmonth: () => rep('March' + ' '.repeat(45)),
};
if (name === 'list') { console.log(Object.keys(CASES).join(' ')); process.exit(0); }
const R = await load(tree!);
const text = CASES[name!]!();
const t0 = performance.now();
const s = R.redactLetterForScreen(text, P1, C1);
const t1 = performance.now();
const refused = R.holdsIdentifier(s.text, P1, C1);
const t2 = performance.now();
console.log(`${name!.padEnd(14)} ${tree!.padEnd(4)} len ${String(text.length).padStart(6)} redact ${(t1 - t0).toFixed(0).padStart(6)} ms check ${(t2 - t1).toFixed(0).padStart(6)} ms total ${(t2 - t0).toFixed(0).padStart(6)} ms ${refused ? 'REFUSED' : 'sent'} sentlen ${s.text.length}`);
