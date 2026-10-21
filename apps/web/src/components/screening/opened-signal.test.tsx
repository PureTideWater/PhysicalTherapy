import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPENED_AFTER_VISIBLE_MS, OPENED_INTERACTIONS, type WatchedDocument, sendOpened, watchFirstOpen } from '../../lib/screening/opened';
import { ScreeningOpenedSignal } from './opened-signal';

/**
 * SCR-13, opened by a person (audit #57; the founder's rulings of 2026-10-20; docs/adr/0062): the result page sends its
 * signal once, only after the page has been visible two seconds in all and the visitor has used it (each of the
 * events, focusin included, which counts screen-reader users who move focus without a key or pointer event), and then
 * stops listening. Nothing is sent on load. SYNTHETIC values; fake timers.
 */

class FakeDocument extends EventTarget implements WatchedDocument {
  visibilityState = 'visible';
  readonly listening = new Map<string, number>();

  override addEventListener(type: string, listener: () => void, options?: { readonly capture?: boolean; readonly passive?: boolean }): void {
    this.listening.set(type, (this.listening.get(type) ?? 0) + 1);
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: () => void, options?: { readonly capture?: boolean }): void {
    this.listening.set(type, (this.listening.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener, options);
  }

  setVisible(visible: boolean): void {
    this.visibilityState = visible ? 'visible' : 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  use(type: string = 'pointerdown'): void {
    this.dispatchEvent(new Event(type));
  }

  listeners(): number {
    return [...this.listening.values()].reduce((sum, count) => sum + count, 0);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function watch(document: FakeDocument) {
  const send = vi.fn();
  const stop = watchFirstOpen({ document, send });
  return { send, stop };
}

describe('the opened signal', () => {
  it('sends nothing on load, nor after two seconds with no interaction', () => {
    const document = new FakeDocument();
    const { send } = watch(document);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS * 10);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends once a person has used the page and it has been visible two seconds, in either order, and never twice', () => {
    const early = new FakeDocument();
    const first = watch(early);
    early.use('keydown');
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS - 1);
    expect(first.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first.send).toHaveBeenCalledTimes(1);
    early.use('keydown');
    early.use('scroll');
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS * 5);
    expect(first.send).toHaveBeenCalledTimes(1);
    // It stops listening once it has sent.
    expect(early.listeners()).toBe(0);

    const late = new FakeDocument();
    const second = watch(late);
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS + 500);
    expect(second.send).not.toHaveBeenCalled();
    late.use('pointerdown');
    expect(second.send).toHaveBeenCalledTimes(1);
  });

  it('counts each interaction, focusin among them', () => {
    expect(OPENED_INTERACTIONS).toEqual(['pointerdown', 'keydown', 'focusin', 'wheel', 'scroll', 'touchstart']);
    for (const type of OPENED_INTERACTIONS) {
      const document = new FakeDocument();
      const { send } = watch(document);
      vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS);
      document.use(type);
      expect(send, type).toHaveBeenCalledTimes(1);
    }
  });

  it('counts only visible time: a page opened in the background, or hidden part way, waits for two visible seconds in all', () => {
    const background = new FakeDocument();
    background.visibilityState = 'hidden';
    const hidden = watch(background);
    background.use('focusin');
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS * 3);
    expect(hidden.send).not.toHaveBeenCalled();
    background.setVisible(true);
    vi.advanceTimersByTime(1500);
    background.setVisible(false);
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS * 3);
    expect(hidden.send).not.toHaveBeenCalled();
    background.setVisible(true);
    vi.advanceTimersByTime(499);
    expect(hidden.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hidden.send).toHaveBeenCalledTimes(1);
  });

  it('stops when the page goes, sending nothing', () => {
    const document = new FakeDocument();
    const { send, stop } = watch(document);
    document.use();
    stop();
    vi.advanceTimersByTime(OPENED_AFTER_VISIBLE_MS * 2);
    expect(send).not.toHaveBeenCalled();
    expect(document.listeners()).toBe(0);
  });

  it('posts the link’s token alone, kept alive past a closing page, and ignores the answer', async () => {
    const post = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')));
    sendOpened('abcdefghijklmnopqrstuvwxyzabcdef', post);
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);
    const [path, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/screening/opened');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, body: JSON.stringify({ resultId: 'abcdefghijklmnopqrstuvwxyzabcdef' }) });
  });

  it('renders nothing on the server', () => {
    expect(renderToStaticMarkup(<ScreeningOpenedSignal resultId="abcdefghijklmnopqrstuvwxyzabcdef" />)).toBe('');
  });
});
