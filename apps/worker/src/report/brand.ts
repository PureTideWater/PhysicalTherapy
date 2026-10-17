import { brandName, markSvg, verifiedDefinition } from '@paidwhole/brand';
import { type ReportReconciliation } from '@tp/ledger';

import { REPORT_FONT_FILES, brandFile } from './brand-files';
import { escapeHtml } from './escape';

/**
 * The PaidWhole report frame every PDF the worker prints is set in (docs/brand/BRAND.md, section 7; the
 * audit report, packets, the ROI statement, the coverage report and the monthly summary): tokens.css and the
 * report stylesheet inlined with the bundled fonts as data URLs, so Chromium fetches nothing; a Paper cover
 * with the outlined lockup top left and, only when the ledger says the report's recovered total reconciles to
 * cash, the seal bottom right with its definition line; white inside pages with the 16 px mark in a running
 * header. A billing firm's white label (milestone 12 builds the flow; this is its slot) leads with the
 * firm's name: PaidWhole then appears only as the Verified badge in the footer, and only when earned.
 *
 * The seal and the badge render only through verifiedSeal and verifiedBadge, which take the ledger's
 * answer (reportReconciliation in @tp/ledger, docs/adr/0055): its `reconciledToCash` is `false` or a `true`
 * only that function returns, so no template can pass a literal.
 */

export interface ReportFrame {
  /** What the document is ("Audit report"): the running header and the <title>. */
  readonly title: string;
  /** The small line above the cover's headline: the kind of document. */
  readonly kicker: string;
  /** The cover's headline. */
  readonly heading: string;
  /** A line under the headline: the period or day the document covers. */
  readonly subheading?: string;
  /** The practice the document is for (escaped here). */
  readonly practiceName: string;
  /** Lines under the headline on the cover, in the mono face: references, periods, who and when (escaped here). */
  readonly meta: readonly string[];
  /** The document's own reference for the running footer (an opaque ID). */
  readonly reference: string;
  /** The Verified gate's answer for this document, from the ledger. */
  readonly reconciliation: Pick<ReportReconciliation, 'reconciledToCash' | 'source'>;
  /** A billing firm's white label: its name leads the cover and the running header. */
  readonly whiteLabel?: { readonly firmName: string } | null;
}

let styles: string | undefined;

/** tokens.css, then the report stylesheet with every font as a data URL (read once). */
export function reportStyles(): string {
  if (styles === undefined) {
    const fonts = new Map(REPORT_FONT_FILES.map((file) => [file, `data:font/woff2;base64,${brandFile(file).toString('base64')}`]));
    const report = brandFile('report.css')
      .toString('utf8')
      .replace(/url\("__FONT_DIR__\/([a-z0-9-]+\.woff2)"\)/g, (_match, file: string) => {
        const url = fonts.get(file);
        if (url === undefined) {
          throw new Error('the report stylesheet names a font the brand does not bundle');
        }
        return `url("${url}")`;
      });
    styles = `${brandFile('tokens.css').toString('utf8')}\n${report}\n${FIGURE_COLUMN_STYLES}`;
  }
  return styles;
}

/**
 * An outlined SVG for inline use: no namespace attribute (inline SVG in HTML needs none, and the reports
 * name no URL), sized to a height in px with the width from its viewBox, and labelled or hidden.
 */
