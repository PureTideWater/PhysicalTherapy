// Batch 4: a letter the fold reads as a digit (Cyrillic Ze, Be) between a label and its number, or glued to a number.
import { D, runProbes, type Probe } from './lib.mts';
const probes: Probe[] = [];
const leak = [D('5550123'), D('3456'), D('0123'), D('900123456'), D('5550100')];
for (const t of [
  'Phone (Зоя): 555-0123', 'Call Зинаида at 555-0123', 'Call Борис at 555-0123', 'SSN (Зоя) XXXXX3456',
  'Phone (Зоя): (202) 555-0123', 'Тел. (202) 555-0123без выходных', 'Tel (202) 555-0123без', '900-12-3456зб', 'SSN 900-12-3456зб',
  'Phone 202-555-0123з', 'Fax: 202-555-0123б', 'Phone: Зоя 555-0123', 'Contact брат at 555-0123', 'Phone (моб.): 555-0123', 'Call из 555-0123',
  'Звоните 1-800-555-0100 (телетайп: 711).', 'Call З 555-0123', 'Phone Ʒ 555-0123', 'Phone: Zoe 555-0123', 'Phone (Zoya): 555-0123',
  'SSN Зоя 1234567893', 'Medicare (Зоя)\n555-0123', 'Phone 1: Зоя 555-0100', 'Phone за 555-0123', 'TTY без 555-0123', 'SSN з XXXXX3456',
  'Звоните: 555-0123', 'Phone 555-0123 за', 'Phone 555-0123б', 'Phone (З) 555-0123', 'Claim Зоя 900123456', 'XXX-XX-3456з', 'SSN XXX-XX-3456з',
]) probes.push({ g: 'L2D', t, leak });
await runProbes(probes, { all: true });
