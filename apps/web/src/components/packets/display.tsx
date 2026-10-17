import type { PacketContent, VerifierReport } from '@tp/packets';
import { Badge } from '@tp/ui';
import Link from 'next/link';

import { Money } from '../remittances/display';
import { EVIDENCE_GAP_TEXT, EVIDENCE_KIND_TEXT, SOURCE_KIND_TEXT, mismatchShown, mismatchText } from '../../lib/packets/view';

/**
 * Display pieces of the packet builder (PRD 7, Packet builder; PRD 12, The packet): the citation, the
 * line schedule with each line's trace (identifiers shown as their placeholders: only the export inserts
 * them), the interest line (its own line, never in expected), the evidence list with its gaps, the
 * numbered sources, and the stored verifier result with each mismatch marked in the narrative. Every
 * dollar figure carries its stage label.
 */

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
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm" data-citation="contract">
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

export function LineSchedule({ content, practiceId }: { readonly content: PacketContent; readonly practiceId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Line schedule">
        <thead>
          <tr className="border-b text-left">
            <th className="px-2 py-1 font-medium">Row</th>
            <th className="px-2 py-1 font-medium">Claim</th>
            <th className="px-2 py-1 font-medium">Patient</th>
            <th className="px-2 py-1 font-medium">Service date</th>
            <th className="px-2 py-1 font-medium">Code</th>
            <th className="px-2 py-1 font-medium">Units</th>
            <th className="px-2 py-1 font-medium">Expected</th>
            <th className="px-2 py-1 font-medium">Observed</th>
            <th className="px-2 py-1 font-medium">Variance (Actionable)</th>
            <th className="px-2 py-1 font-medium">Paid, on</th>
            <th className="px-2 py-1 font-medium">Window ends</th>
            <th className="px-2 py-1 font-medium">Trace</th>
          </tr>
        </thead>
        <tbody>
          {content.lines.map((line) => (
            <tr key={line.row} className="border-b last:border-0" data-row={line.row}>
              <td className="px-2 py-1 font-mono tabular-nums">{line.row}</td>
              <td className="px-2 py-1 font-mono text-xs" data-placeholder="claim_control_number">
                {line.claim_control_number}
              </td>
              <td className="px-2 py-1 font-mono text-xs" data-placeholder="patient_name">
                {line.patient_name}
              </td>
              <td className="px-2 py-1 font-mono tabular-nums">{line.service_date}</td>
              <td className="px-2 py-1 font-mono">{[line.procedure_code, ...line.modifiers].join(' ')}</td>
              <td className="px-2 py-1 font-mono tabular-nums">{line.units}</td>
              <td className="px-2 py-1">
                <Money value={line.expected_cents} />
              </td>
              <td className="px-2 py-1">
                <Money value={line.observed_cents} />
              </td>
              <td className="px-2 py-1">
                <Money value={line.variance_cents} />
              </td>
              <td className="px-2 py-1">
                <Money value={line.paid_cents} />, {line.paid_on}
              </td>
              <td className="px-2 py-1 font-mono tabular-nums">{line.window_ends_on ?? '—'}</td>
              <td className="px-2 py-1">
                <Link className="underline" href={`/p/${practiceId}/lines/${line.service_line_id}?run=${line.pricing_run_id}`}>
                  Line trace
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        <ul className="list-disc pl-5 text-status-short" aria-label="Evidence gaps">
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
