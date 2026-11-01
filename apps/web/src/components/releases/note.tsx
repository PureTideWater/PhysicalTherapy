import { keyText } from '../../lib/pricing/causes';
import type { ReleaseNote } from '../../lib/releases/queries';
import { utc } from '../format';
import { ScrollBox, ScrollTable } from '../scroll-table';

/**
 * A rule release's note (PRD 9, The release pipeline step 5; PRD 7, Internal console, Rule releases):
 * what it changes against the release before it, by record type and record by record (the first
 * RECORD_CHANGES_SHOWN), and the RELEASE.md it was published with. Rule content only; never PHI.
 */

export function ReleaseStatusText({ note }: { readonly note: Pick<ReleaseNote, 'releaseNo' | 'inForce' | 'withdrawal' | 'publishedAt'> }) {
  if (note.withdrawal !== null) {
    return (
      <span data-state="withdrawn">
        Withdrawn {utc(note.withdrawal.withdrawnAt)} ({note.withdrawal.reason}); release {note.withdrawal.reinstatedReleaseNo} is in force in its place.
      </span>
    );
  }
  return note.inForce ? <span data-state="in-force">In force: runs created now pin it.</span> : <span data-state="earlier">Published {utc(note.publishedAt)}; a later release is in force.</span>;
}

export function ReleaseChanges({ note }: { readonly note: ReleaseNote }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {note.previous === null ? 'The first release: every record is new.' : `Against release ${String(note.previous)}: ${String(note.recordChangesTotal)} record(s) differ.`}
      </p>
      {note.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No record differs.</p>
      ) : (
        <ScrollTable label="Changes by record type">
          <table className="w-full min-w-[32rem] text-left text-sm" aria-label="Changes by record type">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Record type</th>
                <th className="py-1 pr-3 text-right font-medium">Added</th>
                <th className="py-1 pr-3 text-right font-medium">Removed</th>
                <th className="py-1 text-right font-medium">Changed</th>
              </tr>
            </thead>
            <tbody>
              {note.changes.map((change) => (
                <tr key={change.recordType} className="border-t" data-record-type={change.recordType}>
                  <td className="py-1 pr-3 font-mono text-xs">{change.recordType}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{change.added}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{change.removed}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{change.changed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      {note.recordChanges.length === 0 || note.previous === null ? null : (
        <ScrollTable label="Records that differ">
          <table className="w-full min-w-[36rem] text-left text-sm" aria-label="Records that differ">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Record</th>
                <th className="py-1 pr-3 font-medium">From</th>
                <th className="py-1 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {note.recordChanges.map((change) => (
                <tr key={`${change.recordType}:${keyText(change.key)}:${change.effectiveFrom}`} className="border-t align-top" data-kind={change.kind}>
                  <td className="py-1 pr-3">
                    <span className="block min-w-32 wrap-anywhere">
                      <span className="font-mono text-xs">{change.recordType}</span> {keyText(change.key)}
                    </span>
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">{change.effectiveFrom}</td>
                  <td className="py-1">
                    {change.kind === 'changed' ? (
                      <ul className="flex flex-col gap-0.5">
                        {change.fields.map((field) => (
                          <li key={field.field}>
                            <span className="font-mono text-xs">{field.field}</span>: {field.before ?? 'none'} to {field.after ?? 'none'}
                          </li>
                        ))}
                      </ul>
                    ) : change.kind === 'added' ? (
                      'Added'
                    ) : (
                      'Removed'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      {note.recordChangesTotal > note.recordChanges.length && note.previous !== null ? (
        <p className="text-xs text-muted-foreground">The first {note.recordChanges.length} of {note.recordChangesTotal} are listed.</p>
      ) : null}
      {note.notes === '' ? null : (
        <details>
          <summary className="cursor-pointer text-sm underline">The release&apos;s notes (RELEASE.md)</summary>
          <div className="mt-2">
            <ScrollBox label={`Release notes of release ${String(note.releaseNo)}`}>{note.notes}</ScrollBox>
          </div>
        </details>
      )}
    </div>
  );
}
