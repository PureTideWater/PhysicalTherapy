import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { type CopyRule, copyExemptions, copyFiles, copyViolations, isScreeningFile, scanSource, sentences } from './scan';

/**
 * The product-copy lint (Change Order 001, CO-11): each forbidden term fails in each place copy stands (a
 * string, a template, JSX text, an HTML template), codes and comments are not read, docs and tests are not
 * read, screening has its own words, and the repository's copy passes with no exemption.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');

/** The rules one fixture file breaks, in order. */
const rules = (file: string, text: string): CopyRule[] => scanSource(file, text).map((finding) => finding.rule);

const PAGE = 'apps/web/src/app/p/[practiceId]/example/page.tsx';
const TEMPLATE = 'apps/worker/src/report/example.ts';
const SCREENING = 'apps/web/src/app/screening/page.tsx';

describe('the copy lint: forbidden terms (CO-11)', () => {
  it.each([
    ['ProofPack', "export const title = 'Download the ProofPack';"],
    ['proof pack, any case', "export const title = 'Your PROOF PACK is ready';"],
    ['proof-pack', 'export const title = `The proof-pack for ${name}`;'],
    ['AI', "export const note = 'Checked by AI before you sign';"],
    ['AI in a compound', "export const note = 'AI-assisted review';"],
    ['A.I.', "export const note = 'No A.I. reads your contracts';"],
    ['intelligence', "export const note = 'Payment intelligence for therapy groups';"],
    ['Intelligence, capitalised', "export const note = 'Contract Intelligence';"],
    ['independent verification platform', "export const note = 'The independent verification platform for practices';"],
  ])('fails on %s in a string', (_name, text) => {
    expect(rules('apps/web/src/lib/example.ts', text)).toHaveLength(1);
  });

  it('names each rule', () => {
    expect(rules(PAGE, "const a = 'The ProofPack'; const b = 'By AI'; const c = 'Payment intelligence'; const d = 'an independent verification platform';")).toEqual(['proof-pack', 'ai', 'intelligence', 'verification-platform']);
  });

  it('reads a string that is one lowercase token as a code, never copy (decision D10)', () => {
    expect(rules(PAGE, "const feature = 'intelligence'; const stage = 'recovered'; const key = 'proof-pack';")).toEqual([]);
  });

  it('reads JSX text, attributes that hold words, and a JSX text run across inline elements', () => {
    expect(rules(PAGE, 'export const A = () => <p>Your <strong>ProofPack</strong> is ready.</p>;')).toEqual(['proof-pack']);
    expect(rules(PAGE, 'export const A = () => <Card aria-label="AI findings" />;')).toEqual(['ai']);
    expect(rules(PAGE, 'export const A = () => <Figure title="Contract intelligence" />;')).toEqual(['intelligence']);
    expect(rules(PAGE, "export const A = () => <img alt={'ProofPack cover'} />;")).toEqual(['proof-pack']);
  });

  it('reads an HTML template sentence by sentence', () => {
    expect(rules(TEMPLATE, 'export const html = `<section><h2>Cases</h2><p>Built by AI.</p></section>`;')).toEqual(['ai']);
  });

  it('leaves words that only contain the letters alone', () => {
    expect(rules(PAGE, "const a = 'MAINTAIN the PAID amounts'; const b = 'API keys'; const c = 'Said in plain words'; const d = 'An independent review'; const e = 'Proof of posting';")).toEqual([]);
  });
});

