// Times D15's three forms on the probe tables; prints counts, times and heap only (no identifier is printed).
import pg from '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad/cap3-rev/node_modules/.pnpm/pg@8.23.1/node_modules/pg/lib/index.js';
const c = new pg.Client({ connectionString: process.argv[2] }); await c.connect();
const P = '00000000-0000-4000-8000-0000000000a1';
const COLS = 'p.id, p.check_or_trace, p.posted_on, p.amount_cents';
const t = async (f) => { const s = performance.now(); const r = await f(); return [r, Math.round(performance.now() - s)]; };
const out = { tag: process.argv[3] };
for (let rep = 0; rep < 2; rep++) {
  const [a, ta] = await t(async () => (await c.query(`SELECT ${COLS} FROM posting_row p WHERE p.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id) ORDER BY p.posted_on, p.created_at, p.row_no`, [P])).rows.length);
  global.gc(); const h0 = process.memoryUsage().heapUsed; let peak = h0;
  const [b, tb] = await t(async () => {
    const { rows: matched } = await c.query('SELECT m.posting_row_id AS id FROM ledger_match m WHERE m.practice_id = $1 AND m.posting_row_id IS NOT NULL', [P]);
    const made = new Set(matched.map((r) => r.id)); peak = Math.max(peak, process.memoryUsage().heapUsed);
    const { rows } = await c.query('SELECT r.id FROM posting_row r WHERE r.practice_id = $1', [P]); peak = Math.max(peak, process.memoryUsage().heapUsed);
    const waiting = rows.map((r) => r.id).filter((id) => !made.has(id));
    return (await c.query(`SELECT ${COLS} FROM posting_row p WHERE p.practice_id = $1 AND p.id = ANY ($2::uuid[]) ORDER BY p.posted_on, p.created_at, p.row_no`, [P, waiting])).rows.length;
  });
  const [x, tx] = await t(async () => {
    const { rows } = await c.query('SELECT r.id FROM posting_row r WHERE r.practice_id = $1 EXCEPT SELECT m.posting_row_id FROM ledger_match m WHERE m.practice_id = $1 AND m.posting_row_id IS NOT NULL', [P]);
    return (await c.query(`SELECT ${COLS} FROM posting_row p WHERE p.practice_id = $1 AND p.id = ANY ($2::uuid[]) ORDER BY p.posted_on, p.created_at, p.row_no`, [P, rows.map((r) => r.id)])).rows.length;
  });
  const plan = (await c.query("EXPLAIN SELECT r.id FROM posting_row r WHERE r.practice_id = $1 EXCEPT SELECT m.posting_row_id FROM ledger_match m WHERE m.practice_id = $1 AND m.posting_row_id IS NOT NULL", [P])).rows.map((r) => r['QUERY PLAN'].trim().split(' ')[0] + ' ' + r['QUERY PLAN'].trim().split(' ')[1]).filter((l) => !l.startsWith('Filter') && !l.startsWith('Index Cond')).slice(0, 4).join(' | ');
  const aplan = (await c.query(`EXPLAIN SELECT ${COLS} FROM posting_row p WHERE p.practice_id = $1 AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id) ORDER BY p.posted_on, p.created_at, p.row_no`, [P])).rows.map((r) => r['QUERY PLAN'].trim()).filter((l) => /Join|Loop|Scan/.test(l)).map((l) => l.replace(/\s+\(cost.*$/, '').replace(/^->\s*/, '')).slice(0, 3).join(' | ');
  Object.assign(out, { [`r${rep}`]: { notExists: [a, ta], tsIds: [b, tb, Math.round((peak - h0) / 1048576) + ' MiB'], except: [x, tx] }, exceptPlan: plan, notExistsPlan: aplan });
}
console.log(JSON.stringify(out)); await c.end();
