'use client';

import type { PacketContent } from '@tp/packets';
import { checkReading, narrativeFacts } from '@tp/packets/check';
import { Badge, Label } from '@tp/ui';
import { useEffect, useMemo, useState } from 'react';

import { liveCheckSummary } from '../../lib/packets/view';
import { MismatchList } from './mismatch-list';

/** How long the typing pauses before the live check's summary is announced (a polite status, once it settles). */
export const ANNOUNCE_AFTER_MS = 1000;

/**
 * The packet builder's narrative editor (PRD 7, Packet builder: "narrative editor with verifier results"): the person
 * writes the pattern statement with the version's identifier placeholders and its numbered sources, and the verifier's
 * own check (@tp/packets/check, the code the server runs when the version is written) runs against the version's content
 * on every keystroke, listing each mismatch beside the words it is about and, for a figure, what its words give it and
 * what the records hold it as ("read as a count of claims; the records hold it as the dispute window’s days"). This is
 * advice while typing: saving writes a new version, whose stored result the server computes again and which alone
 * decides whether it can be approved.
 *
 * One reading per keystroke (the review of 2026-11-01, PE-9): the version's facts are built once for its content, and
 * each change of the text is read once, for both the check and the figures. The status line a screen reader hears
 * carries the summary only, and only once the typing pauses for ANNOUNCE_AFTER_MS and the summary has changed; the
 * list and the counts are on the page, not announced on each keystroke (the UX review of 2026-10-28).
 */
export function NarrativeEditor({ name, initial, content, maxLength }: { readonly name: string; readonly initial: string; readonly content: PacketContent; readonly maxLength: number }) {
  const [text, setText] = useState(initial);
  const facts = useMemo(() => narrativeFacts(content), [content]);
  const { check, figures } = useMemo(() => checkReading(text, facts), [text, facts]);
  const summary = liveCheckSummary(check.passed, check.mismatches.length);
  // What the status line says: the summary once the typing has paused, so a screen reader hears it once, when it settles.
  const [announced, setAnnounced] = useState(summary);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnounced(summary);
    }, ANNOUNCE_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text, summary]);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="narrative">Narrative</Label>
      <textarea
        id="narrative"
        name={name}
        value={text}
        maxLength={maxLength}
        rows={10}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className="w-full rounded-md border bg-background p-2 font-mono text-sm"
        aria-describedby="narrative-check-summary"
      />
      <div id="narrative-check" className="flex flex-col gap-1 text-sm" data-live-check={check.passed ? 'passes' : 'fails'}>
        <p id="narrative-check-summary" className="flex flex-wrap items-center gap-2">
          <Badge variant={check.passed ? 'default' : 'destructive'}>
            {check.passed ? (
              summary
            ) : (
              <>
                Live check: <span className="font-mono tabular-nums">{check.mismatches.length}</span> {check.mismatches.length === 1 ? 'mismatch' : 'mismatches'}
              </>
            )}
          </Badge>
          <span className="text-muted-foreground">
            <span className="font-mono tabular-nums">{check.sentences}</span> {check.sentences === 1 ? 'sentence' : 'sentences'}, <span className="font-mono tabular-nums">{check.checked}</span>{' '}
            {check.checked === 1 ? 'figure, placeholder or citation' : 'figures, placeholders and citations'} checked against this version’s records.
          </span>
        </p>
        <p role="status" aria-live="polite" className="sr-only" data-live-announced>
          {announced}.
        </p>
        {check.mismatches.length === 0 ? null : <MismatchList narrative={text} mismatches={check.mismatches} figures={figures.filter((figure) => !figure.passed)} label="Live mismatches" />}
      </div>
    </div>
  );
}
