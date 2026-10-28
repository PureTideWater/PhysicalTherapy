import type { PracticeCipher } from '@tp/db/runtime';
import { type InterestAdjustment, type InterestAttribution, type InterestDraw, type InterestRemittance, attributeInterest, referenceCandidates } from '@tp/ledger';
import { type Cents, negateCents, parseCents } from '@tp/money';

import type { Scope } from './ledger';

/**
 * Whom each PLB L6 is for, read from one moment's rows (docs/adr/0084; designs/ledger-interest-once.md D2, D3, D13 and
 * D17), and the chain walk the reconciliation screen groups claims by. A chain is a claim with its reversals and
 * corrections as the loader links them; it is named by its root, found by walking back: a reversal to the claim it
 * reverses (claim_by_reversed's link), a correction to the claim that names it in superseded_by_claim_id
 * (claim_by_superseded). The arithmetic is @tp/ledger attributeInterest's; this file only reads.
 *
 * The reconcile runs at READ COMMITTED and a load takes no ledger lock, so a remittance can commit between two
 * statements. Statement 1 (adjustmentMoment) reads the practice's loaded remittances, S, with the walk's provider
 * adjustment rows; every later read keeps only claims of S and follows only links between two claims of S. A remittance
 * commits whole and never changes status, and every link the loader makes later has one end outside S, so the
 * attribution is exactly statement 1's moment. No reference, token, hash or amount is logged.
 */

/** A provider adjustment the reconcile walks: a PLB WO naming a claim, or a PLB L6 that moves an amount. */
export interface AdjustmentRow {
  readonly id: string;
  readonly remittance_id: string;
  /** PLB03-2; an L6's may be null. */
  readonly reference: string | null;
  readonly amount_cents: string;
  readonly paid_on: string;
  readonly position: number;
  readonly category: 'recoupment' | 'interest';
}

/** Statement 1's moment: the practice's loaded remittances (S), each with its payer, and the walk's rows in its order. */
export interface AdjustmentMoment {
  /** Each loaded remittance's payer_id, by remittance. */
  readonly remittances: ReadonlyMap<string, string>;
  /** The PLB WO rows with a reference and the PLB L6 rows of a nonzero amount, by payment date, load and position (D13). */
  readonly adjustments: readonly AdjustmentRow[];
}

interface MomentRow {
  readonly remittance_id: string;
  readonly payer_id: string;
  readonly paid_on: string;
  readonly id: string | null;
  readonly reference: string | null;
  readonly amount_cents: string | null;
  readonly position: number | null;
  readonly category: 'recoupment' | 'interest' | null;
}

/** Statement 1 (D17): one query, so one snapshot, of S and the walk's provider adjustment rows. */
export async function adjustmentMoment(scope: Scope, practiceId: string): Promise<AdjustmentMoment> {
  const { rows } = await scope.client.query<MomentRow>(
    `WITH s AS MATERIALIZED (SELECT r.id, r.payer_id, r.bpr16_date FROM remittance r WHERE r.practice_id = $1 AND r.status = 'loaded')
     SELECT s.id AS remittance_id, s.payer_id::text AS payer_id, s.bpr16_date::text AS paid_on, a.id, a.reference, a.amount_cents::text AS amount_cents, a.position, a.category
       FROM s LEFT JOIN provider_adjustment a ON a.remittance_id = s.id AND a.practice_id = $1
            AND ((a.category = 'recoupment' AND a.reference IS NOT NULL) OR (a.category = 'interest' AND a.amount_cents <> 0))
      ORDER BY s.bpr16_date, a.created_at, a.position`,
    [practiceId],
  );
  const remittances = new Map(rows.map((row) => [row.remittance_id, row.payer_id]));
  const adjustments = rows.flatMap((row): AdjustmentRow[] =>
    row.id === null || row.amount_cents === null || row.position === null || row.category === null
      ? []
      : [{ id: row.id, remittance_id: row.remittance_id, reference: row.reference, amount_cents: row.amount_cents, paid_on: row.paid_on, position: row.position, category: row.category }],
  );
  return { remittances, adjustments };
}

