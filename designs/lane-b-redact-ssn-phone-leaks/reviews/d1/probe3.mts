// D1 review probes, third round: an initial beside a name only the head reads (settled, not fresh), and what the
// placeholder it leaves does to the reading that decides whether fresh matches are applied. node probe3.mts
import { pathToFileURL } from 'node:url';
import { XA } from './gen2.mts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const [PA, CA] = [XA.P, XA.C];
const out = (R: any, t: string) => { try { const s = R.redactLetterForScreen(t, PA, CA).text as string; return { r: R.holdsIdentifier(s, PA, CA) as boolean, s }; } catch (e) { return { r: false, s: `THREW ${String(e).slice(0, 80)}` }; } };
const tag = (o: { r: boolean }) => (o.r ? 'R' : 'S');
const V = ['EFT # and J. Z3ph··yra, S. Vant•ree AE 09012-3456:900-12-34567th', 'EFT # and J. Z3ph··yra, S. Vant•ree', 'S. Vant•ree', 'J. Z3ph··yra', 'Vant•ree', 'Z3ph··yra', 'J. Z3ph··yra, S. Vant•ree', 'J. Z3ph··yra, Vant•ree', 'AE 09012-3456:900-12-34567th', 'EFT # and J. Zephyra, S. Vantree AE 09012-3456:900-12-34567th', 'Phone J Zeph•yra 900 12 34, 56', 'SSN: J. Zeph•yra 900,12 3456', 'Tel J. Zeph•yra 20 25 55 01 23, 45'];
for (const t of V) { const [b, h] = [out(B, t), out(H, t)]; console.log(`V B${tag(b)} H${tag(h)} ${JSON.stringify(t)} b=${JSON.stringify(b.s).slice(0, 100)} h=${JSON.stringify(h.s).slice(0, 100)}`); }
const XS = ['Z e p h y r a', 'Zephy ra', 'Zephy. ra', 'Zeph yra', 'ZEPH YRA', 'Ze phyra', 'Zephyr a', 'Jane Zeph yra', 'J Zephy ra', 'Zephy\nra', 'PaidZephyra', 'Zephyra2020', 'Zephyrax', 'aZephyra', '1Zephyra', 'Zeph.yra', 'Zeph/yra', 'Zeph,yra', 'Zeph:yra', 'Zeph yra, Jane', 'Z.e.p.h.y.r.a', 'Zep hy ra', 'Zephyra-', 'J.Zephyra', 'JZephyra', 'ZephyraJ', 'Q Zephyra', 'J. Q.', 'Jane Q', 'J Z', 'Sim one', 'Simo. ne', 'S imone',
  'SYNMEMBER 00 42', 'SYN MEMBER0042', 'SYNMEMBER0042x', 'xSYNMEMBER0042', 'SYNMEMBER.0042', 'SYNMEMBER/0042', '0042 SYNMEMBER', 'ZZ 76 54 321', 'ZZ7654321x', 'ZZ7654 321', 'SYNCLAIM-0001-A', 'SYNCLAIM0001.0', '03141980', '14.03.80', '3-14-80x', 'March 14', '1980/3/14', 'born 3/14', '0314 1980', '80-03-14', 'Mar 14 80'];
for (const X of XS) {
  const letters = [X, `${X} cc S. Vant•ree`, `${X} cc Vant•ree`, `${X} cc Vantree`];
  const r = letters.map((t) => [out(B, t), out(H, t)] as const);
  const hole = r[1]![0].r && !r[1]![1].r;
  console.log(`${hole ? 'HOLE ' : ''}${JSON.stringify(X)} alone B${tag(r[0]![0])}H${tag(r[0]![1])} | +S.V• B${tag(r[1]![0])}H${tag(r[1]![1])} | +V• B${tag(r[2]![0])}H${tag(r[2]![1])} | +V B${tag(r[3]![0])}H${tag(r[3]![1])}${hole ? ` h=${JSON.stringify(r[1]![1].s)} b+V=${JSON.stringify(r[3]![0].s)}` : ''}`);
}
