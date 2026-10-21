import { type LineDeadline, type PacketContent, type VerifierReport, interestExclusionText } from '@tp/packets';
import { type DeadlineStatus, MA_DISPUTE_ROUTE_CONFIRMED } from '@tp/triage';
import { Alert, AlertDescription, AlertTitle, Badge } from '@tp/ui';
import Link from 'next/link';
import { Fragment } from 'react';

import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';
import { StatusChip, type StatusTone } from '../status';
import { METHOD_NAMES, ROUNDING_NAMES } from '../../lib/contracts/display';
import { labelOf } from '../../lib/copy/words';
import { DEADLINE_CAUSE_TEXT, DEADLINE_STATUS_TEXT, EVIDENCE_GAP_TEXT, EVIDENCE_KIND_TEXT, MA_ROUTE_NOTICE, SOURCE_KIND_TEXT, mismatchShown, mismatchText } from '../../lib/packets/view';

/**
 * Display pieces of the packet builder (PRD 7, Packet builder; PRD 12, The packet): the citation, the
 * line schedule with each line's trace (identifiers shown as their placeholders: only the export inserts
 * them), the interest line (its own line, never in expected), the evidence list with its gaps, the
 * numbered sources, and the stored verifier result with each mismatch marked in the narrative. Every
 * dollar figure carries its stage label. A tp-packet/2 version also shows each line's deadline with its
 * status as a label (never a color alone), the version's deadline with the evidence it rests on and,
 * when it is not verified, why in words and what to do; and each line's calculation summary.
 */

/**
 * A deadline's status is not a payment status (docs/adr/0056): verified and no window are neutral system states;
 * unverified is an evidence gap that blocks the export, danger text on the danger tint. Never Whole or Short, which
 * say how a line was paid.
 */
const DEADLINE_TONE: Readonly<Record<DeadlineStatus, StatusTone>> = { verified: 'neutral', unverified: 'danger', not_applicable: 'neutral' };

/** A code a trace or a cause names (FIXED_SCHEDULE, contract_adjustment, CONTRACT_WINDOW_UNCITED) as a label, never the code itself. */
const codeLabel = (code: string): string => labelOf(code.toLowerCase());

/** A calculation's method in words: the contract's method, or Medicare Advantage non-contracted. */
function methodName(method: string): string {
  if (method === 'MA_NONCONTRACTED') {
    return 'Medicare Advantage, non-contracted';
  }
  return method in METHOD_NAMES ? METHOD_NAMES[method as keyof typeof METHOD_NAMES] : codeLabel(method);
}

/** A rounding rule in words. */
function roundingName(rule: string): string {
  return rule in ROUNDING_NAMES ? ROUNDING_NAMES[rule as keyof typeof ROUNDING_NAMES] : codeLabel(rule);
}

/** A deadline's status as a labelled chip (the label says it; the tint only repeats it). */
export function DeadlineChip({ status }: { readonly status: DeadlineStatus }) {
  return (
    <StatusChip tone={DEADLINE_TONE[status]} data-deadline-status={status}>
      {DEADLINE_STATUS_TEXT[status]}
    </StatusChip>
  );
}

function LineDeadlineCell({ deadline, windowEndsOn }: { readonly deadline: LineDeadline | undefined; readonly windowEndsOn: string | null }) {
  if (deadline === undefined) {
    return <span className="font-mono tabular-nums whitespace-nowrap">{windowEndsOn ?? '—'}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="font-mono tabular-nums whitespace-nowrap">{deadline.ends_on ?? '—'}</span>
      <DeadlineChip status={deadline.status} />
      {deadline.cause === null ? null : (
        <span className="text-xs" data-deadline-cause={deadline.cause}>
          {codeLabel(deadline.cause)}
        </span>
      )}
    </span>
  );
}

/** A SHA-256, shortened on screen with the whole value as its title (and copyable in the page). */
export function Hash({ value, label }: { readonly value: string | null; readonly label?: string }) {
  if (value === null) {
    return <span>—</span>;
  }
  return (
    <code className="break-all font-mono text-xs" title={value} data-sha256={value} aria-label={label}>
      {value}
    </code>
  );
}