/**
 * The walk back to each claim's root, as CTEs over `wanted (id)`: $1 is the practice, and $2 the remittances a link may
 * reach (null: every remittance of the practice). A loop, which the loader's links never make, ends where it would
 * repeat; of several roots the farthest, then the lowest ID, is taken.
 */
const WALK_BACK = `
  up (start, id, path) AS (
    SELECT w.id, w.id, ARRAY[w.id] FROM wanted w
    UNION ALL
    SELECT u.start, p.id, u.path || p.id
      FROM up u
      CROSS JOIN LATERAL (
        SELECT x.reversal_of_claim_id AS id FROM claim x WHERE x.id = u.id AND x.reversal_of_claim_id IS NOT NULL
        UNION ALL
        SELECT k.id FROM claim k WHERE k.superseded_by_claim_id = u.id AND NOT EXISTS (SELECT 1 FROM claim x WHERE x.id = u.id AND x.reversal_of_claim_id IS NOT NULL)
      ) step
      JOIN claim p ON p.id = step.id
     WHERE p.practice_id = $1 AND ($2::uuid[] IS NULL OR p.remittance_id = ANY ($2::uuid[])) AND p.id <> ALL (u.path)),
  roots AS (SELECT DISTINCT ON (start) start, id AS root FROM up ORDER BY start, cardinality(path) DESC, id)`;

/** chainRoots' statement: $1 the practice, $2 null (every remittance), $3 the claims. */
export const CHAIN_ROOTS = `WITH RECURSIVE wanted AS (SELECT c.id FROM claim c WHERE c.practice_id = $1 AND c.id = ANY ($3::uuid[])), ${WALK_BACK}
     SELECT start, root FROM roots`;

/** Each claim's chain, named by its root claim: the claims given, walked back over every link of the practice's claims. */
export async function chainRoots(scope: Scope, practiceId: string, claimIds: readonly string[]): Promise<Map<string, string>> {
  if (claimIds.length === 0) {
    return new Map();
  }
  const { rows } = await scope.client.query<{ start: string; root: string }>(CHAIN_ROOTS, [practiceId, null, [...new Set(claimIds)]]);
  return new Map(rows.map((row) => [row.start, row.root]));
}

/** What the reconcile's interest path reads of one moment: the attribution, each PLB L6's draws, and the claims' chains. */
export interface InterestReading {
  readonly attribution: InterestAttribution;
  /** Each PLB L6's draws, by PLB L6, in attributeInterest's order. */
  readonly draws: ReadonlyMap<string, readonly InterestDraw[]>;
  /** The chain (root) of every claim read: those of the remittances holding a PLB L6, those the references reach, and those interest matches name. */
  readonly chainOf: ReadonlyMap<string, string>;
}

const CLAIM_COLUMNS = 'c.id, c.remittance_id, coalesce(c.interest_cents, 0)::text AS interest_cents, c.payer_claim_control_number_hash AS hash, r.payer_id::text AS payer_id';

/**
 * interestAttribution's statement: $1 the practice, $2 the moment's remittances (S), $3 those holding a PLB L6, $4 the
 * reference candidates' hashes. Every claim of $3, every claim of S a hash reaches and every claim an interest match
 * names, each with its root walked within S.
 */
export const ATTRIBUTION_CLAIMS = `WITH RECURSIVE wanted AS (
       SELECT ${CLAIM_COLUMNS} FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE c.practice_id = $1 AND c.remittance_id = ANY ($3::uuid[]) AND c.remittance_id = ANY ($2::uuid[])
       UNION
       SELECT ${CLAIM_COLUMNS} FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE c.practice_id = $1 AND c.payer_claim_control_number_hash = ANY ($4::text[]) AND c.remittance_id = ANY ($2::uuid[])
       UNION
       SELECT ${CLAIM_COLUMNS} FROM claim c JOIN remittance r ON r.id = c.remittance_id
        WHERE c.practice_id = $1 AND c.remittance_id = ANY ($2::uuid[])
          AND c.id IN (SELECT m.claim_id FROM ledger_match m WHERE m.practice_id = $1 AND m.kind = 'interest' AND m.claim_id IS NOT NULL)), ${WALK_BACK}
     SELECT w.id, w.remittance_id, w.interest_cents, w.hash, w.payer_id, roots.root FROM wanted w JOIN roots ON roots.start = w.id ORDER BY w.remittance_id, w.id`;