describe('the copy lint: recovered is labelled posted or deposited (CO-11)', () => {
  it.each([
    ['a bare label', "export const label = 'Recovered';"],
    ['a sentence', "export const note = 'Payer approved and recovered amounts come from the ledger.';"],
    ['a template whose proof level is only a value', 'export const label = `Recovered principal, net (${level})`;'],
    ['JSX text', 'export const A = () => <p>No cash was recovered in the period.</p>;'],
    ['an attribute', 'export const A = () => <Figure empty="No cash was recovered." />;'],
    ['an HTML template', 'export const html = `<footer>Recovered is only ever the ledger’s.</footer>`;'],
  ])('fails on %s', (_name, text) => {
    expect(rules(text.includes('<') && !text.includes('`') ? PAGE : TEMPLATE, text)).toEqual(['recovered-unlabelled']);
  });

  it('passes recovered beside posted or deposited in the same sentence', () => {
    const text = [
      "const a = 'Recovered (posted)';",
      "const b = 'Recovered (posted or deposited)';",
      "const c = 'Recovered principal, net (deposited)';",
      "const d = 'Payer approved and recovered (posted or deposited) amounts come from the ledger.';",
      "const e = 'Cash deposited against the remittance is recovered.';",
    ].join('\n');
    expect(rules(TEMPLATE, text)).toEqual([]);
  });

  it('reads the label as one across inline elements, and a block element ends it', () => {
    expect(rules(PAGE, 'export const A = () => <p><Link href="/r">Recovered</Link> (posted): <Money value={v} /></p>;')).toEqual([]);
    expect(rules(PAGE, 'export const A = () => <div><dt>Recovered</dt><dd>posted, net</dd></div>;')).toEqual(['recovered-unlabelled']);
  });

  it('reads each sentence on its own: posted in the next sentence does not label it', () => {
    expect(rules(PAGE, "export const note = 'Recovered moves back with it. The posting is offset.';")).toEqual(['recovered-unlabelled']);
    expect(rules(PAGE, "export const note = 'Recovered moves back with it. Nothing posted stays.';")).toEqual(['recovered-unlabelled']);
    expect(sentences('Recovered is cash. It posted.\nNext line')).toEqual(['Recovered is cash.', 'It posted.', 'Next line']);
  });

  it('reads a JSX text’s line breaks as spaces, as React renders them', () => {
    expect(rules(PAGE, 'export const A = () => (\n  <p>\n    Payer approved and recovered amounts come from the ledger,\n    posted or deposited.\n  </p>\n);')).toEqual([]);
  });

  it('points at the sentence’s own line in a long template', () => {
    const findings = scanSource(TEMPLATE, 'export const html = `<p>First.</p>\n<p>Second.</p>\n<footer>Recovered is the ledger’s.</footer>`;');
    expect(findings.map((finding) => [finding.line, finding.text])).toEqual([[3, 'Recovered is the ledger’s.']]);
  });
});

describe('the copy lint: codes and comments are not copy (decision D10)', () => {
  it('reads no code: a stage value, a key, a type, an attribute that holds a code, a module path, SQL, a comment', () => {
    const text = [
      "import { recovered } from './proof-pack/recovered';",
      "type Stage = 'flagged' | 'recovered';",
      "const STAGES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const;",
      "const TONES = { recovered: 'whole', 'payer_approved': 'neutral' };",
      "const label = LABELS['recovered'];",
      "if (stage === 'recovered') { count += 1; }",
      "const columns = ['recovered_cents', 'stage-recovered', '#stage-recovered'];",
      "const sql = `SELECT count(*) FILTER (WHERE stage = 'recovered') AS recovered FROM line_status WHERE practice_id = $1`;",
      'const fragment = `AND s.stage = \'recovered\'`;',
      '// Recovered, ProofPack, AI and intelligence in a comment are not copy.',
      '/* Recovered alone */',
      'export const A = () => <a className="recovered intelligence" id="recovered" data-figure="recovered" href="#recovered" aria-hidden="true" key="AI">{/* Recovered */}{STAGE_LABELS.recovered}</a>;',
    ].join('\n');
    expect(scanSource(PAGE, text)).toEqual([]);
  });
});

describe('the copy lint: screening (CO-11; decision D11)', () => {
  it('knows a screening file by its directory', () => {
    expect(isScreeningFile('apps/web/src/app/screening/page.tsx')).toBe(true);
    expect(isScreeningFile('apps/web/src/components/screening/result.tsx')).toBe(true);
    expect(isScreeningFile('apps/web/src/app/p/[practiceId]/page.tsx')).toBe(false);
    expect(isScreeningFile('apps/web/src/lib/screenings.ts')).toBe(false);
  });

  it('fails on owed, underpaid and recovered, labelled or not, and on the tagline', () => {
    expect(rules(SCREENING, "const a = 'What you are owed';")).toEqual(['screening-owed']);
    expect(rules(SCREENING, "const a = 'Lines underpaid by your payer';")).toEqual(['screening-underpaid']);
    expect(rules(SCREENING, "const a = 'Under-paid lines';")).toEqual(['screening-underpaid']);
    expect(rules(SCREENING, "const a = 'Recovered (posted)';")).toEqual(['screening-recovered']);
    expect(rules(SCREENING, 'export const A = () => <PaidWholeLockup size={28} tagline />;')).toEqual(['screening-tagline']);
    expect(rules(SCREENING, "import { tagline as words } from '@paidwhole/brand/tokens';")).toEqual(['screening-tagline']);
    expect(rules(SCREENING, "import { BRAND_TAGLINE } from '../../lib/brand';\nexport const t = BRAND_TAGLINE;")).toEqual(['screening-tagline', 'screening-tagline']);
  });

  it('allows the same lockup without its tagline, and words that are not those', () => {
    expect(rules(SCREENING, "export const A = () => <><PaidWholeLockup size={28} /><p>Lines priced below the public rate, by payer.</p></>;")).toEqual([]);
  });

  it('applies the screening words only to screening files', () => {
    expect(rules(PAGE, "const a = 'What you are owed, and underpaid lines'; export const A = () => <PaidWholeLockup tagline />;")).toEqual([]);
  });
});

