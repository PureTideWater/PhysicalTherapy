'use client';

import type { PacketContent } from '@tp/packets';
import { checkNarrative } from '@tp/packets/check';
import { Badge, Label } from '@tp/ui';
import { useMemo, useState } from 'react';

import { mismatchShown, mismatchText } from '../../lib/packets/view';

/**
 * The packet builder's narrative editor (PRD 7, Packet builder: "narrative editor with verifier
 * results"): the person writes the pattern statement with the version's identifier placeholders and its
 * numbered sources, and the verifier's own check (@tp/packets/check, the code the server runs when the
 * version is written) runs against the version's content on every keystroke, listing each mismatch with
 * the words it is about. This is advice while typing: saving writes a new version, whose stored result
 * the server computes again and which alone decides whether it can be approved.
 */
export function NarrativeEditor({ name, initial, content, maxLength }: { readonly name: string; readonly initial: string; readonly content: PacketContent; readonly maxLength: number }) {
  const [text, setText] = useState(initial);
  const check = useMemo(() => checkNarrative(text, content), [text, content]);
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
        aria-describedby="narrative-check"
      />
      <div id="narrative-check" role="status" aria-live="polite" className="flex flex-col gap-1 text-sm" data-live-check={check.passed ? 'passes' : 'fails'}>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant={check.passed ? 'default' : 'destructive'}>{check.passed ? 'Live check passes' : `Live check: ${String(check.mismatches.length)} ${check.mismatches.length === 1 ? 'mismatch' : 'mismatches'}`}</Badge>
          <span className="text-muted-foreground">
            {check.sentences} {check.sentences === 1 ? 'sentence' : 'sentences'}, {check.checked} figures, placeholders and citations checked against this version’s records.
          </span>
        </p>
        {check.mismatches.length === 0 ? null : (
          <ul className="list-disc pl-5" aria-label="Live mismatches">
            {check.mismatches.map((mismatch) => (
              <li key={`${String(mismatch.start)}:${String(mismatch.end)}:${mismatch.code}`}>
                {mismatch.sentence < 0 ? '' : `Sentence ${String(mismatch.sentence + 1)}: `}
                {mismatchText(mismatch.code, mismatch.kind)}
                {(() => {
                  const shown = mismatchShown(mismatch.code, text.slice(mismatch.start, mismatch.end));
                  return shown === null ? null : (
                    <>
                      {' '}
                      <mark className="rounded bg-destructive/15 px-1 font-mono">{shown}</mark>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