interface ClaimRow {
  readonly id: string;
  readonly remittance_id: string;
  readonly interest_cents: string;
  readonly hash: string;
  readonly payer_id: string;
  readonly root: string;
}

/**
 * Whom each PLB L6 of the moment is for (D2 to D4, D17), in one statement after statement 1: every claim of each
 * remittance in S holding a PLB L6, the claims of S whose control number a PLB L6's reference candidates hash to
 * (@tp/ledger referenceCandidates; the whole reference first, then its identifiers), and the claims the practice's
 * interest matches name, each with its chain root walked within S. A reference names a chain only when the claims of
 * the PLB L6's own payer it reaches are of exactly one chain. It takes statement 1's result as its argument, so a test
 * can hand it an earlier moment.
 */
export async function interestAttribution(scope: Scope, cipher: PracticeCipher, practiceId: string, moment: AdjustmentMoment): Promise<InterestReading> {
  const l6s = moment.adjustments.filter((row) => row.category === 'interest');
  if (l6s.length === 0) {
    return { attribution: { draws: [], unattributed: [] }, draws: new Map(), chainOf: new Map() };
  }
  const candidates = new Map(
    l6s.map((row) => {
      const [whole = null, ...tokens] = referenceCandidates(row.reference).map((text) => cipher.lookupHash('claim.payer_claim_control_number', text));
      return [row.id, { whole, tokens }] as const;
    }),
  );
  const holding = [...new Set(l6s.map((row) => row.remittance_id))];
  const hashes = [...new Set([...candidates.values()].flatMap(({ whole, tokens }) => (whole === null ? tokens : [whole, ...tokens])))];
  const { rows } = await scope.client.query<ClaimRow>(ATTRIBUTION_CLAIMS, [practiceId, [...moment.remittances.keys()], holding, hashes]);
  const chainOf = new Map(rows.map((row) => [row.id, row.root]));
  const remittances: InterestRemittance[] = holding.map((id) => ({
    id,
    claims: rows.filter((row) => row.remittance_id === id).map((row) => ({ id: row.id, chain: row.root, interestCents: parseCents(row.interest_cents) })),
  }));
  const adjustments: InterestAdjustment[] = l6s.map((row) => {
    const { whole, tokens } = candidates.get(row.id) as { readonly whole: string | null; readonly tokens: readonly string[] };
    const payer = moment.remittances.get(row.remittance_id);
    const ofPayer = (wanted: readonly string[]) => rows.filter((claim) => claim.payer_id === payer && wanted.includes(claim.hash));
    const byWhole = whole === null ? [] : ofPayer([whole]);
    const reached = byWhole.length > 0 ? byWhole : ofPayer(tokens);
    const chains = [...new Set(reached.map((claim) => claim.root))];
    const namedChain = chains.length === 1 ? (chains[0] as string) : null;
    return {
      id: row.id,
      remittanceId: row.remittance_id,
      position: row.position,
      cashCents: negateCents(parseCents(row.amount_cents)),
      namedChain,
      namedClaimIds: namedChain === null ? [] : [...new Set(reached.map((claim) => claim.id))],
    };
  });
  const attribution = attributeInterest({ remittances, adjustments });
  const draws = new Map<string, InterestDraw[]>();
  for (const draw of attribution.draws) {
    draws.set(draw.adjustmentId, [...(draws.get(draw.adjustmentId) ?? []), draw]);
  }
  return { attribution, draws, chainOf };
}

/** One remittance in which a chain a case line is matched to reports interest (AMT I) netting to other than zero. */
export interface ReportedInterest {
  readonly serviceLineId: string;
  /** The chain's root claim. */
  readonly chain: string;
  readonly remittanceId: string;
  /** TRN02, the payer's name and BPR16, as the remittance holds them. */
  readonly trace: string;
  readonly payerName: string;
  readonly paidOn: string;
  /** The chain's claims' AMT I in the remittance, netted (a reversal and its correction cancel); never zero. */
  readonly netCents: Cents;
}

