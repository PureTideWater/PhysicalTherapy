/**
 * When a person, not a mail scanner, has opened a screening's result (audit #57; the founder's rulings of 2026-10-20;
 * docs/adr/0062): the page has been visible for two seconds in all, and the visitor has done something on it (a
 * pointer press, a key, focus moving into it, a wheel or touch, or a scroll; focusin counts screen-reader users who
 * move focus without a key or pointer event). Then the result page sends one signal (POST /api/screening/opened) and
 * stops listening. Nothing is stored in the browser, and no cookie is read or set; the page's GET records nothing.
 */

/** How long the page must have been visible, in all, before the signal can go. */
export const OPENED_AFTER_VISIBLE_MS = 2000;

/** The events that count as a person using the page. */
export const OPENED_INTERACTIONS = ['pointerdown', 'keydown', 'focusin', 'wheel', 'scroll', 'touchstart'] as const;

/** The document as the watch reads it: whether it is visible, and its events. */
export interface WatchedDocument {
  readonly visibilityState: string;
  addEventListener(type: string, listener: () => void, options?: { readonly capture?: boolean; readonly passive?: boolean }): void;
  removeEventListener(type: string, listener: () => void, options?: { readonly capture?: boolean }): void;
}

export interface OpenedWatch {
  readonly document: WatchedDocument;
  /** Sends the signal; called at most once. */
  readonly send: () => void;
  readonly visibleMs?: number;
  readonly now?: () => number;
}

/** Watches for the first open by a person; returns the function that stops watching (the page unmounting). */
export function watchFirstOpen({ document, send, visibleMs = OPENED_AFTER_VISIBLE_MS, now = () => Date.now() }: OpenedWatch): () => void {
  let visibleFor = 0;
  let visibleSince: number | null = document.visibilityState === 'visible' ? now() : null;
  let interacted = false;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const elapsed = () => visibleFor + (visibleSince === null ? 0 : now() - visibleSince);
  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const stop = () => {
    clear();
    document.removeEventListener('visibilitychange', onVisibility);
    for (const type of OPENED_INTERACTIONS) {
      document.removeEventListener(type, onInteraction, { capture: true });
    }
  };
  const check = () => {
    if (!done && interacted && elapsed() >= visibleMs) {
      done = true;
      stop();
      send();
    }
  };
  // While visible, wake when the visible time would reach its mark.
  const schedule = () => {
    clear();
    if (done || visibleSince === null) {
      return;
    }
    timer = setTimeout(
      () => {
        timer = undefined;
        check();
        if (!done && elapsed() < visibleMs) {
          schedule();
        }
      },
      Math.max(0, visibleMs - elapsed()),
    );
  };
  function onVisibility() {
    if (document.visibilityState === 'visible') {
      visibleSince ??= now();
    } else if (visibleSince !== null) {
      visibleFor += now() - visibleSince;
      visibleSince = null;
    }
    schedule();
  }
  function onInteraction() {
    interacted = true;
    check();
  }

  document.addEventListener('visibilitychange', onVisibility);
  for (const type of OPENED_INTERACTIONS) {
    document.addEventListener(type, onInteraction, { capture: true, passive: true });
  }
  schedule();
  return stop;
}

/** The signal itself: one POST of the link's token, kept alive past a page that is closing; its answer is ignored. */
export function sendOpened(resultId: string, post: typeof fetch): void {
  void post('/api/screening/opened', {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resultId }),
  }).catch(() => undefined);
}