describe('the copy lint: the brand’s words come from the tokens', () => {
  it('fails on a typed-out copy of the brand’s words, in any case', () => {
    expect(rules(PAGE, "const a = 'Contract-verified payment for therapy groups';")).toEqual(['brand-words-literal']);
    expect(rules(PAGE, 'export const A = () => <span>Verified by PaidWhole</span>;')).toEqual(['brand-words-literal']);
    expect(rules(PAGE, "const a = 'PaidWhole is independent of the EMR and the payer.';")).toEqual(['brand-words-literal']);
    expect(rules(PAGE, "const a = 'RECONCILED TO CASH';")).toEqual(['brand-words-literal']);
  });

  it('passes the words read from the tokens', () => {
    expect(rules(PAGE, "import { badgeText, descriptor } from '@paidwhole/brand/tokens';\nexport const A = () => <p>{descriptor}. {badgeText}</p>;")).toEqual([]);
  });
});

describe('the copy lint: reviewed exemptions', () => {
  it('skips a string under an exemption with its reason, on its line or the line above', () => {
    expect(rules(PAGE, "// brand-copy-exempt: the payer's own term, quoted from its letter\nconst quoted = 'Recovered';")).toEqual([]);
    expect(rules(PAGE, "const quoted = 'Recovered'; // brand-copy-exempt: the payer's own term, quoted from its letter")).toEqual([]);
    expect(rules(PAGE, "export const A = () => (\n  <p>\n    {/* brand-copy-exempt: the payer's own term, quoted from its letter */}\n    Recovered\n  </p>\n);")).toEqual([]);
  });

  it('fails an exemption without a reason, and one that covers nothing', () => {
    expect(rules(PAGE, "// brand-copy-exempt:\nconst quoted = 'Recovered';")).toEqual(['exemption-without-reason', 'recovered-unlabelled']);
    expect(rules(PAGE, "// brand-copy-exempt: it is fine\nconst quoted = 'Recovered';")).toEqual(['exemption-without-reason', 'recovered-unlabelled']);
    expect(rules(PAGE, "// brand-copy-exempt: once a term from the payer's letter\nconst words = 'Recovered (posted)';")).toEqual(['exemption-unused']);
  });
});

describe('the copy lint: what it reads', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'brand-copy-'));
  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    writeFileSync(path.join(fixture, file), text);
  };

  it('reads the web app’s source and the report templates, never docs, tests, test support or other code', () => {
    const forbidden = "export const words = 'The ProofPack, by AI';\n";
    write('apps/web/src/app/page.tsx', forbidden);
    write('apps/worker/src/report/html.ts', forbidden);
    write('apps/worker/src/reconcile/statement-html.ts', forbidden);
    write('docs/product/PRD.md', 'The ProofPack specification. AI. Recovered.\n');
    write('docs/notes.ts', forbidden);
    write('apps/web/src/app/page.test.tsx', forbidden);
    write('apps/web/src/lib/routes/test-support/world.ts', forbidden);
    write('apps/web/e2e/journey.spec.ts', forbidden);
    write('apps/web/src/types.d.ts', forbidden);
    write('apps/worker/src/reconcile/ledger.ts', forbidden);
    write('packages/triage/src/headline.ts', forbidden);
    expect(copyFiles(fixture)).toEqual(['apps/web/src/app/page.tsx', 'apps/worker/src/reconcile/statement-html.ts', 'apps/worker/src/report/html.ts']);
    expect(copyViolations(fixture).map((finding) => `${finding.file} ${finding.rule}`)).toEqual([
      'apps/web/src/app/page.tsx proof-pack',
      'apps/web/src/app/page.tsx ai',
      'apps/worker/src/reconcile/statement-html.ts proof-pack',
      'apps/worker/src/reconcile/statement-html.ts ai',
      'apps/worker/src/report/html.ts proof-pack',
      'apps/worker/src/report/html.ts ai',
    ]);
  });

  it('reads the real tree: the web app, every report template, the ROI statement and the packet', () => {
    const files = copyFiles(ROOT);
    expect(files).toContain('apps/web/src/app/layout.tsx');
    expect(files).toContain('apps/web/src/components/reconciliation/display.tsx');
    expect(files).toContain('apps/worker/src/report/html.ts');
    expect(files).toContain('apps/worker/src/report/documents.ts');
    expect(files).toContain('apps/worker/src/reconcile/statement-html.ts');
    expect(files).toContain('apps/worker/src/packets/html.ts');
    expect(files.some((file) => /\.(test|spec)\.tsx?$/.test(file) || file.includes('/test-support/'))).toBe(false);
  }, 60_000);

  it('finds the product copy clean, with no exemption standing', () => {
    expect(copyViolations(ROOT)).toEqual([]);
    expect(copyExemptions(ROOT)).toEqual([]);
  }, 60_000);
});
