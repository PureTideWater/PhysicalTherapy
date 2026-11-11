// A keep-noun, a reference noun or the extension's "x" spelled with look-alikes, against its ASCII spelling. node nouns.mts
import { D, runProbes, type Probe } from './lib.mts';
const probes: Probe[] = [];
const leak = [D('900123456'), D('2025550123'), D('3456'), D('5550123'), D('50123'), D('1234567893')];
for (const t of [
  'ICN, 900123456', 'IꮯΝ, 900123456', 'ІСN 900123456', 'Claim 900123456', 'Сlaim 900123456', 'TIN: 900123456', 'TIν: 900123456', 'EIν 900123456', 'tiv 900123456',
  'HICN: TIN, 20255 50123', 'HICN: TIⲚ, 20255 50123', 'Soc Sec # Claim 90012-3456', 'Soc Sec # СlᎪוΜ 90012-3456', 'SSN Check. 90012-3456', 'SSN ꮯʜᴇcК. 90012-3456',
  'Medicare(Check - 2025550123', 'Medicare(ꓚᎻᴇcᛕ - 2025550123', 'Tel 202-555-0123 x 202-555-0123', 'Tel 202-555-0123 Х 202-555-0123', 'Tel 202-555-0123 x 45', 'TTY # NPI 1234567893',
  'TTY # ɴPӏ 1234567893', 'Phone - Group\n90012-3456', 'Phone - ꓖᎡoՍp\n90012-3456', 'Ref: 900123456', 'ꮁҽf: 900123456', 'Reƒ 900123456',
]) probes.push({ g: 'NOUN', t, leak });
await runProbes(probes, { all: true });
