'use client';

import { useEffect, useState } from 'react';

/** How long the empty region stands before its words arrive, so assistive technology has registered it. */
const SETTLE_MS = 100;

/**
 * The words of a loading state's status region, put in after the region is on the page: a live region
 * inserted with its text already inside is often not announced, so it renders empty first and the label
 * a moment after mount, and the change is what assistive technology reads (docs/adr/0077). A screen that
 * loads sooner than that is replaced before anything is said, which is what it should be.
 */
export function LoadingAnnouncement({ label }: { readonly label: string }) {
  const [said, setSaid] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSaid(true);
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return said ? label : '';
}
