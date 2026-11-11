// Batch 1: mutants of the design's quoted forms (G1..G7, fold, digit-for-letter), offsets, injection. node batch1.mts [all] [group prefix]
import { D, Rw, P2, runProbes, type Probe } from './lib.mts';

const ssn = [D('3456'), D('90012')];
const phone = [D('5550123'), D('0123')];
const local = [D('5550100'), D('5550123'), D('5550124')];
const probes: Probe[] = [];
const add = (g: string, leak: Probe['leak'], texts: string[], extra: Partial<Probe> = {}) => { for (const t of texts) probes.push({ g, t, leak, ...extra }); };

// G1: another number's digits glued to an SSN's or phone's own shape
add('G1a', ssn, [
  'Paid 900-12-3456150.00', 'Paid 900 12 3456150.00', 'Paid 900.12.3456150.00', 'Paid 900 - 12 - 3456150.00', 'Paid 900- 12- 3456150.00',
  'Paid 900·12·3456150.00', 'Paid 900/12/3456150.00', 'Paid 900_12_3456150.00', "Paid 900'12'3456150.00", 'Paid 900~12~3456150.00',
  'Paid 900•12•3456150.00', 'Paid 900–12–3456150.00', 'Paid 900--12--3456150.00', 'Paid 900-12-\n3456150.00', 'Paid 900-\n12-3456150.00',
  'Paid 900-12-3456​150.00', 'Paid 900-12​-3456150.00', 'Paid 9​00-12-3456150.00', 'Paid ٩٠٠-١٢-٣٤٥٦150.00',
  'Paid 900-12-3456١٥٠.٠٠', 'Paid 900-12-34561', 'Paid 900-12-345615', 'Paid 900-12-3456150', 'Paid 900-12-3456,150.00', 'Paid 900-12-3456$150.00',
  'Paid 900-12-3456 150.00', 'Paid 900:12:3456150.00', 'Paid 900,12,3456150.00', 'Paid 900 12-3456150.00', 'Paid 900-12 3456150.00', 'Paid 900\t12\t3456150.00',
  'Paid 900 12 3456150.00', 'Paid 900‐12‐3456150.00', 'Paid 900−12−3456150.00', 'Paid 900-12-3456150.00 for Zephyra',
]);
add('G1ph', [D('5550123'), D('0123150')], [
  'Call 202-555-0123150.00', 'Call (202) 555-0123150.00', 'Call (202)555-0123150.00', 'Call 202 555 0123150.00', 'Call 202.555.0123150.00', 'Call 202/555-0123150.00',
  'Call 555-0123150.00', 'Call 202-555-0123202-555-0124', 'Call (202) 555-0123(202) 555-0124', 'Call 202 555 0123202 555 0124', 'Call +1 202 555 0123150.00', 'Call 1-202-555-0123150.00',
  'Call 2025550123150.00', 'Call 202-555-0123​150.00', 'Fax (202) 555-01234567', 'Phone number 202-555-01234567', 'Tel 202 555-0123150.00', 'Tel 202-555 0123150.00',
]);
add('G1b', ssn, [
  'Paid 150.00900-12-3456', 'Paid 150.00900 12 3456', 'Paid $150.00900 12 3456', 'Paid $150.00900-12-3456', 'Paid 150,00900-12-3456', 'Paid 1,234.56900-12-3456',
  'Paid $1,234900-12-3456', 'at 10:30900-12-3456', 'Paid €150.00900-12-3456', 'Paid 150.00€900-12-3456', 'Paid 150.00 €900-12-3456', 'Paid $900-12-3456',
  'Paid 01/01/2020900-12-3456', 'Paid 01/01/2020900 12 3456', 'Paid 2020-01-01900-12-3456', 'Paid Jan 5, 2020900-12-3456', 'Paid 150900-12-3456', 'Paid 25900-12-3456',
  'Paid 150.00900-12-3456150.00', 'Paid 150.00900.12.3456', 'Paid 150.00900123456', 'Paid $150.00900123456', 'Paid $150900123456', 'Paid $1,234.56900123456',
  'Paid 150.00 900123456', 'Paid 97110900-12-3456', 'Units 4900-12-3456', 'Paid 150.00-900-12-3456', 'Paid 150.00/900-12-3456', 'Paid 150.00(900-12-3456)',
  'Paid $150.00​900-12-3456', 'Paid 150.00​900-12-3456', 'Paid $150.00900-12-\n3456', 'Paid USD150.00900-12-3456', 'Paid $ 150.00900-12-3456', 'Paid $150.900-12-3456',
  'Paid $150.0900-12-3456', 'Paid $.50900-12-3456', 'Paid $0.50900-12-3456', 'Paid £150.00900-12-3456', 'Paid $1,500900-12-3456',
]);
add('G1bph', [D('5550123'), D('2936215'), D('0123')], [
  'Paid $514451/293-6215', 'Paid 150.00202-555-0123', 'Paid $150.00202-555-0123', 'Paid $150.00(202) 555-0123', 'Paid 150.00(202) 555-0123', 'Paid $150.00202 555 0123',
  'Paid 150.00202 555 0123', 'Paid $150.002025550123', 'Paid 150.002025550123', 'Paid $150.00202.555.0123', 'Paid 01/01/2020202-555-0123', 'Paid $150.00 202-555-0123',
  'Paid $150.00555-0123', 'Call $150.00555-0123', 'Paid 150.00+1 202 555 0123', 'Paid $150.001-202-555-0123',
]);
// G6: a number glued to an amount's digits
add('G6', [D('900123456'), D('2025550123')], [
  'Paid 900123456150.00', 'Paid 90012345615.00', 'Paid 9001234561.50', 'Paid 900123456.50', 'Paid 2025550123150.00', 'Paid 900123456150', 'Paid 900123456150,00',
  'Paid 900123456150.000', 'Paid 900123456-150.00', 'Paid 9001234561,234.56', 'Paid 900123456​150.00', 'Paid 900123456150.00.', 'Paid 900123456150.0', 'Paid 900123456150.',
  'Paid 9​00123456150.00', 'Paid 900123456150.00USD', 'Paid 900123456150·00', 'Paid 900123456150:00', 'SSN 900123456150.00', 'ICN 900123456150.00',
  'Paid 150.00900123456150.00', 'Paid 900123456\n150.00',
]);
// G2: a masked SSN glued
add('G2', [D('3456')], [
  'PaidXXX-XX-3456', '2020***-**-3456', 'FaxXXX-XX-3456', 'RxXXX-XX-3456', 'TaxXXX-XX-3456', 'Paid***-**-3456', 'Paidxxx-xx-3456', 'PaidXXXXX3456', 'PaidXXX XX 3456',
  'PaidXXX.XX.3456', 'PaidXXX/XX/3456', 'PaidXXX–XX–3456', 'Paid###-##-3456', 'Paid•••-••-3456', 'PaidXXX-XX-\n3456', 'PaidXXX-​XX-3456',
  '150.00XXX-XX-3456', '$150.00XXX-XX-3456', 'PaidХХХ-ХХ-3456', 'PaidXXX-XX-٣٤٥٦', 'PaidXXX - XX - 3456', 'PaidXXX--XX--3456',
  'PaidXX-XXX-3456', 'Paid.XXX-XX-3456', 'Paid XXX-XX-3456', 'SSN:XXX-XX-3456', 'PaidX-XX-XX-3456', 'Paid*****3456', 'Zephyra***-**-3456', 'Paid​XXX-XX-3456',
  'Paid_XXX-XX-3456', 'Paid#XXX-XX-3456', 'Paid*XXX-XX-3456', 'PaidxXX-XX-3456', 'Pd.XXX-XX-3456', 'PaidXXX-XX-3456th', 'PaidXXX_XX_3456', 'PaidXXX·XX·3456',
]);
// G3: a Social Security label glued to the word before it
add('G3', ssn, [
  'SSN 900.12 3456', 'PatientSSN 900.12 3456', 'PATIENTSSN 900.12 3456', 'patientssn 900.12 3456', 'PatientSocialSecurityNumber 900.12 3456', 'PatientSS# 900.12 3456',
  'PatientSSNo 900.12 3456', 'PatientSS No 900.12 3456', 'PatientSoc Sec 900.12 3456', 'PatientSoc. Sec. No. 900.12 3456', '150.00SSN 900.12 3456', '$150.00SSN 900.12 3456',
  '2020SSN 900.12 3456', 'PatientHICN 900.12 3456', 'PatientSSN\n900.12 3456', 'PatientSSN: 900.12 3456', "Patient'sSSN 900.12 3456", 'PatientЅЅN 900.12 3456',
  'PatientS.S.N. 900.12 3456', 'PatientSSN# 900.12 3456', 'PatientSSN is 900.12 3456', 'InsuredSSNs 900.12 3456', 'PatientSocialSecurity#900.12 3456', 'Patient.SSN 900.12 3456',
  'Patient/SSN 900.12 3456', 'Patient_SSN 900.12 3456', 'Patient-SSN 900.12 3456', 'Patient​SSN 900.12 3456', 'PatientSSN​ 900.12 3456', 'PatientSS​N 900.12 3456',
  'PatientS S N 900.12 3456', 'PatientSSN900.12 3456', 'PatientSocial Sec. # 900.12 3456', 'PatientSoc Security 900.12 3456', 'Patient1SSN 900.12 3456', 'ISSN 900.12 3456',
  'MediSSN 900.12 3456', 'PatientSocial-Security 900.12 3456', 'Social-Security 900.12 3456', 'Social Security No. 900.12 3456', 'PatientSSN (last) 900.12 3456',
  'PatientSS 900.12 3456', 'PatientSSNumber 900.12 3456', 'PatientSSA# 900.12 3456', '(SSN)900.12 3456', 'Jane ZephyraSSN 900.12 3456', 'ASSN 900.12 3456', 'ClaimSSN 900.12 3456',
]);
// G4: a label read through the call's own identifier
add('G4', [D('5550123'), D('5550124'), D('3456'), D('23456')], [
  'SSN for Zephyra: 90012-3456', 'Call Zephyra at 555-0123', 'Phone (Jane Zephyra, home): 555.0123', 'Tel: SYNMEMBER0042 - 9001 23456', 'SSN (Jane Zephyra, patient): 90012-3456',
  'Call Zephyra at 555-0123/555-0124', 'Call Zephyra at 555-0123, 555-0124', 'Call Zephyra at 555-0123 / 555-0124', 'Call Zephyra at 555-0123; 555-0124', 'Call Zephyra at 555-0123 or 555-0124',
  'Call Zephyra: 555-0123 (home), 555-0124 (cell)', 'Call Zephyra at 555-0123x12', 'Call Zephyra at 555–0123', 'Call Zephyra at 555 - 0123', 'Call Zephyra at 555·0123',
  'Call Zephyra at\n555-0123', 'Call\nZephyra at 555-0123', 'Phone: Zephyra, Jane 555-0123', 'Phone Zephyra (DOB 03/14/1980) 555-0123', 'Call Zephyra555-0123', 'Call Zephyra:555-0123',
  'Call SYNMEMBER0042-555-0123', 'Call Zephyra-555-0123', 'Call Zephyra—555-0123', 'Call Zephyra/555-0123', 'Call Zephyra,555-0123', 'Call Zephyra.555-0123', 'Call Zephyra @555-0123',
  'Call Zephyra #555-0123', 'Call Zephyra <555-0123>', 'Call Zephyra [555-0123]', 'Call Zephyra "555-0123"', 'Call Zephyra=555-0123', 'Call Zephyra\t555-0123', 'Call Zephyra at +555-0123',
  'Call Zephyra at 555-0123.', 'Call Zephyra at 555-0123-', 'Call Zephyra at 555-0123 9', 'Call Zephyra at 555-0123 (9)', 'Call Zephyra at 555-0123 option 2', 'Call Zephyra at 1-555-0123',
  'Call Zephyra at 1 555-0123', 'Call Zephyra at 1: 555-0123', 'Call Zephyra at (555) 0123', 'Call Zephyra at 555-0123​', 'Call Zephyra at ​555-0123', 'Call Zephyra at 5​55-0123',
  'Call Zephyra at 555-​0123', 'Call Zephyra at 555​-0123', 'Call Zephyra at 555-0123​9001', 'Call Zephyra at 555-0123​, 900', 'Call Zephyra at 555-0123­/900-12',
  'Call Zephyra at 555-0123⁠-9001', 'Call Zephyra at 900​ 555-0123', 'Call Zephyra at 900,​555-0123', 'Call Zephyra at ٥٥٥-٠١٢٣',
  'Call Zephyra at 555-0123Paid900', 'Call Zephyra at 555-0123th900-12', 'Call Zephyra at 900Paid 555-0123', 'Call Zephyra SYNMEMBER0042 at 555-0123', 'Call Zephyra Zephyra 555-0123',
  'SSN Zephyra 03/14/1980 XXXXX3456', 'SSN Zephyra XXXXX3456', 'Medicare Zephyra 900123456', 'SSN Zephyra 2025550123', 'SSN Zephyra 90012\n3456', 'Call Zephyra at 555-\n0123',
  'Call Zephyra at 555-0123\n900-12', 'Call Zephyra at 900-12\n555-0123', 'Phone 202 Zephyra 555-0123', 'Phone (202) Zephyra 555-0123', 'Phone 202-Zephyra 555-0123',
  'Fax Zephyra 555-0123 Tel 555-0124', 'Zephyra Phone 555-0123', 'Contact Jane Zephyra, ref 555-0123', 'Call Jane Zephyra (case manager) 555-0123', "Call Zephyra's cell 555-0123",
  'Phone Zephyra 5550123', 'Tel Zephyra 555.0123.', 'TEL ZEPHYRA 555 0123', 'Cell Zephyra 555-0123', 'Cell Zephyra – 555-0123', 'Cell Zephyra –555-0123',
  'Call Zephyra at 555-0123 × 9', 'Call Zephyra at 555-0123*9', 'Call Zephyra at 555-0123:9', 'Call Zephyra at 555-0123=9001', 'Call Zephyra at 555-0123+9001', 'Call Zephyra at 9001+555-0123',
  'Call Zephyra at 9001:555-0123', 'Call Zephyra at 9001= 555-0123', 'Call Zephyra at 900\u0003 555-0123', 'Call Zephyra at 900 \u0001555-0123',
]);
// G5: a label's list number
add('G5', local, [
  'Phone 1: 555-0100', 'Tel. 1: 555-0100', 'Ph. 1: 555-0100', 'Phone (1): 555-0100', 'Phone 1 (home): 555-0100', 'Phone 1 - 555-0100', 'Phone 1. 555-0100', 'Phone 1; 555-0100',
  'Phone 1 : 555-0100', 'Phone No 1: 555-0100', 'Phone no. 1: 555-0100', 'Phone #1: 555-0100', 'Phone - 1: 555-0100', 'Phone 1:555-0100', 'Phone 1) 555-0100', 'Phone 1st: 555-0100',
  'Phone 01: 555-0100', 'Phone 100: 555-0100', 'Phone 1/2: 555-0100', 'Phones 1: 555-0100', 'Home phone 1: 555-0100', 'Fax 1: 555-0100', 'Phone 1: 555-0100\nPhone 2: 555-0124',
  'Phone 1: 555-0100 Phone 2: 555-0124', 'Phone 1: 555-0100 2: 555-0124', 'Phone ١: 555-0100', 'Phone1: 555-0100', 'Phone 1 home: 555-0100', 'Phone 1, home: 555-0100',
  'Phone 1 = 555-0100', 'Phone 1 – 555-0100', 'Phone 1—555-0100', 'Phone 1\t555-0100', 'Phone 1  555-0100', 'Phone 1:\n555-0100', 'Phone\n1: 555-0100', 'Phone 1: 555-0100, 2: 555-0124',
  'Phone 1:​555-0100', 'Phone 1​: 555-0100', 'Phone​1: 555-0100', 'Phone 1: 555-0100​900', 'Phone 1: 555-0100​-900', 'Phone 1: 555-0100​, 900',
  'Phone 12: 555-0100', 'Phone 1: 1: 555-0100', 'Tel 1: 2: 555-0100', 'Phone 1: 2 555-0100', 'Phone 1: (555-0100)', 'Phone 1: 555-0100x9001234', 'Phone 1: 555-0100 x 9001234567',
  'Phone 1: 555-0100­9001', 'Phone 1: 555-0100­ 9001', 'Phone A: 555-0100', 'Telephone No. 1) 555-0100', 'Fax No. 2: 555-0100', 'TTY 11) 555 0123', 'Tel 1) 555-0123',
  'Phone 9: 00-12-3456', 'SSN 9: 0012-3456', 'SSN 90: 012-3456', 'SSN 1: 900.12 3456', 'Phone 20: 255-50123', 'Phone 20: 255-5012',
], { leak: [D('5550100'), D('5550123'), D('5550124'), D('3456'), D('2555012')] });
// G7: a pattern's placeholder is a number to what is glued to it
add('G7', [Rw('Zephyra'), Rw('Jane'), Rw('ZEPHYRA')], [
  '900-12-3456thZephyraPaid', 'PaidZephyra900-12-3456', '900-12-3456́thZephyraPaid', '(202) 555-0123Zephyra', '900-12-3456Jane', '900-12-3456​thZephyraPaid',
  '900-12-3456 thZephyraPaid', 'Zephyra​900-12-3456', '900-12-3456ZEPHYRA', '202-555-0123x12Zephyra', '900-12-3456AZephyra', '900-12-3456-AZephyra', '900-12-3456.Zephyra',
  'thZephyra900-12-3456', 'PaidZEPHYRA(202) 555-0123', 'PaidZephyra 900-12-3456', 'Call PaidZephyra at 555-0123', 'Phone 1: 555-0100Zephyra', 'Phone 1: 555-0100thZephyraPaid',
  'XXX-XX-3456thZephyraPaid', 'SSN XXXXX3456thZephyraPaid', '900123456thZephyraPaid', '2025550123thZephyraPaid', '900-12-3456̸thZephyraPaid', '900-12-3456⃝thZephyraPaid',
  '900-12-3456️thZephyraPaid', '900-12-3456͏thZephyraPaid',
]);
// The fold, digit-for-letter forms, name joiners (patient SIMONE VANTREE, member ZZ7654321)
const nm = (raws: string[]) => raws.map((r) => Rw(r));
const fold = (texts: [string, string[]][], P?: any) => { for (const [t, raws] of texts) probes.push({ g: 'FOLD', t, leak: nm(raws), P }); };
fold([
  ['Dear S1MONE VANTR3E,', ['S1MONE', 'VANTR3E']], ['Dear νantree,', ['νantree']], ['Dear νan-tree,', ['νan-tree']], ['Dear νan-\ntree,', ['νan-']],
  ['Dear Simone νantree,', ['νantree']], ['Dear ٧antree,', ['٧antree']], ['Dear ٧ANTREE,', ['٧ANTREE']], ['Dear ۷ANTREE,', ['۷ANTREE']],
  ['Dear VAN-TR3E,', ['VAN-TR3E']], ['Dear Van-\ntr3e,', ['tr3e']], ['Dear VANTR3̃E,', ['VANTR3']], ['Dear S1M̃ONE,', ['S1M']], ['Dear S1M​ONE,', ['S1M']], ['Dear S1M­ONE,', ['S1M']],
  ['Dear SIM0NE,', ['SIM0NE']], ['Dear 51MONE,', ['51MONE']], ['Dear 51M0NE,', ['51M0NE']], ['Dear SIM٥NE,', ['SIM٥NE']], ['Dear SIM۵NE,', ['SIM۵NE']], ['Dear SIM०NE,', ['SIM०NE']],
  ['Dear S١MONE,', ['S١MONE']], ['Dear Simøne,', ['Simøne']], ['Dear ƽimone,', ['ƽimone']], ['Dear ƽim-one,', ['ƽim-one']],
  ['ID ZZ765432l', ['765432l']], ['ID ZZ 765432l', ['765432l']], ['ID ZZ-765432I', ['765432I']], ['ID ZZ 7654321', ['7654321']], ['ID ZZ76543 2l', ['76543 2l']], ['ID ZZ7654321', ['7654321']],
  ['ID ZZ7b54321', ['7b54321']], ['ID 227654321', ['227654321']], ['ID ZZ765432١', ['765432']], ['ID ZZ​765432l', ['765432l']], ['ID ZZ.765432l', ['765432l']], ['ID ZZ/765432l', ['765432l']],
  ['Claim SYNCLAIMOOO1', ['OOO1']], ['Claim SYN-CLAIM-OOO1', ['OOO1']], ['Claim SYNCLAIM 000l', ['000l']], ['Claim SYNCLAIM-OOO1', ['OOO1']], ['Claim SYNCLAIM OOO1', ['OOO1']], ['Claim 5YNCLAIM0001', ['5YNCLAIM']],
  ['Claim SYNCLA1M0001', ['SYNCLA1M']], ['Claim SYNCLA1M 0001', ['SYNCLA1M']], ['Claim SYNC1AIM0001', ['SYNC1AIM']], ['Claim SYNCLAIM000I.', ['000I']], ['Claim SYNCLAIM\n000I', ['000I']],
  ['150.00νantree paid', ['νantree']], ['Seen 2020νANTREE', ['νANTREE']], ['150.00VANTR3E', ['VANTR3E']], ['PaidVANTR3E', ['VANTR3E']], ['PaidVan-tr3e', ['tr3e']],
  ['Dear VАNTREE,', ['NTREE']], ['Dear VANTREÉ,', ['VANTREE']], ['Dear ᴠᴀɴᴛʀᴇᴇ,', ['ᴠᴀ']], ['Dear Vɑntrее,', ['ntr']],
  ['Dear Vantreé,', ['Vantre']], ['Dear Väntree,', ['ntree']], ['Dear Ⓥantree,', ['antree']], ['Dear 𝐕antree,', ['antree']], ['Dear 𝒱antree,', ['antree']],
  ['Dear Ⅴantree,', ['antree']], ['Dear ∨antree,', ['∨antree']], ['Dear \\/antree,', ['antree']], ['Dear Vantr€e,', ['Vantr']], ['Dear Vantrℇe,', ['Vantr']],
  ['Dear Vªntree,', ['ntree']], ['Dear VANTREE‍,', ['VANTREE']], ['Dear V.A.N.T.R.E.E,', ['V.A.N']], ['Dear Sim·one,', ['Sim·one']], ['Dear Sim‧one,', ['Sim‧one']],
  ['Dear Sim•one,', ['Sim•one']], ['Dear Sim・one,', ['Sim・one']], ['Dear Sim∙one,', ['Sim∙one']], ['Dear Sim⋅one,', ['Sim⋅one']], ['Dear Sim.one,', ['Sim.one']],
  ['Dear Sim·one,', ['one']], ['Dear Sim᛫one,', ['Sim᛫one']], ['Dear S1M·ONE,', ['S1M·ONE']], ['Dear S1M-ONE,', ['S1M-ONE']], ["Dear S1M'ONE,", ["S1M'ONE"]],
], P2);
fold([
  ['Dear ZЕРНYRА,', ['YR']], ['Dear ΖΕΡΗΥRΑ,', ['RΑ']], ['Dear ᴢᴇᴘʜʏʀᴀ,', ['ᴢᴇ']], ['Dear Zeph·yra,', ['Zeph']],
  ['Dear Zepħyra,', ['Zepħyra']], ['Dear Ƶephyra,', ['ephyra']], ['Dear Zephyrⱥ,', ['Zephyr']], ['Dear Zɇphyra,', ['phyra']], ['Dear Zeᵽhyra,', ['hyra']], ['Dear Zephɏra,', ['Zeph']],
  ['Dear Zephyɍa,', ['Zephy']], ['Dear 🅉🄴🄿🄷🅈🅁🄰,', ['🅉🄴']], ['Dear 🆉🅴🅿🅷🆈🆁🅰,', ['🆉🅴']],
  ['Dear 🅩🅔🅟🅗🅨🅡🅐,', ['🅩🅔']], ['Dear Z͎e͎p͎h͎y͎r͎a͎,', ['Z͎e']], ['Dear Ẕephyra,', ['ephyra']],
  ['Dear Zephyrä,', ['Zephyr']], ['Dear ßZephyraß and ß Zephyra', ['Zephyra']], ['Dear ŉ Zephyra ﬁ Zephyra', ['Zephyra']], ['Dear İ Zephyra ǰ Zephyra İ', ['Zephyra']],
  ['Dear 𐐀 Zephyra 𐐀', ['Zephyra']], ['Dear \uD800 Zephyra \uDC00', ['Zephyra']], ['Dear Zephyra\uD800', ['Zephyra']], ['Dear \uDC00Zephyra', ['Zephyra']], ['Dear Zeph\uD800yra', ['Zeph']],
  ['SSN 𐒩𐒠𐒠-𐒡𐒢-𐒣𐒤𐒥𐒦 ok', ['𐒣𐒤']], ['SSN 𝟗𝟎𝟎-𝟏𝟐-𝟑𝟒𝟓𝟔 ok', ['3456']],
  ['Member SYNMEMBERO042', ['O042']], ['Member SYNMEMBER O042', ['O042']], ['Member SYNMEMBER-0O42', ['0O42']], ['Member SYNMEMBER٠٠٤٢', ['٤٢']], ['Member SYN MEMBER OO42', ['OO42']],
  ['Member 5YNMEMBER0042', ['5YNMEMBER']], ['Member SYNMEMBER0O42 and SYNCLAIM000l', ['0O42', '000l']], ['Dear Z3PHYRA,', ['Z3PHYRA']], ['Dear ZEPHYR4,', ['ZEPHYR4']], ['Dear Z3PHYRA JANE,', ['Z3PHYRA']],
  ['Dear Z3-PHYRA,', ['Z3-PHYRA']], ['Dear Zephyra’s', ['Zephyra']], ['Dear Z3PHYRA’s', ['Z3PHYRA']], ['Dear Z3PHYRA.', ['Z3PHYRA']], ['Dear Jane Q. Z3PHYRA', ['Z3PHYRA', 'Jane']], ['Dear J. Z3PHYRA', ['Z3PHYRA']],
]);
// Injection: the scan's private marks as text
add('INJ', [D('3456'), D('5550123'), D('900123456')], [
  'SSN \u0003\n900.12 3456', 'SSN\u0003 900.12 3456', 'SSN \u0001 900.12 3456', 'SSN \u0002 900.12 3456', 'SSN \u0004 900.12 3456', 'Phone \u0003\n555-0123', 'Phone:\u0003\n555-0123',
  'Phone \u0003 555-0123', 'Phone \u0001 555-0123', 'Phone \u0004\n555-0123', 'Phone \u0004 555-0123', 'SSN \u0003\nXXXXX3456', 'SSN \u0004\nXXXXX3456', 'SSN \u0003 XXXXX3456',
  '900-12\u0003-3456', '900-12\u0004-3456', '900-12-\u00013456', '900\u000312\u00033456', '9001\u00032345\u00036', 'SSN 90012\u00033456', 'SSN 900\u000112\u00013456', 'SSN 900123\u0003456',
  'Claim \u0001 and 900123456', 'Claim \u0003 and 900123456', 'Claim and 900123456', 'Phone 555\u0003-0123', 'Phone 555-\u00030123', 'SSN (SSN) 900.12 3456', 'SSN [SSN] 900.12 3456',
  '[SSN] 900.12 3456 SSN', 'SSN ［SSN］ 900.12 3456', 'SSN [PATIENT_NAME] 900.12 3456', 'Phone [PATIENT_NAME] 555-0123', 'Phone [CLAIM_1] 555-0123', 'Phone [CLAIM_9] 555-0123',
  'Phone \u0003\u0003\u0003 555-0123 900\u0003-12', 'Call \u0003 at 555-0123, \u0003 900', 'Phone 555-0123 \u0003 900-12-\u00033456', 'Zeph\u0004yra SSN', 'Zeph\u0003yra', 'Zeph\u0001yra', 'Zeph\u0002yra',
  'Jane\u0003Zephyra 900.12 3456 SSN', '150.00\u0002Zephyra', '150.00\u0003Zephyra', 'SSN\u0003:\u0003900.12 3456', 'SSN \u0003\r\n900.12 3456', 'SSN \u0003\n\u0003900.12 3456',
  'SS\u0003N 900.12 3456', 'Pho\u0003ne 555-0123', 'Phone 1\u0003: 555-0100', 'Phone \u00031: 555-0100',
], { leak: [D('3456'), D('5550123'), D('5550100'), D('900123456'), Rw('Zeph\u0004yra'), Rw('Zeph\u0003yra'), Rw('Zeph\u0001yra'), Rw('Zeph\u0002yra'), Rw('Zephyra')] });

const args = process.argv.slice(2);
await runProbes(probes, { all: args.includes('all'), only: args.find((a) => a !== 'all') });
