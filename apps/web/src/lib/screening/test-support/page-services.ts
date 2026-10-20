import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabasePool, LocalKeyProvider } from '@tp/db';
import { createLogger } from '@tp/observability';

import { DevAuthProvider } from '../../auth/dev-provider';
import { MemoryDevStore } from '../../auth/dev-store';
import { Sealer } from '../../auth/seal';
import type { CookieJar, RouteRequest } from '../../http/route';
import { type Services, createServices } from '../../server/services';
import { type JobQueue, MemoryQueue } from '../../uploads/queue';

/**
 * The web app's services as the screening's tests build them (screening-world.ts, and the child process of
 * result-page.large.db.test.ts that renders a result under a fixed heap): the application's pool, a development sign-in
 * provider no screening route uses, a memory queue unless given another, and a logger whose lines go where the caller
 * says. Synthetic data only.
 */

export const SCREENING_ORIGIN = 'http://localhost:3100';

class MemoryJar implements CookieJar {
  private readonly values: Map<string, string>;
  constructor(initial: Readonly<Record<string, string>> = {}) {
    this.values = new Map(Object.entries(initial));
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

export function screeningServices(pool: DatabasePool, options: { readonly queue?: JobQueue; readonly sink?: (line: string) => void } = {}): Services {
  const sealer = new Sealer(randomBytes(32));
  return createServices({
    origin: SCREENING_ORIGIN,
    pool,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: SCREENING_ORIGIN },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: options.sink ?? (() => undefined) }),
    queue: options.queue ?? new MemoryQueue(),
  });
}

export interface PageRequestOptions {
  readonly params?: Record<string, unknown>;
  readonly input?: Record<string, unknown>;
  /** The client's address, as the trusted proxy names it (the per-IP limit), or none. */
  readonly address?: string | null;
  /** The browser's cookies (the attribution cookie, audit #57). */
  readonly cookies?: Readonly<Record<string, string>>;
}

/** A request as the application's own page makes it: same origin, no session. */
export function pageRequest(options: PageRequestOptions = {}): RouteRequest {
  return {
    cookies: new MemoryJar(options.cookies),
    params: options.params ?? {},
    input: options.input,
    requestId: `test-${randomUUID()}`,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0',
    origin: SCREENING_ORIGIN,
    fetchSite: 'same-origin',
    clientAddress: options.address ?? null,
  };
}
