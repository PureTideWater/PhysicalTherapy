import { utc } from '../format';
import { type TimelineEvent, eventActor, eventText } from '../../lib/cases/timeline';

/** A case's timeline, oldest first: each step in fixed words with when and who (PRD 7, Cases: "timeline"). */
export function CaseTimeline({ events }: { readonly events: readonly TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-1 text-sm" aria-label="Case timeline">
      {events.map((event, index) => (
        <li key={`${event.at}:${event.kind}:${String(index)}`} data-event={event.kind}>
          <span className="tabular-nums text-muted-foreground">{utc(event.at)}</span>: {eventText(event)} <span className="text-muted-foreground">({eventActor(event)})</span>
        </li>
      ))}
    </ol>
  );
}
