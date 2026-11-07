// Synthetic only. Initials in orders neither in order nor reversed, in a held frame; fix tree as B.
import { cmp, show } from './lib.mts';
const f = (t: string) => `Paid $0,000.00. Service 01/01/2020-01/02/2020${t} $0,000.00`;
for (const t of ['QJZ', 'JZQ', 'ZJQ', 'ZQ', 'QJ']) console.log(show(f(t), cmp(f(t), { names: ['JANE Q ZEPHYRA'] })));
const seven = 'ANA BEA CORA DINA ELLA FAYE GIA';
for (const t of ['AG', 'GA', 'BF']) console.log(show(f(t), cmp(f(t), { names: [seven] })));