/**
 * The interest each case line's chains report in AMT I, by remittance (designs/ledger-interest-once.md 6.3): for each
 * chain the line has a standing claim match to (or its own claim's), each loaded remittance in which that chain's claims
 * report AMT I netting to other than zero, from stored rows. Claims are grouped by the reconcile's own walk (chainRoots),
 * so the screen and the reconcile group claims alike. Shown as reported; counted nowhere (docs/adr/0084).
 */
export async function reportedInterest(scope: Scope, practiceId: string, serviceLineIds: readonly string[]): Promise<ReportedInterest[]> {
  if (serviceLineIds.length === 0) {
    return [];
  }
  const { rows: lineClaims } = await scope.client.query<{ service_line_id: string; claim_id: string }>(
    `SELECT l.id AS service_line_id, l.claim_id FROM service_line l WHERE l.practice_id = $1 AND l.id = ANY ($2::uuid[])
     UNION
     SELECT m.service_line_id, m.claim_id FROM ledger_match m WHERE m.practice_id = $1 AND m.kind = 'claim' AND m.reversed_at IS NULL AND m.service_line_id = ANY ($2::uuid[])`,
    [practiceId, [...new Set(serviceLineIds)]],
  );
  const lineRoots = await chainRoots(scope, practiceId, lineClaims.map((row) => row.claim_id));
  const roots = [...new Set(lineRoots.values())];
  // Every claim reachable forward from the roots, with its AMT I; then kept only where its own walk back ends at that root.
  const { rows: members } = await scope.client.query<{ id: string; remittance_id: string; interest_cents: string }>(
    `WITH RECURSIVE down (id) AS (
       SELECT unnest($2::uuid[])
       UNION
       SELECT n.id FROM down d JOIN claim x ON x.id = d.id
         CROSS JOIN LATERAL (SELECT v.id FROM claim v WHERE v.reversal_of_claim_id = x.id UNION ALL SELECT x.superseded_by_claim_id WHERE x.superseded_by_claim_id IS NOT NULL) n)
     SELECT c.id, c.remittance_id, coalesce(c.interest_cents, 0)::text AS interest_cents
       FROM down JOIN claim c ON c.id = down.id JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND r.status = 'loaded'`,
    [practiceId, roots],
  );
  const memberRoots = await chainRoots(scope, practiceId, members.map((row) => row.id));
  const net = new Map<string, bigint>();
  for (const member of members) {
    const key = `${memberRoots.get(member.id) ?? member.id}|${member.remittance_id}`;
    net.set(key, (net.get(key) ?? 0n) + parseCents(member.interest_cents));
  }
  const reporting = [...net].filter(([, cents]) => cents !== 0n).map(([key, cents]) => ({ chain: key.split('|')[0] as string, remittanceId: key.split('|')[1] as string, cents }));
  if (reporting.length === 0) {
    return [];
  }
  const { rows: remittances } = await scope.client.query<{ id: string; trace: string; payer_name: string; paid_on: string }>(
    'SELECT r.id, r.trn02 AS trace, r.payer_name, r.bpr16_date::text AS paid_on FROM remittance r WHERE r.practice_id = $1 AND r.id = ANY ($2::uuid[]) ORDER BY r.bpr16_date, r.created_at, r.id',
    [practiceId, [...new Set(reporting.map((row) => row.remittanceId))]],
  );
  const result: ReportedInterest[] = [];
  for (const serviceLineId of [...new Set(serviceLineIds)]) {
    const chains = new Set(lineClaims.filter((row) => row.service_line_id === serviceLineId).map((row) => lineRoots.get(row.claim_id) ?? row.claim_id));
    for (const remittance of remittances) {
      for (const row of reporting.filter((item) => item.remittanceId === remittance.id && chains.has(item.chain)).sort((a, b) => (a.chain < b.chain ? -1 : 1))) {
        result.push({ serviceLineId, chain: row.chain, remittanceId: remittance.id, trace: remittance.trace, payerName: remittance.payer_name, paidOn: remittance.paid_on, netCents: parseCents(row.cents.toString()) });
      }
    }
  }
  return result;
}