export function Citation({ content }: { readonly content: PacketContent }) {
  const citation = content.citation;
  if (citation.kind === 'regulation') {
    return (
      <div className="flex flex-col gap-1 text-sm" data-citation="regulation">
        <p>
          <span className="font-medium">{citation.reference}</span> (Medicare Advantage, non-contracted)
        </p>
        <p>{citation.statement}</p>
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm" data-citation="contract">
      <dt className="text-muted-foreground">Contract</dt>
      <dd>
        {citation.contract_title}, version {citation.version_no} (in effect {citation.effective_from}
        {citation.effective_to === null ? ' onward' : ` to ${citation.effective_to}`})
      </dd>
      <dt className="text-muted-foreground">Method</dt>
      <dd>{citation.method}</dd>
      <dt className="text-muted-foreground">Document and page</dt>
      <dd>
        Document <span className="font-mono text-xs">{citation.document_id}</span>, page {citation.page}
      </dd>
      <dt className="text-muted-foreground">Quoted clause</dt>
      <dd>
        <blockquote className="border-l-2 pl-2 italic">{citation.quote}</blockquote>
      </dd>
      <dt className="text-muted-foreground">Page SHA-256</dt>
      <dd>
        <Hash value={citation.page_sha256} />
      </dd>
    </dl>
  );
}

/**
 * A placeholder as the schedule shows it, with a place to wrap after each underscore and colon
 * ({{claim_<wbr>control_<wbr>number:<wbr>1}}), so a narrow column breaks it between its words; its text is the
 * placeholder exactly.
 */
function Placeholder({ value }: { readonly value: string }) {
  return (
    <>
      {value.split(/(?<=[_:])/).map((part, index) => (
        <Fragment key={index}>
          {index === 0 ? null : <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The line schedule (PRD 12: claim control numbers, service dates, codes, units, expected, observed and variance,
 * each with its trace reference), in the app's table pattern: each cell's right padding, figures right-aligned under
 * their headers, dates kept whole, and a placeholder wrapping between its words, so at a desktop width the whole
 * schedule fits its card, its window and trace columns in view (the screen tour's L2); a narrower one scrolls
 * inside the card.
 */
export function LineSchedule({ content, practiceId }: { readonly content: PacketContent; readonly practiceId: string }) {
  return (
    <ScrollTable label="Line schedule">
      <table className="w-full text-sm" aria-label="Line schedule">
        <thead>
          <tr className="border-b text-left align-bottom">
            <th className="py-1 pr-3 font-medium">Row</th>
            <th className="py-1 pr-3 font-medium">Claim</th>
            <th className="py-1 pr-3 font-medium">Patient</th>
            <th className="py-1 pr-3 font-medium">Service date</th>
            <th className="py-1 pr-3 font-medium">Code</th>
            <th className="py-1 pr-3 text-right font-medium">Units</th>
            <th className="py-1 pr-3 text-right font-medium">Expected</th>
            <th className="py-1 pr-3 text-right font-medium">Observed</th>
            <th className="py-1 pr-3 text-right font-medium">Variance (Actionable)</th>
            <th className="py-1 pr-3 font-medium">Paid, on</th>
            <th className="py-1 pr-3 font-medium">{content.format === 'tp-packet/2' ? 'Deadline' : 'Window ends'}</th>
            <th className="py-1 font-medium">Trace</th>
          </tr>
        </thead>
        <tbody>
          {content.lines.map((line) => (
            <tr key={line.row} className="border-b align-top last:border-0" data-row={line.row} data-deadline={'deadline' in line ? line.deadline.status : undefined}>
              <td className="py-1 pr-3 font-mono tabular-nums">{line.row}</td>
              <td className="py-1 pr-3 font-mono text-xs" data-placeholder="claim_control_number">
                <Placeholder value={line.claim_control_number} />
              </td>
              <td className="py-1 pr-3 font-mono text-xs" data-placeholder="patient_name">
                <Placeholder value={line.patient_name} />
              </td>
              <td className="py-1 pr-3 font-mono tabular-nums whitespace-nowrap">{line.service_date}</td>
              <td className="py-1 pr-3 font-mono">{[line.procedure_code, ...line.modifiers].join(' ')}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{line.units}</td>
              <td className="py-1 pr-3 text-right">
                <Money value={line.expected_cents} />
              </td>
              <td className="py-1 pr-3 text-right">
                <Money value={line.observed_cents} />
              </td>
              <td className="py-1 pr-3 text-right">
                <Money value={line.variance_cents} />
              </td>
              <td className="py-1 pr-3">
                <Money value={line.paid_cents} />, <span className="whitespace-nowrap">{line.paid_on}</span>
              </td>
              <td className="py-1 pr-3">
                <LineDeadlineCell deadline={'deadline' in line ? line.deadline : undefined} windowEndsOn={line.window_ends_on} />
              </td>
              <td className="py-1 whitespace-nowrap">
                <Link className="underline" href={`/p/${practiceId}/lines/${line.service_line_id}?run=${line.pricing_run_id}`}>
                  Line trace
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

/**
 * The version's deadline (tp-packet/2): the date the dispute is filed by, its status as a label, the
 * evidence it rests on, and, when it is not verified, each cause in words with its next step. A version
 * written before tp-packet/2 states none and is written again.
 */
export function DeadlineSummary({ content, now }: { readonly content: PacketContent; readonly now: DeadlineStatus }) {
  if (content.format !== 'tp-packet/2') {
    return (
      <p className="text-sm" data-deadline-summary="outdated">
        This version was written before packets stated their deadline, so it cannot be exported. Write a new version of the packet: it states each line’s deadline and whether it is verified.
      </p>
    );
  }
  const { deadline } = content;
  return (
    <div className="flex flex-col gap-2 text-sm" data-deadline-summary={deadline.status} data-deadline-now={now}>
      <p className="flex flex-wrap items-center gap-2">
        <span>
          File by <span className="font-mono tabular-nums">{deadline.ends_on ?? '—'}</span> ({deadline.basis === 'next_level_window' ? 'the next dispute level’s window' : 'the earliest of the lines’ windows'}).
        </span>
        <DeadlineChip status={deadline.status} />
        <span className="text-muted-foreground">
          <span className="font-mono tabular-nums">{deadline.lines_verified}</span> of <span className="font-mono tabular-nums">{deadline.lines}</span> {deadline.lines === 1 ? 'line’s window' : 'lines’ windows'} verified.
        </span>
      </p>
      {content.citation.kind === 'regulation' && !MA_DISPUTE_ROUTE_CONFIRMED ? (
        // Best-option audit #5: no Medicare Advantage packet exports until the specialist confirms the route (golden QUESTIONS Q34).
        <Alert variant="destructive" role="note" data-deadline-route="unconfirmed">
          <AlertTitle>Medicare Advantage: not exported yet</AlertTitle>
          <AlertDescription>{MA_ROUTE_NOTICE}</AlertDescription>
        </Alert>
      ) : null}
      {now !== deadline.status ? (
        <p data-deadline-changed="yes">
          Derived again now, the deadline is <DeadlineChip status={now} />: the export is held to that. Write a new version to state it.
        </p>
      ) : null}
      {deadline.causes.length === 0 ? null : (
        <ul className="list-disc pl-5" aria-label="Why the deadline is not verified">
          {deadline.causes.map((cause) => (
            <li key={cause} data-cause={cause}>
              <span className="font-medium">{codeLabel(cause)}</span>: {DEADLINE_CAUSE_TEXT[cause]}
            </li>
          ))}
        </ul>
      )}
      {deadline.sources.length === 0 ? (
        <p className="text-muted-foreground">No evidence of a window is cited.</p>
      ) : (
        <ul className="list-disc pl-5" aria-label="Deadline evidence">
          {deadline.sources.map((source) =>
            source.kind === 'contract_window' ? (
              <li key={`contract:${source.contract_version_id}`} data-source="contract_window">
                Contract window of <span className="font-mono tabular-nums">{source.days ?? '—'}</span> {source.days === 1 ? 'day' : 'days'}, document <span className="font-mono text-xs">{source.document_id}</span>, page{' '}
                <span className="font-mono tabular-nums">{source.page}</span>, {source.verified_at === null ? 'citation not checked against its page' : `citation checked against its page ${source.verified_at.slice(0, 10)}`}:{' '}
                <q className="italic">{source.quote}</q> Page SHA-256 <Hash value={source.hash} />
              </li>
            ) : (
              <li key={`release:${source.sha256}`} data-source="release_record">
                Rule release <span className="font-mono tabular-nums">{source.release_no}</span>, dispute-window record{source.program === null ? '' : ` (${source.program === 'commercial_default' ? 'the commercial default' : codeLabel(source.program)})`} at level{' '}
                <span className="font-mono">{source.level ?? 'unknown'}</span>, SHA-256 <Hash value={source.sha256} />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** Each line's calculation summary (tp-packet/2), as its trace recorded it: never computed again here. */
export function CalculationTable({ content }: { readonly content: PacketContent }) {
  if (content.format !== 'tp-packet/2') {
    return null;
  }
  return (
    <ScrollTable label="Calculations">
      <table className="w-full text-sm" aria-label="Calculations">
        <thead>
          <tr className="border-b text-left align-bottom">
            <th className="py-1 pr-3 font-medium">Row</th>
            <th className="py-1 pr-3 font-medium">Method, release</th>
            <th className="py-1 pr-3 font-medium">Steps</th>
            <th className="py-1 pr-3 font-medium">Rounding</th>
            <th className="py-1 pr-3 text-right font-medium">Patient share (shown, never counted)</th>
            <th className="py-1 font-medium">Trace SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {content.lines.map((line) => (
            <tr key={line.row} className="border-b align-top last:border-0" data-calculation-row={line.row}>
              <td className="py-1 pr-3 font-mono tabular-nums">{line.row}</td>
              <td className="py-1 pr-3">
                {methodName(line.calculation.method)}, release <span className="font-mono tabular-nums">{line.calculation.release_no}</span>
              </td>
              <td className="py-1 pr-3">
                <ul aria-label={`Steps of row ${String(line.row)}`}>
                  {line.calculation.steps.map((step, index) => (
                    <li key={`${step.step}:${String(index)}`}>
                      {codeLabel(step.step)} <span className="font-mono tabular-nums">{step.amount_cents}</span> cents
                    </li>
                  ))}
                </ul>
              </td>
              <td className="py-1 pr-3">
                {line.calculation.rounding === null ? (
                  '—'
                ) : (
                  <>
                    {roundingName(line.calculation.rounding.rule)}: <span className="font-mono tabular-nums">{line.calculation.rounding.unrounded_cents}</span> cents to{' '}
                    <Money value={line.calculation.rounding.rounded_cents} />
                  </>
                )}
              </td>
              <td className="py-1 pr-3 text-right">{line.calculation.patient_share_cents === null ? '—' : <Money value={line.calculation.patient_share_cents} />}</td>
              <td className="py-1">
                <Hash value={line.calculation.trace_sha256} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

export function InterestSection({ content }: { readonly content: PacketContent }) {
  const interest = content.interest;
  if (interest === null) {
    return <p className="text-sm text-muted-foreground">No prompt-pay state named: the packet states no interest.</p>;
  }
  return (
    <div className="flex flex-col gap-2 text-sm" data-interest={interest.computed ? 'computed' : 'not_computed'}>
      <p>
        {interest.state} prompt-pay rule{interest.statute === null ? '' : ` (${interest.statute})`}, rule release {interest.release_no}: {interest.days_to_pay === null ? 'days to pay not stated' : `${String(interest.days_to_pay)} days to pay`},{' '}
        {interest.annual_rate_percent === null ? 'no interest rate stated' : `${interest.annual_rate_percent}% a year`}. Interest is its own line and never part of expected.
      </p>
      {interest.exclusions.length === 0 ? null : (
        // In the payer's copy's own words (@tp/packets interestExclusionText), never the release's codes.
        <p data-interest-exclusions={String(interest.exclusions.length)}>The rule does not apply to: {interest.exclusions.map(interestExclusionText).join(', ')}.</p>
      )}
      <p>
        Interest total: {interest.total_cents === null ? 'not computed' : <Money value={interest.total_cents} />}
        {interest.computed ? '' : ' (some lines could not be computed; see the evidence gaps)'}
      </p>
      <ul className="list-disc pl-5" aria-label="Interest lines">
        {interest.lines.map((line) => (
          <li key={line.row}>
            Row {line.row}: due {line.due_on ?? '—'}, paid {line.paid_on}, {line.days_late === null ? '—' : `${String(line.days_late)} days late`}; interest {line.interest_cents === null ? 'not computed' : <Money value={line.interest_cents} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidenceList({ content }: { readonly content: PacketContent }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ol className="list-decimal pl-5" aria-label="Evidence list">
        {content.evidence.map((item, index) => (
          <li key={`${item.kind}:${item.document_id ?? String(index)}`}>
            {EVIDENCE_KIND_TEXT[item.kind]}: {item.label}
            {item.sha256 === null ? '' : ' '}
            {item.sha256 === null ? null : <Hash value={item.sha256} />}
          </li>
        ))}
      </ol>
      {content.evidence_gaps.length === 0 ? null : (
        <ul className="list-disc pl-5 text-danger" aria-label="Evidence gaps">
          {content.evidence_gaps.map((gap) => (
            <li key={`${gap.code}:${String(gap.row)}`}>
              {gap.row === null ? '' : `Row ${String(gap.row)}: `}
              {EVIDENCE_GAP_TEXT[gap.code]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sources({ content }: { readonly content: PacketContent }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Numbered sources">
      {content.sources.map((source) => (
        <li key={source.marker}>
          <span className="font-mono">[{source.marker}]</span> {SOURCE_KIND_TEXT[source.kind]}
          {source.evidence_index === null ? '' : ` ${String(source.evidence_index + 1)}`}
        </li>
      ))}
    </ul>
  );
}

/** The narrative as stored, each mismatch the server's verifier found marked where it is. */
export function StoredNarrative({ narrative, verifier }: { readonly narrative: string; readonly verifier: VerifierReport }) {
  const spans = verifier.mismatches.filter((mismatch) => mismatch.code !== 'sentence_without_citation' && mismatch.code !== 'empty_narrative');
  const parts: { readonly text: string; readonly marked: boolean }[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) {
      continue;
    }
    parts.push({ text: narrative.slice(at, span.start), marked: false }, { text: narrative.slice(span.start, span.end), marked: true });
    at = span.end;
  }
  parts.push({ text: narrative.slice(at), marked: false });
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm" data-verifier={verifier.passed ? 'passed' : 'failed'}>
        <Badge variant={verifier.passed ? 'default' : 'destructive'}>{verifier.passed ? 'Verifier passed' : 'Verifier failed'}</Badge>
        <span className="text-muted-foreground">
          {verifier.sentences} sentences, {verifier.checked} figures, placeholders and citations checked against the version’s input records.
        </span>
      </p>
      <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-sm" aria-label="Stored narrative">
        {parts.map((part, index) =>
          part.marked ? (
            <mark key={String(index)} className="rounded bg-destructive/20 px-0.5">
              {part.text}
            </mark>
          ) : (
            <span key={String(index)}>{part.text}</span>
          ),
        )}
      </p>
      {verifier.mismatches.length === 0 ? null : (
        <ul className="list-disc pl-5 text-sm" aria-label="Verifier mismatches">
          {verifier.mismatches.map((mismatch) => (
            <li key={`${String(mismatch.start)}:${String(mismatch.end)}:${mismatch.code}`} data-mismatch={mismatch.code}>
              {mismatch.sentence < 0 ? '' : `Sentence ${String(mismatch.sentence + 1)}: `}
              {mismatchText(mismatch.code, mismatch.kind)}
              {(() => {
                const shown = mismatchShown(mismatch.code, narrative.slice(mismatch.start, mismatch.end));
                return shown === null ? null : (
                  <>
                    {' '}
                    <mark className="rounded bg-destructive/20 px-1 font-mono">{shown}</mark>
                  </>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
