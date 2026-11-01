/**
 * PR #83's static screening-result harness (after-only shots of the fix round; synthetic data only).
 *
 * Renders the screening result's own view (ScreeningResultView, at the ref checked out in /home/user/screens) with the
 * head unit test's SYNTHETIC fixtures (apps/web/src/components/screening/result-tables.test.tsx), for the states no live
 * synthetic send can reach:
 *   - several:   SUMMARY (12,345 priced rows; 5 rows PaidWhole could not price), GROUPS on one page (onePage(GROUPS):
 *                two anomalies among five groups), COVERAGE (two could-not-price rows, a rates-change row, no-reason rows)
 *                and ROWS (three top rows);
 *   - one-other: the same, but the database's real one-other shape: FIRST_PAGE (groups 1 to 50) with oneOther(1)
 *                (51 groups, page 1 of 2, the 51st summed as the one other group, an anomaly).
 * The fixtures are read from the unit test's own text at run time (from `const c =` up to `const FORBIDDEN`), so the
 * harness draws exactly what the unit test asserts on, and nothing is invented here.
 *
 * Writes <out>/<name>.html: the view's <main> as the server would render it, for the capture spec to put in place of a
 * live result's <main> (the app's own stylesheets, fonts and header), with no script.
 *
 *   cd /home/user/screens/apps/web && ../../node_modules/.bin/tsx <this file> <out dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const SCREENS = process.env.HARNESS_ROOT ?? '/home/user/screens';
const WEB = `${SCREENS}/apps/web`;
const COMPONENTS = `${WEB}/src/components/screening`;
const out = process.argv[2];
if (out === undefined || out === '') throw new Error('usage: tsx screening-result-harness.mts <out dir>');
mkdirSync(out, { recursive: true });

// The fixtures, as the unit test writes them: its text between `const c =` and `const FORBIDDEN`.
const testText = readFileSync(`${COMPONENTS}/result-tables.test.tsx`, 'utf8');
const from = testText.indexOf('const c = ');
const to = testText.indexOf('const FORBIDDEN');
if (from < 0 || to < from) throw new Error('the unit test no longer holds its fixtures between `const c =` and `const FORBIDDEN`');
const fixtureModule = `${out}/fixtures.generated.tsx`;
writeFileSync(
  fixtureModule,
  [
    `import { type Cents, cents } from '${SCREENS}/packages/money/src/index.ts';`,
    `import type { ScreeningGroup, ScreeningGroupPage, ScreeningOtherGroups, ScreeningRow } from '${COMPONENTS}/anomalies.tsx';`,
    `import type { ScreeningCoverageRow } from '${COMPONENTS}/coverage.tsx';`,
    `import type { ScreeningSummaryData } from '${COMPONENTS}/result-summary.tsx';`,
    '',
    testText.slice(from, to),
    'export { COVERAGE, FIRST_PAGE, GROUPS, PATH, ROWS, SUMMARY, onePage, oneOther };',
    '',
  ].join('\n'),
);

const require = createRequire(`${WEB}/package.json`);
const React = require('react') as typeof import('react');
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
const { ScreeningResultView } = (await import(`${COMPONENTS}/result-view.tsx`)) as typeof import('/home/user/screens/apps/web/src/components/screening/result-view.tsx');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a module written above at run time
const fx = (await import(fixtureModule)) as any;

const convert = (state: unknown): Promise<unknown> => Promise.resolve(state);
const base = {
  resultId: String(fx.PATH).slice(String(fx.PATH).lastIndexOf('/') + 1),
  requested: false,
  converted: false,
  summary: { ...fx.SUMMARY, createdAt: new Date(fx.SUMMARY.createdAt), expiresAt: new Date(fx.SUMMARY.expiresAt) },
  coverage: fx.COVERAGE,
  rows: fx.ROWS,
  arrangements: [{ value: 'in_house', label: 'In-house billing' }],
};
const pages = {
  several: { ...base, groups: fx.GROUPS, groupPage: fx.onePage(fx.GROUPS) },
  'one-other': { ...base, groups: fx.FIRST_PAGE, groupPage: fx.oneOther(1) },
} as const;

const written: Record<string, { bytes: number; groups: number; pageOf: string; others: number }> = {};
for (const [name, data] of Object.entries(pages)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the view's props, from the fixtures above
  const html = renderToStaticMarkup(React.createElement(ScreeningResultView as any, { data, convert }));
  if (!html.startsWith('<main') || !html.includes('data-slot="screening-result"')) throw new Error(`${name}: the view did not render its <main>`);
  writeFileSync(join(out, `${name}.html`), html);
  written[name] = { bytes: html.length, groups: data.groupPage.groups, pageOf: `${String(data.groupPage.page)} of ${String(data.groupPage.pages)}`, others: data.groupPage.others.groups };
}
writeFileSync(join(out, 'harness.json'), JSON.stringify({ ref: SCREENS, fixtures: `${COMPONENTS}/result-tables.test.tsx`, written }, null, 1));
console.log(JSON.stringify(written));
