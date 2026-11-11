import { D, Rw, runProbes, type Probe } from './lib.mts';
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-06-14'], memberIds: ['SYNMEMBER0042'] };
const probes: Probe[] = [];
for (const t of ['on June 14, 1980', 'on Jυne 14, 1980', 'DOB Jυne 14, 1980', 'on Јunе 14, 1980', 'on 14 Jυne 1980', 'on Jᴜne 14, 1980', 'on JUNE 14, 1980', 'on JΥNE 14, 1980', 'born Jυn 14 1980', 'Social Secυrity No. 900.12 3456', 'Social Security No. 900.12 3456', 'Social Secᴜrity No. 900.12 3456'])
  probes.push({ g: 'MONTH', t, leak: [D('1980'), D('3456')], P });
await runProbes(probes, { all: true });
