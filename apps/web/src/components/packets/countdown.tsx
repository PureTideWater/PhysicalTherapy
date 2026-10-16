'use client';

import { useEffect, useState } from 'react';

import { waitText } from '../../lib/packets/approval';

/**
 * The single-user delay's countdown (PRD 12, Approval: "a 24-hour delay and an audit flag"): the time
 * left until the version's writer may approve it alone, ticking each minute. The server rendered the
 * same figure; the database decides when the time has come.
 */
export function Countdown({ until, initialRemainingMs }: { readonly until: string; readonly initialRemainingMs: number }) {
  const [remaining, setRemaining] = useState(initialRemainingMs);
  useEffect(() => {
    const tick = () => {
      setRemaining(Date.parse(until) - Date.now());
    };
    const timer = setInterval(tick, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, [until]);
  return (
    <span className="tabular-nums" data-countdown={until}>
      {remaining > 0 ? waitText(remaining) : 'now (reload the page)'}
    </span>
  );
}
