// A generator of realistic denial and remittance letter lines (synthetic data only), each tagged with its class.
// Phones are 202-555-01xx / 800-555-01xx (reserved for fiction); patients are the synthetic ones the callers pass.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Line { tag: string; text: string }
export interface Gen { line(tag?: string): Line; tags: string[]; pick<T>(xs: readonly T[]): T; int(lo: number, hi: number): number; rnd(): number; date(): string; dosRange(): string; phone(): string; amount(): string; cpt(): string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CITIES = ['Springfield', 'Riverton', 'Lakewood', 'Fairview', 'Georgetown', 'Clinton', 'Madison', 'Franklin', 'Arlington', 'Salem', 'Los Synth', 'Greenville', 'Bristol', 'Oxford', 'Ashland'];
const STATES = ['IL', 'CA', 'TX', 'NY', 'OH', 'PA', 'FL', 'GA', 'WA', 'CO', 'MA', 'VA', 'NC', 'MI', 'AZ', 'MN', 'OR', 'IN', 'MO', 'WI', 'TN', 'NJ', 'MD', 'KY', 'CT'];
const STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Commerce Blvd', 'Park Rd', 'Elm St', 'Corporate Way', 'Lake Shore Dr', 'Market St', 'Washington Ave', 'Industrial Pkwy', '5th Ave', 'N 3rd St', 'W 42nd St'];
const PAYERS = ['Synth Mutual Health Plan', 'Zephyr Benefit Administrators', 'Northwind Health Insurance Company', 'Synthetic Blue Plan of Los Synth', 'Vantree Managed Care', 'Example Health Alliance'];
const CPTS = ['97110', '97112', '97140', '97530', '97161', '97162', '97163', '97164', '97010', '97014', '97032', '97035', '97116', '97535', '97750', '97113', '97124', '97542', '97760', '99213', '98941', '20560', '29125'];
const HCPCS = ['G0283', 'G0151', 'G0157', 'E0114', 'E0118', 'L3000', 'L1830', 'A4556', 'S8948', 'S9131', 'E0745', 'B4034', 'K0001', 'L0650'];
const MODS = ['GP', 'KX', '59', 'CQ', 'GO', '76', '77', 'XU', 'RT', 'LT', '25', 'GA', 'CO'];
const ICDS = ['M54.50', 'M54.2', 'M25.561', 'M25.511', 'S83.511A', 'S83.241D', 'M75.101', 'G89.29', 'M62.81', 'R26.89', 'Z47.1', 'S93.401A', 'M17.11', 'M79.604', 'Z96.651', 'E11.9', 'L03.115', 'I10', 'S13.4XXA', 'S39.012A', 'M51.16', 'M48.061', 'S46.011A', 'G81.94', 'I69.354', 'S72.001D', 'M23.221', 'T84.50XA', 'B12', 'S06.0X0A'];
const CARCS = ['CO-45', 'PR-1', 'PR-2', 'PR-3', 'CO-97', 'CO-50', 'CO-16', 'CO-197', 'OA-23', 'PI-204', 'CO-119', 'CO-151', 'CO-18', 'CO-29', 'CO-4', 'CO-B7', 'PR-96', 'CO-253'];
const RARCS = ['N130', 'N362', 'MA130', 'M15', 'N381', 'N570', 'N30', 'M80', 'N522', 'MA04', 'N4', 'M86', 'N640'];
const WORDS_AFTER = ['was denied', 'has been processed', 'is under review', 'was received', 'has been finalized', 'was paid', 'remains pending'];

export function makeGen(seed: number): Gen {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const digits = (n: number, first?: string) => { let s = first ?? String(int(first === undefined ? 0 : 0, 9)); while (s.length < n) s += String(int(0, 9)); return s.slice(0, n); };
  const nz = (n: number) => digits(n, String(int(1, 9)));
  const letters = (n: number) => { let s = ''; while (s.length < n) s += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[int(0, 23)]; return s; };
  const p2 = (n: number) => String(n).padStart(2, '0');
  const ymd = () => ({ y: int(2024, 2027), m: int(1, 12), d: int(1, 28) });
  const fmtDate = (v: { y: number; m: number; d: number }, form: number): string => {
    const { y, m, d } = v; const w = MONTHS[m - 1] ?? 'May';
    const forms = [
      `${p2(m)}/${p2(d)}/${y}`, `${m}/${d}/${y}`, `${w} ${d}, ${y}`, `${w.slice(0, 3)} ${d}, ${y}`, `${w.slice(0, 3)}. ${d}, ${y}`, `${y}-${p2(m)}-${p2(d)}`, `${p2(m)}-${p2(d)}-${y}`,
      `${d} ${w} ${y}`, `${p2(m)}/${p2(d)}/${String(y).slice(2)}`, `${p2(d)}-${w.slice(0, 3).toUpperCase()}-${y}`, `${w} ${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}, ${y}`, `${p2(m)}.${p2(d)}.${y}`,
    ];
    return forms[form % forms.length] ?? forms[0]!;
  };
  const date = () => fmtDate(ymd(), int(0, 11));
  const dateLoose = () => { const v = ymd(); const w = MONTHS[v.m - 1]!; return pick([fmtDate(v, int(0, 11)), `${w} ${v.y}`, `${p2(v.m)}/${v.y}`, `${w.slice(0, 3)} ${v.y}`, `${v.y}${p2(v.m)}${p2(v.d)}`, `${fmtDate(v, 0)} ${int(1, 12)}:${p2(int(0, 59))} ${pick(['AM', 'PM', 'a.m.', 'p.m.'])}`, `${fmtDate(v, 5)} ${p2(int(0, 23))}:${p2(int(0, 59))}:${p2(int(0, 59))}`, `${fmtDate(v, 5)}T${p2(int(0, 23))}:${p2(int(0, 59))}:${p2(int(0, 59))}Z`, `${fmtDate(v, 5)}T${p2(int(0, 23))}:${p2(int(0, 59))}:00-05:00`, `${fmtDate(v, 0)} at ${p2(int(0, 23))}:${p2(int(0, 59))}`, `${w} ${v.d}`, `${v.d} ${w}`, `${w} ${v.d}th`, `Q${int(1, 4)} ${v.y}`, `${v.y}`]); };
  const dosRange = () => {
    const a = ymd(); const b = { y: a.y, m: a.m, d: Math.min(28, a.d + int(1, 14)) }; const f = pick([0, 1, 5, 6, 8, 11, 2, 3]);
    const w = MONTHS[a.m - 1]!;
    return pick([`${fmtDate(a, f)} - ${fmtDate(b, f)}`, `${fmtDate(a, f)}-${fmtDate(b, f)}`, `${fmtDate(a, f)} to ${fmtDate(b, f)}`, `${fmtDate(a, f)} thru ${fmtDate(b, f)}`, `${fmtDate(a, f)} through ${fmtDate(b, f)}`, `${fmtDate(a, f)}–${fmtDate(b, f)}`, `${fmtDate(a, f)} – ${fmtDate(b, f)}`, `${p2(a.m)}/${p2(a.d)}-${p2(b.m)}/${p2(b.d)}/${a.y}`, `${w.slice(0, 3)} ${a.d}-${b.d}, ${a.y}`, `${w} ${a.d} - ${w} ${b.d}, ${a.y}`]);
  };
  const phoneDigits = () => ({ area: pick(['202', '800', '888', '312', '415', '617', '303', '206']), line: `01${p2(int(0, 99))}` });
  const phone = () => { const { area, line } = phoneDigits(); return pick([`${area}-555-${line}`, `(${area}) 555-${line}`, `${area}.555.${line}`, `1-${area}-555-${line}`, `1 (${area}) 555-${line}`, `+1 ${area} 555 ${line}`, `${area} 555 ${line}`, `${area}-555-${line} ext. ${digits(int(3, 5))}`, `${area}-555-${line} x${digits(int(2, 4))}`, `1.${area}.555.${line}`, `${area}555${line}`, `(${area})555-${line}`]); };
  const dollars = () => pick([String(int(0, 99)), String(int(100, 999)), String(int(100, 999)), `${int(1, 9)},${digits(3)}`, `${int(10, 99)},${digits(3)}`, String(int(1000, 9999))]);
  const cents = () => pick(['00', '00', p2(int(0, 99))]);
  const amount = () => `${dollars()}.${cents()}`;
  const money = () => pick([`$${amount()}`, `$${amount()}`, amount(), `$ ${amount()}`, `(${amount()})`, `-${amount()}`, `$${dollars()}`, `USD ${amount()}`]);
  const cpt = () => pick(CPTS);
  const code = () => pick([cpt(), cpt(), pick(HCPCS)]);
  const npi = () => { const nine = digits(9, pick(['1', '1', '2'])); const payload = `80840${nine}`; let sum = 0; for (let i = 0; i < payload.length; i += 1) { let dg = Number(payload[payload.length - 1 - i]); if (i % 2 === 0) { dg *= 2; if (dg > 9) dg -= 9; } sum += dg; } return `${nine}${(10 - (sum % 10)) % 10}`; };
  const zip = () => digits(5, String(int(0, 9)));
  const yyyy = () => String(int(2023, 2027));
  const refFormats: Record<string, () => string> = {
    'ref.3-2-5': () => `${digits(3)}-${digits(2)}-${digits(5)}`,
    'ref.yyyy-3-4': () => `${yyyy()}-${digits(3)}-${digits(4)}`,
    'ref.yyyy-mm-5': () => `${yyyy()}-${p2(int(1, 12))}-${digits(5)}`,
    'ref.yyyy-6': () => `${yyyy()}-${digits(6)}`,
    'ref.2-7': () => `${digits(2)}-${digits(7)}`,
    'ref.4-4-4': () => `${digits(4)}-${digits(4)}-${digits(4)}`,
    'ref.3-3-3': () => `${digits(3)}-${digits(3)}-${digits(3)}`,
    'ref.5-5': () => `${digits(5)}-${digits(5)}`,
    'ref.6-2-4': () => `${digits(6)}-${digits(2)}-${digits(4)}`,
    'ref.2-3-6': () => `${digits(2)}-${digits(3)}-${digits(6)}`,
    'ref.LL-yyyy-6': () => `${letters(2)}-${yyyy()}-${digits(6)}`,
    'ref.LLL8': () => `${letters(3)}${digits(8)}`,
    'ref.5-5-2': () => `${digits(5)}-${digits(5)}-${digits(2)}`,
    'ref.4.2.5': () => `${digits(4)}.${digits(2)}.${digits(5)}`,
    'ref.12digits': () => digits(12, String(int(1, 9))),
    'ref.1-11': () => `${int(1, 3)}-${digits(11)}`,
    'ref.3-6': () => `${digits(3)}-${digits(6)}`,
    'ref.2-4-6': () => `${digits(2)}-${digits(4)}-${digits(6)}`,
    'ref.5-2-4': () => `${digits(5)}-${digits(2)}-${digits(4)}`,
    'ref.yyyy-3-5': () => `${yyyy()}-${digits(3)}-${digits(5)}`,
    'ref.L9': () => `${letters(1)}${digits(9)}`,
    'ref.14digits': () => digits(14, String(int(1, 9))),
    'ref.4-3-4': () => `${digits(4)}-${digits(3)}-${digits(4)}`,
    'ref.3-3-5': () => `${digits(3)}-${digits(3)}-${digits(5)}`,
    'ref.LLL-3-4': () => `SYN-APL-${digits(3)}-${digits(4)}`,
    'ref.7digits': () => digits(7, String(int(1, 9))),
    'ref.8digits': () => digits(8, '3'),
    'ref.yy-5-3': () => `${digits(2)}-${digits(5)}-${digits(3)}`,
  };
  const refNouns = ['Reference number', 'Reference #:', 'Ref. No.', 'Case No.', 'Appeal case number:', 'Inquiry #', 'Control number', 'Document control number', 'Tracking number', 'Policy number', 'Account number', 'Patient account #:', 'Invoice #', 'Ticket', 'File no.', 'Grievance ID', 'Correspondence ID:', 'Authorization number', 'Certificate number', 'Letter ID:'];
  const T: Record<string, () => string> = {
    // header and addresses
    'hdr.payer': () => pick(PAYERS),
    'hdr.pobox': () => `P.O. Box ${digits(int(3, 6), String(int(1, 9)))}`,
    'hdr.citystzip': () => `${pick(CITIES)}, ${pick(STATES)} ${zip()}`,
    'hdr.citystzip4': () => `${pick(CITIES)}, ${pick(STATES)} ${zip()}-${digits(4)}`,
    'hdr.street': () => `${digits(int(1, 5), String(int(1, 9)))} ${pick(STREETS)}${pick(['', `, Suite ${int(100, 2500)}`, `, Ste. ${int(1, 99)}`, `, Floor ${int(2, 40)}`, `, Bldg ${int(1, 9)}`])}`,
    'hdr.addr1line': () => `${pick(PAYERS)}, ${digits(int(2, 5), String(int(1, 9)))} ${pick(STREETS)}, ${pick(CITIES)}, ${pick(STATES)} ${zip()}${pick(['', `-${digits(4)}`])}`,
    'hdr.pobox.zip4': () => `PO Box ${digits(int(4, 6), String(int(1, 9)))}, ${pick(CITIES)}, ${pick(STATES)} ${zip()}-${digits(4)}`,
    'hdr.date': () => pick([`Date: ${date()}`, date(), `Date of notice: ${date()}`, `Mailed ${dateLoose()}`, `Printed ${dateLoose()}`, `Run date ${dateLoose()}`]),
    'hdr.page': () => pick([`Page ${int(1, 9)} of ${int(2, 12)}`, `Page ${int(1, 9)}`, `- ${int(1, 9)} -`, `${int(1, 9)} / ${int(2, 12)}`]),
    // references a noun names
    'ref.claim.digits': () => `${pick(['Claim Number:', 'Claim #', 'Claim', 'ICN', 'DCN', 'Claim control number', 'Payer claim control #:', 'ICN:'])} ${digits(pick([8, 9, 10, 11, 12, 13, 14, 15, 17]), String(int(1, 9)))}`,
    'ref.claim.alnum': () => `${pick(['Claim Number:', 'Claim #', 'Claim ID', 'ICN'])} ${pick([`${letters(1)}${digits(10)}`, `${letters(2)}${digits(9)}`, `${digits(2)}${letters(1)}${digits(8)}`, `${digits(10)}${letters(2)}`, `${yyyy()}${letters(1)}${digits(7)}`, `E${digits(4)}${letters(2)}${digits(5)}`])}`,
    'ref.auth': () => `${pick(['Authorization #:', 'Auth No.', 'Prior authorization number', 'Referral #'])} ${pick([digits(9, String(int(1, 9))), digits(10, String(int(1, 9))), `${letters(2)}${digits(8)}`, `A${digits(9)}`, digits(7, '4'), `${digits(4)}-${digits(5)}`])}`,
    'ref.check': () => pick([`Check number ${digits(pick([6, 7, 8, 9, 10]), String(int(1, 9)))}`, `Check/EFT #: ${digits(pick([9, 10]), String(int(1, 9)))}`, `EFT trace number ${digits(15, String(int(1, 9)))}`, `EFT Trace: 1${digits(9)}`, `Check # ${digits(8)} dated ${date()}`]),
    'ref.npi': () => `${pick(['NPI:', 'NPI', 'Rendering provider NPI', 'Billing NPI:', 'Provider NPI #', 'Group NPI'])} ${npi()}`,
    'ref.tin': () => pick([`TIN: ${digits(2)}-${digits(7)}`, `TIN ${digits(9)}`, `Tax ID: ${digits(2)}-${digits(7)}`, `Tax ID ${digits(9)}`, `Federal Tax ID # ${digits(2)}-${digits(7)}`, `EIN ${digits(2)}-${digits(7)}`, `FEIN ${digits(2)}-${digits(7)}`, `Tax Identification Number: ${digits(2)}-${digits(7)}`, `TIN/EIN: ${digits(2)}-${digits(7)}`, `Tax ID No. ${digits(9)}`, `Provider TIN (${digits(2)}-${digits(7)})`, `Taxpayer ID ${digits(2)}-${digits(7)}`]),
    'ref.group': () => `${pick(['Group #:', 'Group Number:', 'Group', 'Group No.'])} ${pick([digits(5), digits(6), digits(7), digits(9), `${letters(2)}${digits(5)}`, `${digits(6)}-${digits(3)}`, `${digits(5)} ${digits(4)}`])}`,
    'ref.provider.id': () => pick([`Provider ID ${digits(pick([6, 7, 8, 9, 10]))}`, `PTAN ${letters(1)}${digits(5)}`, `Medicaid provider # ${digits(9)}`, `Provider number: ${digits(10, '0')}`, `Taxonomy ${digits(3)}${letters(1)}${digits(5)}X`, `Facility ID ${digits(6)}`]),
    // phones (should be [PHONE] in both trees)
    'ph.call': () => `${pick(['If you have questions, call us at', 'Please call Member Services at', 'Call', 'Questions? Call', 'Contact Provider Services at', 'You may reach us at', 'Customer service:', 'Telephone:', 'Phone:', 'Tel.', 'Toll-free'])} ${phone()}${pick(['.', ', Monday through Friday, 8:00 a.m. to 5:00 p.m.', ' (TTY 711).', ', 24 hours a day, 7 days a week.', ' between 8 a.m. and 6 p.m. Central time.', ''])}`,
    'ph.fax': () => `${pick(['Fax:', 'Fax', 'Fax appeals to', 'Fax number:', 'Send records by fax to', 'eFax:'])} ${phone()}${pick(['', '.', ' Attn: Appeals'])}`,
    'ph.tty': () => pick(['TTY users call 711.', 'TTY: 711', `TTY ${phone()}`, 'TTY/TDD 711', `TDD: ${phone()}`, 'Hearing impaired: dial 711', `(TTY: 711), 8 a.m. - 8 p.m., 7 days a week`]),
    'ph.list': () => pick([`Phone 1: ${phone()}  Phone 2: ${phone()}`, `Tel: ${phone()} / Fax: ${phone()}`, `Phone ${phone()} | Fax ${phone()}`, `Phone: ${phone()}   Fax: ${phone()}   TTY: 711`, `Fax 1) ${phone()} Fax 2) ${phone()}`, `Appeals: ${phone()}; Claims: ${phone()}; Eligibility: ${phone()}`, `Contact 1: ${phone()} Contact 2: ${phone()}`]),
    'ph.hours': () => pick([`Hours: 8:00 a.m. - 5:00 p.m. ${pick(['ET', 'CT', 'PT'])}, Monday - Friday`, `Open 8-5 M-F`, `Hours 8:00-17:00`, `Available 24/7`, `Office hours 7:30 AM to 6:00 PM`]),
    // service lines
    'svc.row.plain': () => `${date()} ${cpt()} ${int(1, 8)} ${amount()} ${amount()} ${amount()}`,
    'svc.row.cols': () => `${fmtDate(ymd(), 0)}  ${code()}  ${pick(MODS)}  ${int(1, 8)}  $${amount()}  $${amount()}  $${amount()}  ${pick(CARCS)}`,
    'svc.row.code-units-amt': () => `${cpt()}   ${int(1, 9)}   ${amount()}`,
    'svc.row.mod-units-amts': () => `${cpt()} ${pick(MODS)} ${int(1, 8)} ${amount()} ${amount()} ${amount()}`,
    'svc.row.1500': () => `${int(1, 6)} ${fmtDate(ymd(), 0)} ${fmtDate(ymd(), 0)} ${pick(['11', '12', '22', '49'])} ${cpt()} ${pick(MODS)} ${pick(['A', 'AB', 'ABC'])} ${amount()} ${int(1, 8)} ${npi()}`,
    'svc.row.pipe': () => `${fmtDate(ymd(), 0)}|${cpt()}|${int(1, 8)}|${amount()}|${amount()}|${amount()}`,
    'svc.row.tab': () => `${fmtDate(ymd(), 0)}\t${cpt()}\t${pick(MODS)}\t${int(1, 8)}\t${amount()}\t${amount()}`,
    'svc.row.unsigned-amts': () => `${cpt()} ${fmtDate(ymd(), 0)} ${amount()} ${amount()} ${amount()} ${amount()}`,
    'svc.row.units-first': () => `${int(1, 8)} ${cpt()} ${pick(MODS)} ${fmtDate(ymd(), 0)} $${amount()}`,
    'svc.row.line-no': () => `Line ${int(1, 9)}: ${cpt()}-${pick(MODS)} x ${int(1, 8)} units, billed $${amount()}, allowed $${amount()}, paid $${amount()}`,
    'svc.dos': () => `${pick(['Date of service:', 'DOS', 'Dates of service:', 'Service dates', 'Service period:', 'DOS:', 'From/To:'])} ${pick([dosRange(), dosRange(), date()])}`,
    'svc.dx': () => pick([`Diagnosis: ${pick(ICDS)}, ${pick(ICDS)}`, `ICD-10 ${pick(ICDS)}`, `Dx: ${pick(ICDS).replace('.', '')}`, `Primary diagnosis ${pick(ICDS)} (${pick(['low back pain', 'pain in right knee', 'unspecified sprain'])})`, `Diagnosis codes: ${pick(ICDS)} ${pick(ICDS)} ${pick(ICDS)}`, `DX ${pick(ICDS).replace('.', '')} ${pick(ICDS).replace('.', '')}`]),
    'svc.codes': () => pick([`CPT codes ${cpt()}, ${cpt()} and ${cpt()} were denied.`, `HCPCS ${pick(HCPCS)}`, `Procedure code ${cpt()} with modifier ${pick(MODS)}`, `Modifier ${pick(MODS)}, ${pick(MODS)}`, `Rev code 0${int(420, 449)}`, `CPT ${cpt()}/${cpt()}`, `CPT ${cpt()}-${pick(MODS)}, ${cpt()}-${pick(MODS)}-${pick(MODS)}`, `Codes ${cpt()} ${cpt()} ${cpt()} ${pick(HCPCS)}`, `${cpt()} x ${int(1, 8)}; ${cpt()} x ${int(1, 8)}`, `Procedure ${cpt()} (${int(1, 4)} units) on ${date()}`, `Codes billed: ${cpt()}-${cpt()}`, `Place of service ${pick(['11', '12', '22'])}, type of bill 0${int(111, 899)}`]),
    'svc.reason': () => pick([`${pick(CARCS)}: Charge exceeds fee schedule/maximum allowable.`, `${pick(CARCS)} ${pick(RARCS)}`, `CARC ${int(1, 299)} / RARC ${pick(RARCS)}`, `Remark codes: ${pick(RARCS)}, ${pick(RARCS)}, ${pick(RARCS)}`, `Denial reason ${int(1, 299)}: services not medically necessary`, `Adjustment reason code ${pick(CARCS)}; group code ${pick(['CO', 'PR', 'OA', 'PI'])}`, `EOB code ${letters(1)}${digits(3)}`]),
    'svc.totals': () => pick([`Total billed: $${amount()}  Allowed: $${amount()}  Paid: $${amount()}  Patient responsibility: $${amount()}`, `Total charges ${amount()} allowed ${amount()} paid ${amount()}`, `Billed ${amount()}; allowed ${amount()}; deductible ${amount()}; coinsurance ${amount()}; paid ${amount()}`, `Amount paid: ${money()} on ${date()}`, `Totals ${amount()} ${amount()} ${amount()} ${amount()}`, `Net payment $${amount()} Check amount $${amount()}`, `Balance due: ${money()}`, `Interest ${amount()} Late filing reduction ${amount()}`, `Paid ${amount()} ${yyyy()}`, `${amount()} ${amount()}`]),
    'svc.units': () => pick([`Units billed: ${int(1, 12)}; units allowed: ${int(0, 8)}`, `${int(8, 60)} visits per calendar year; ${int(1, 40)} visits used`, `Visit ${int(1, 30)} of ${int(12, 60)}`, `${int(15, 60)} minutes = ${int(1, 4)} units`, `Limit: ${int(20, 90)} days`, `Benefit maximum $${int(1, 5)},${digits(3)} per year; $${amount()} used in ${yyyy()}`, `Deductible ${yyyy()}: $${amount()} of $${amount()} met`, `Out-of-pocket maximum ${yyyy()} ${amount()}`, `Coinsurance ${int(10, 50)}% Copay $${int(10, 75)}`]),
    // deadlines
    'ddl.appeal': () => pick([`You must file your appeal within ${pick([30, 60, 65, 90, 120, 180, 365])} days of the date of this notice.`, `Appeal by ${date()}.`, `Appeals must be received by ${date()}`, `no later than ${date()}`, `within ${pick([30, 60, 180])} calendar days from ${date()}`, `Your appeal deadline is ${date()}.`, `Request a reconsideration on or before ${date()}`, `Timely filing limit: ${pick([90, 180, 365])} days from the date of service (${date()})`, `You have until ${date()} to request an external review.`, `Respond by ${dateLoose()}.`]),
    'ddl.time': () => pick([`by 5:00 p.m. ${pick(['ET', 'CT'])} on ${date()}`, `Received ${dateLoose()}`, `Processed on ${dateLoose()}`, `Effective ${dateLoose()} through ${dateLoose()}`, `Coverage effective ${date()}; termination ${date()}`, `Statement period ${dosRange()}`]),
    // legal, forms, policies
    'law.cfr': () => pick(['under 29 CFR 2560.503-1', 'See 45 CFR 147.136.', 'as required by 29 CFR 2590.715-2719', '42 CFR 405.940 through 405.958', '42 U.S.C. 1395ff(b)', 'ERISA Section 502(a)', 'Section 1557 of the Affordable Care Act', '42 CFR 438.402(c)(2)', '42 CFR 422.578', '45 CFR 164.524', 'Title 28, Section 1300.68', 'pursuant to 42 CFR 411.15(k)(1)', 'Social Security Act Section 1862(a)(1)(A)', '29 U.S.C. 1132(a)(1)(B)', '42 CFR 424.44', 'Medicare Claims Processing Manual, Chapter 5, Section 20.2', 'Pub. 100-02, Chapter 15, Section 220.3', '42 CFR 405.1000-405.1140', '29 CFR 2590.715-2713', '26 CFR 54.9815-2719', '45 CFR 149.510', 'Public Law 111-148']),
    'law.form': () => pick(['Form CMS-1500 (02/12)', 'CMS-20027 (12/21)', `OMB No. 0938-${digits(4)}`, `H${digits(4)}_${digits(2)}_${digits(4)}_C`, `Y00${digits(2)}_${letters(4)}${digits(1)}XXEN_C Accepted`, `Rev. ${p2(int(1, 12))}/${yyyy()}`, 'Form 1095-B', `Form No. ${letters(2)}-${digits(5)} (${int(1, 12)}/${String(int(20, 26))})`, `${letters(3)}-${digits(4)}-${letters(2)} R${p2(int(1, 12))}/${String(int(20, 26))}`, `UB-04 CMS-1450`, `OMB 0938-1197 (Expires ${p2(int(1, 12))}/${p2(int(28, 30))}/${yyyy()})`, `Material ID ${letters(1)}${digits(4)}_${yyyy()}_${digits(3)}`, `Doc ${digits(5)}${letters(2)}${p2(int(1, 12))}${String(int(20, 26))}`]),
    'law.policy': () => pick([`Medical Policy ${int(1, 9)}.${p2(int(1, 20))}.${p2(int(1, 99))}`, `Clinical Policy Bulletin 0${digits(3)}`, `LCD L${digits(5)}`, `NCD ${int(10, 280)}.${int(1, 30)}`, `Policy section ${int(1, 12)}.${int(1, 9)}.${int(1, 9)}(${pick(['a', 'b', 'c'])})`, `Article A${digits(5)}`, `Certificate of Coverage, Section ${int(1, 14)}, page ${int(1, 120)}`, `Plan document page ${int(1, 200)}, paragraph ${int(1, 9)}`, `Guideline ${letters(2)}-${digits(4)} v${int(1, 9)}.${int(0, 9)}`, `InterQual ${yyyy()}.${int(1, 3)}`, `MCG ${int(20, 28)}th edition`]),
    'law.web': () => pick(['www.synthpayer.example/appeals', 'appeals@synthpayer.example', 'https://provider.synthpayer.example/claims/status', 'Visit medicare.example/appeals'] as const),
    // bank
    'bank.eft': () => pick([`Payment of $${amount()} was issued by EFT on ${date()}, trace number ${digits(15, String(int(1, 9)))}.`, `Deposited to account ending in ${digits(4)}`, `EFT to routing ${digits(9, '0')} account ending ${digits(4)}`, `ACH credit ${amount()} settled ${date()}`, `Remit to: Lockbox ${digits(6)}, ${pick(CITIES)}, ${pick(STATES)} ${zip()}-${digits(4)}`]),
    'bank.masked': () => pick([`Deposited to account XXXXXX${digits(4)}`, `Account: ******${digits(4)}`, `Bank account xxxxxxx${digits(4)}`, `Acct XXXX${digits(4)}`, `Account number ending XXXXX${digits(4)}`, `Card XXXX-XXXX-XXXX-${digits(4)}`, `Routing XXXXX${digits(4)} Account XXXXXXXX${digits(4)}`, `Member ID XXXXXXX${digits(4)}`, `Subscriber ID: XXXXX${digits(4)}`, `Account ****${digits(4)}`]),
    // prose with numbers
    'prose': () => pick([`We reviewed ${int(2, 80)} pages of medical records.`, `Coverage is limited to ${int(12, 60)} visits per benefit year.`, 'The allowed amount was reduced by 2% for sequestration.', `Your plan pays ${pick([70, 80, 90, 100])}% after the deductible.`, `Range of motion improved from ${int(60, 110)} to ${int(111, 140)} degrees.`, `The member is ${int(18, 95)} years old.`, 'This is not a bill.', 'Services were not medically necessary.', `The claim was received ${int(1, 400)} days after the date of service.`, `A total of ${int(2, 30)} claims were adjusted.`, `Plan year ${yyyy()}`, `Reviewed by Medical Director, license ${letters(1)}${digits(5)}`, `Pain ${int(0, 10)}/10; strength ${int(3, 5)}/5`, `Timed codes require ${pick([8, 15, 23, 38])} minutes.`, `Level ${pick(['L4-L5', 'L5-S1', 'C5-C6'])} disc herniation`, `Fiscal year ${yyyy()}-${String(int(24, 28))}`, `Batch ${digits(4)} sequence ${digits(6)}`, `Envelope ${digits(3)} of ${digits(4)}`, `Notice ${int(1, 3)} of 3`, `Reference the enclosed ${int(2, 9)}-page summary.`, `Over ${int(1, 9)},${digits(3)} providers in network`, `Approx. ${int(100, 900)} characters remaining`, `Tier ${int(1, 4)} benefit level`, `Room ${int(100, 999)}, Building ${letters(1)}`]),
    // identifier lines (the call's own): filled by the caller's patient
  };
  for (const [tag, make] of Object.entries(refFormats)) T[tag] = () => `${pick(refNouns)} ${make()}${pick(['', '', ` ${pick(WORDS_AFTER)}.`, '.', ` dated ${date()}`])}`;
  const tags = Object.keys(T);
  return { line: (tag?: string) => { const chosen = tag ?? pick(tags); return { tag: chosen, text: (T[chosen] as () => string)() }; }, tags, pick, int, rnd, date, dosRange, phone, amount, cpt };
}

export const TAGLINES: readonly string[] = [
  'ATENCIÓN: si habla español, tiene a su disposición servicios gratuitos de asistencia lingüística. Llame al 1-800-555-0199 (TTY: 711).',
  '注意：如果您使用繁體中文，您可以免費獲得語言援助服務。請致電 1-800-555-0199（TTY：711）。',
  'CHÚ Ý: Nếu bạn nói Tiếng Việt, có các dịch vụ hỗ trợ ngôn ngữ miễn phí dành cho bạn. Gọi số 1-800-555-0199 (TTY: 711).',
  '주의: 한국어를 사용하시는 경우, 언어 지원 서비스를 무료로 이용하실 수 있습니다. 1-800-555-0199 (TTY: 711) 번으로 전화해 주십시오.',
  'PAUNAWA: Kung nagsasalita ka ng Tagalog, maaari kang gumamit ng mga serbisyo ng tulong sa wika nang walang bayad. Tumawag sa 1-800-555-0199 (TTY: 711).',
  'ВНИМАНИЕ: Если вы говорите на русском языке, то вам доступны бесплатные услуги перевода. Звоните 1-800-555-0199 (телетайп: 711).',
  'ملحوظة: إذا كنت تتحدث اذكر اللغة، فإن خدمات المساعدة اللغوية تتوافر لك بالمجان. اتصل برقم 1-800-555-0199 (رقم هاتف الصم والبكم: 711).',
  'ATANSYON: Si w pale Kreyòl Ayisyen, gen sèvis èd pou lang ki disponib gratis pou ou. Rele 1-800-555-0199 (TTY: 711).',
  'ATTENTION : Si vous parlez français, des services d\'aide linguistique vous sont proposés gratuitement. Appelez le 1-800-555-0199 (ATS : 711).',
  'UWAGA: Jeżeli mówisz po polsku, możesz skorzystać z bezpłatnej pomocy językowej. Zadzwoń pod numer 1-800-555-0199 (TTY: 711).',
  'ATENÇÃO: Se fala português, encontram-se disponíveis serviços linguísticos, grátis. Ligue para 1-800-555-0199 (TTY: 711).',
  'ATTENZIONE: In caso la lingua parlata sia l\'italiano, sono disponibili servizi di assistenza linguistica gratuiti. Chiamare il numero 1-800-555-0199 (TTY: 711).',
  'ACHTUNG: Wenn Sie Deutsch sprechen, stehen Ihnen kostenlos sprachliche Hilfsdienstleistungen zur Verfügung. Rufnummer: 1-800-555-0199 (TTY: 711).',
  '注意事項：日本語を話される場合、無料の言語支援をご利用いただけます。1-800-555-0199（TTY: 711）まで、お電話にてご連絡ください。',
  'توجه: اگر به زبان فارسی گفتگو می کنید، تسهیلات زبانی بصورت رایگان برای شما فراهم می باشد. با 1-800-555-0199 (TTY: 711) تماس بگیرید.',
  'ध्यान दें: यदि आप हिंदी बोलते हैं तो आपके लिए मुफ्त में भाषा सहायता सेवाएं उपलब्ध हैं। 1-800-555-0199 (TTY: 711) पर कॉल करें।',
  'ΠΡΟΣΟΧΗ: Αν μιλάτε ελληνικά, στη διάθεσή σας βρίσκονται υπηρεσίες γλωσσικής υποστήριξης, οι οποίες παρέχονται δωρεάν. Καλέστε 1-800-555-0199 (TTY: 711).',
  'УВАГА! Якщо ви розмовляєте українською мовою, ви можете звернутися до безкоштовної служби мовної підтримки. Телефонуйте за номером 1-800-555-0199 (телетайп: 711).',
  'ՈՒՇԱԴՐՈՒԹՅՈՒՆ՝ Եթե խոսում եք հայերեն, ապա ձեզ անվճար կարող են տրամադրվել լեզվական աջակցության ծառայություններ: Զանգահարեք 1-800-555-0199 (TTY (հեռատիպ)՝ 711):',
  'লক্ষ্য করুনঃ যদি আপনি বাংলা, কথা বলতে পারেন, তাহলে নিঃখরচায় ভাষা সহায়তা পরিষেবা উপলব্ধ আছে। ফোন করুন ১-৮০০-৫৫৫-০১৯৯ (TTY: ৭১১)।',
  'เรียน: ถ้าคุณพูดภาษาไทยคุณสามารถใช้บริการช่วยเหลือทางภาษาได้ฟรี โทร 1-800-555-0199 (TTY: 711).',
  'DİKKAT: Eğer Türkçe konuşuyor iseniz, dil yardımı hizmetlerinden ücretsiz olarak yararlanabilirsiniz. 1-800-555-0199 (TTY: 711) irtibat numaralarını arayın.',
  'સુચના: જો તમે ગુજરાતી બોલતા હો, તો નિ:શુલ્ક ભાષા સહાય સેવાઓ તમારા માટે ઉપલબ્ધ છે. ફોન કરો 1-800-555-0199 (TTY: 711).',
  'خبردار: اگر آپ اردو بولتے ہیں، تو آپ کو زبان کی مدد کی خدمات مفت میں دستیاب ہیں ۔ کال کریں 1-800-555-0199 (TTY: 711).',
  'Dosis: 25 µg; resistencia 50 Ω; volumen 5 ℓ; № 12; ½ unidad; ¼ tableta; 37 ℃; α-bloqueador; β2; IFN-γ; ≥ 90°.',
  'Señor(a): su reclamación fue denegada el 5 de mayo de 2026. Puede apelar en un plazo de 180 días. Teléfono: 1-800-555-0199. Año 2026; niño; Peña; Muñoz.',
  'Madame, Monsieur : votre demande a été refusée le 5 mai 2026. Vous pouvez faire appel dans un délai de 180 jours. Tél. : 1-800-555-0199. Elle a reçu 3 séances.',
];