export function inlineSvg(svg: string, height: number, label: string | null): string {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (viewBox === null) {
    throw new Error('a brand SVG has a viewBox');
  }
  const width = (height * Number(viewBox[1])) / Number(viewBox[2]);
  const size = `width="${width.toFixed(2)}" height="${String(height)}"`;
  const accessible = label === null ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${escapeHtml(label)}"`;
  return svg
    .replace(/\s+xmlns(:\w+)?="[^"]*"/g, '')
    .replace(/<svg\b[^>]*?(viewBox="[^"]*")[^>]*>/, (_match, box: string) => `<svg ${box} ${size} ${accessible}>`);
}

function asset(name: 'lockup.svg' | 'seal.svg' | 'badge.svg'): string {
  return brandFile(name).toString('utf8');
}

/** The seal and its definition line, only when the ledger says the report's recovered total reconciles to cash. */
export function verifiedSeal(reconciliation: ReportFrame['reconciliation']): string {
  if (!reconciliation.reconciledToCash) {
    return '';
  }
  return `<figure class="seal" data-verified="seal" data-source="${escapeHtml(reconciliation.source)}">${inlineSvg(asset('seal.svg'), 96, 'Verified by PaidWhole. Reconciled to cash.')}<figcaption class="seal-definition">${escapeHtml(verifiedDefinition)}</figcaption></figure>`;
}

/** The Verified badge for a white-label footer, only when the ledger says the report's recovered total reconciles to cash. */
export function verifiedBadge(reconciliation: ReportFrame['reconciliation']): string {
  if (!reconciliation.reconciledToCash) {
    return '';
  }
  return `<span class="badge" data-verified="badge" data-source="${escapeHtml(reconciliation.source)}">${inlineSvg(asset('badge.svg'), 24, 'Verified by PaidWhole')}</span>`;
}

function cover(frame: ReportFrame): string {
  const lead = frame.whiteLabel ? `<p class="firm">${escapeHtml(frame.whiteLabel.firmName)}</p>` : `<div class="lockup">${inlineSvg(asset('lockup.svg'), 28, brandName)}</div>`;
  // A white label shows PaidWhole only as the footer's badge: no seal on its cover.
  const seal = frame.whiteLabel ? '' : verifiedSeal(frame.reconciliation);
  const meta = frame.meta.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return `<section class="cover" aria-label="Cover"><div class="cover-top">${lead}</div><div class="cover-main"><p class="kicker">${escapeHtml(frame.kicker)}</p><h1>${escapeHtml(frame.heading)}</h1>${frame.subheading === undefined ? '' : `<p class="subheading">${escapeHtml(frame.subheading)}</p>`}<p class="practice">${escapeHtml(frame.practiceName)}</p><div class="meta">${meta}</div></div><div class="cover-foot">${seal}</div></section>`;
}

function runningHeader(frame: ReportFrame): string {
  // The 16 px mark beside the name it stands for: decorative.
  const mark = frame.whiteLabel ? '' : inlineSvg(markSvg({ size: 16 }), 16, null);
  const name = frame.whiteLabel ? escapeHtml(frame.whiteLabel.firmName) : brandName;
  return `<div class="page-header"><span class="brand">${mark}<span class="title">${name} · ${escapeHtml(frame.title)}</span></span><span class="practice">${escapeHtml(frame.practiceName)}</span></div>`;
}

function runningFooter(frame: ReportFrame): string {
  const left = frame.whiteLabel ? `<span class="firm">${escapeHtml(frame.whiteLabel.firmName)}</span>` : `<span class="reference">${escapeHtml(frame.reference)}</span>`;
  const right = frame.whiteLabel ? verifiedBadge(frame.reconciliation) : '';
  return `<div class="running-footer">${left}${right}</div>`;
}

/**
 * The whole document: the brand's styles, then the template's own (tokens only), the cover, and the body
 * in the inside pages under the running header and above the running footer.
 */
export function brandedDocument(frame: ReportFrame, templateStyles: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(frame.title)} | ${brandName}</title><style>${reportStyles()}
${templateStyles}</style></head>
<body>
${cover(frame)}
<table class="pages" role="presentation"><thead><tr><td>${runningHeader(frame)}</td></tr></thead><tfoot><tr><td>${runningFooter(frame)}</td></tr></tfoot><tbody><tr><td>
${body}
</td></tr></tbody></table>
</body></html>`;
}

/**
 * Per-column figure styling for tables whose cells carry no class (docs/brand/BRAND.md, section 5: every
 * dollar figure, code, unit count and rate in the mono face with tabular numerals): `data-code` names the
 * columns (1-based) of codes and references, `data-date` those of dates, kept on one line, and
 * `data-amount` those of amounts and counts, kept on one line and right aligned with their headers.
 */
export const FIGURE_COLUMN_STYLES = Array.from({ length: 14 }, (_, index) => {
  const column = String(index + 1);
  const cells = (attribute: string, header: boolean) => `table[${attribute}~="${column}"] td:nth-child(${column})${header ? `, table[${attribute}~="${column}"] th:nth-child(${column})` : ''}`;
  return [
    `${cells('data-code', false)}, ${cells('data-date', false)}, ${cells('data-amount', false)} { font-family: var(--pw-font-mono); font-variant-numeric: tabular-nums; }`,
    `${cells('data-date', false)}, ${cells('data-amount', false)} { white-space: nowrap; }`,
    `${cells('data-amount', true)} { text-align: right; }`,
  ].join('\n');
}).join('\n');

export interface FigureColumns {
  readonly code?: readonly number[];
  readonly date?: readonly number[];
  readonly amount?: readonly number[];
}

/** A table's figure columns (1-based) as its data-code, data-date and data-amount attributes. */
export function figureColumns(columns: FigureColumns): string {
  const attribute = (name: string, list: readonly number[] | undefined) => (list === undefined || list.length === 0 ? '' : ` ${name}="${list.map(String).join(' ')}"`);
  return `${attribute('data-code', columns.code)}${attribute('data-date', columns.date)}${attribute('data-amount', columns.amount)}`;
}
