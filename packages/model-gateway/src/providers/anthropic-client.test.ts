import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { type Span, type TextMapPropagator, type Tracer, type TracerProvider, propagation, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelRequest } from '../provider';
import { AnthropicProvider, anthropicClient } from './anthropic';

/**
 * The Anthropic client as configuration builds it, with SDK 1.x (test matrix MOD-17, MOD-18; docs/adr/0048, amendment
 * of 2026-11-01): nothing the SDK would take from the environment (its OpenTelemetry tracing and their content, its
 * debug logging, another host) reaches a request. A fake fetch answers a synthetic message in memory, so no request
 * leaves the process; the key is synthetic. Its own file, so the global OpenTelemetry state it registers stays in one
 * Vitest file; every test leaves that state, the environment, the global fetch and the console as it found them.
 */

const KEY = 'sk-synthetic-not-a-key';
const TIMEOUT_MS = 60_000;

/** What the environment asks of the SDK in both cases: tracing with the prompts in the spans, debug logging, another host. */
const ENVIRONMENT = {
  ANTHROPIC_OPEN_TELEMETRY: 'true',
  ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: 'true',
  ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE: 'content',
  ANTHROPIC_LOG: 'debug',
  ANTHROPIC_BASE_URL: 'https://example.invalid',
} as const;

/**
 * Every header a request through the gateway's client may carry: what the SDK sets for a Messages call (its
 * platform headers, read from the process and kept on purpose, docs/adr/0048, amendment of 2026-11-01; the retry and
 * timeout headers) and the gateway's key. Pinned from the first green run: a header a later SDK adds fails MOD-18 and
 * is decided then, never let through here unread.
 */
const GATEWAY_HEADERS = [
  'accept',
  'anthropic-version',
  'authorization',
  'content-type',
  'user-agent',
  'x-stainless-arch',
  'x-stainless-lang',
  'x-stainless-os',
  'x-stainless-package-version',
  'x-stainless-retry-count',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
  'x-stainless-timeout',
] as const;

/**
 * Every environment variable the installed SDK reads, each closed for the gateway (docs/adr/0048, amendment of
 * 2026-11-01). MOD-17 reads them out of the SDK's own code, so a version that reads another fails until it is closed by a
 * client option, refused in readGatewayConfig, or recorded here as out of the gateway's reach.
 */
const SDK_ENV_READS = [
  // Fixed by anthropicClient's options: the host, the logging, the tracing with its propagation and content, the webhook key.
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_LOG',
  'ANTHROPIC_OPEN_TELEMETRY',
  'ANTHROPIC_OPEN_TELEMETRY_PROPAGATION',
  'ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE',
  'ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES',
  'ANTHROPIC_WEBHOOK_SIGNING_KEY',
  // No client option overrides it: readGatewayConfig refuses it on the Anthropic path (config.test.ts).
  'ANTHROPIC_CUSTOM_HEADERS',
  // The SDK's credential chain and its profile files, never read because the client is given its key.
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_CONFIG_DIR',
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_IDENTITY_TOKEN',
  'ANTHROPIC_IDENTITY_TOKEN_FILE',
  'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_PROFILE',
  'ANTHROPIC_SCOPE',
  'ANTHROPIC_SERVICE_ACCOUNT_ID',
  'ANTHROPIC_WORKSPACE_ID',
  'APPDATA',
  'HOME',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
  // Entry points the gateway never calls: the self-hosted environments' worker and poller (lib/environments) and the
  // agent toolset (tools/agent-toolset).
  'ANTHROPIC_ENVIRONMENT_ID',
  'ANTHROPIC_ENVIRONMENT_KEY',
  'ANTHROPIC_SESSION_ID',
  'ANTHROPIC_WORK_ID',
  'ANTHROPIC_WORK_SECRET',
  'HOSTNAME',
  'PATH',
] as const;

/**
 * Every other touch of the environment object in the SDK's code, counted per file without its extension (the CommonJS
 * and ES module twins together): an alias, an enumeration, or a name the name pattern cannot read. A new touch fails
 * MOD-17 wherever it is, in a file listed here as in any other, even where no name can be read from it.
 */
const SDK_ENV_SITES: Readonly<Record<string, number>> = {
  // readEnv itself, which every read above goes through: process.env and Deno.env, in each twin.
  'internal/utils/env': 4,
  // An alias of process.env, read for HOSTNAME by an entry point the gateway never calls, in each twin.
  'lib/environments/poller': 2,
  // Object.entries(process.env), scrubbing a child shell's environment in the agent toolset, and the comment above it
  // that names process.env, in each twin.
  'tools/agent-toolset/node': 4,
};

/**
 * The packages the SDK's manifest names at the locked version, by kind; a new one, of any kind, is read first. zod is an
 * optional peer: the gateway's own dependency, which the SDK loads only in its zod helpers. Every package installed for
 * one of them, and for their own dependencies in turn, is read too, and touches the environment nowhere.
 */
const SDK_PACKAGES = {
  dependencies: ['@opentelemetry/api', 'json-schema-to-ts', 'standardwebhooks'],
  optionalDependencies: [],
  peerDependencies: ['zod'],
  bundleDependencies: [],
  bundledDependencies: [],
} as const;

/** What a package's manifest names. */
interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly bundleDependencies?: unknown;
  readonly bundledDependencies?: unknown;
}

/** A name the SDK reads: through readEnv, an index of process.env or Deno.env.get, or a property of process.env. */
const ENV_NAME = /(?:readEnv\)?\(|process\??\.env(?:\?\.)?\[|env\?\.\[|Deno\??\.env\??\.get\??\.?\()\s*(['"`])([A-Z0-9_]+)\1|process\??\.env\.([A-Z][A-Z0-9_]*)/g;

/** Any other touch of the environment: readEnv with a computed name, or process.env or Deno.env not followed by a literal name. */
const ENV_SITE = /\breadEnv\)?\(\s*(?!['"`][A-Z0-9_]+['"`])[^)\s]|(?:process\??\.env|Deno\??\.env)(?!(?:\?\.)?\[\s*['"`][A-Z0-9_]+['"`]|\.[A-Z][A-Z0-9_]*)/g;

/** The installed SDK's real directory (its package.json is not in its exports). */
function sdkDirectory(): string {
  return realpathSync(path.dirname(createRequire(import.meta.url).resolve('@anthropic-ai/sdk')));
}

function manifestOf(directory: string): Manifest {
  return JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as Manifest;
}

/** The names a manifest field lists: a record's keys or an array's entries; `true` (bundle everything) as itself. */
function named(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.map(String).sort();
  }
  if (field === true) {
    return ['true'];
  }
  return typeof field === 'object' && field !== null ? Object.keys(field).sort() : [];
}

/** Where Node finds the package `name` from the package at `directory`: the nearest node_modules above it that holds it. */
function installedPackage(name: string, directory: string): string | undefined {
  for (let dir = directory; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    if (path.dirname(dir) === dir) {
      return undefined;
    }
  }
}

/**
 * Every package the SDK brings into the process, by real directory with its name and version: what its manifest names,
 * of any kind, and what those name in turn, as installed. A dependency that is not installed fails; an optional or peer
 * one that is not is never loaded.
 */
function packagesBroughtIn(sdk: string): Map<string, string> {
  const packages = new Map<string, string>();
  const visit = (from: string): void => {
    const manifest = manifestOf(from);
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      for (const name of named(manifest[kind])) {
        const found = installedPackage(name, from);
        if (found === undefined && kind === 'dependencies') {
          throw new Error(`${manifest.name} depends on ${name}, which is not installed`);
        }
        if (found !== undefined && found !== sdk && !packages.has(found)) {
          const { name: installed, version } = manifestOf(found);
          packages.set(found, `${installed}@${version}`);
          visit(found);
        }
      }
    }
  };
  visit(sdk);
  return packages;
}

/**
 * A package's shipped code: every JavaScript file and extensionless script under its directory, nested packages (a
 * bundled dependency) included, without TypeScript sources, type declarations or source maps. Comments are read too: a
 * name mentioned only there costs a review, never a missed read.
 */
function packageCode(directory: string): { readonly file: string; readonly text: string }[] {
  const code: { readonly file: string; readonly text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(?:c?js|mjs)$/.test(entry.name) || (entry.isFile() && !entry.name.includes('.') && !entry.name.startsWith('LICENSE'))) {
        code.push({ file: path.relative(directory, full).split(path.sep).join('/'), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(directory);
  return code;
}

const CONSOLE_METHODS = ['debug', 'info', 'warn', 'log', 'error'] as const;

const started: string[] = [];

function recordingProvider(): TracerProvider {
  const tracer: Tracer = {
    startSpan(name: string) {
      started.push(name);
      const span = trace.wrapSpanContext({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 });
      return Object.assign(Object.create(span) as Span, { isRecording: () => true, end: () => undefined, setAttribute: () => span, setAttributes: () => span, setStatus: () => span, recordException: () => undefined });
    },
    startActiveSpan: () => {
      throw new Error('not used by the SDK');
    },
  };
  return { getTracer: () => tracer };
}

/** Writes all three trace-context headers, for a span the SDK started or for none. */
const propagator: TextMapPropagator = {
  inject(_context, carrier: Record<string, string>) {
    carrier.traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    carrier.tracestate = 'synthetic=1';
    carrier.baggage = 'synthetic=1';
  },
  extract: (context) => context,
  fields: () => ['traceparent', 'tracestate', 'baggage'],
};

const MESSAGE = { id: 'msg_synthetic', type: 'message', role: 'assistant', model: 'synthetic-model-id', content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };

interface Sent {
  readonly url: URL;
  readonly headers: Headers;
}

/**
 * One Messages request through the client `build` returns, itself and not a clone: the fake fetch stands in for the
 * global one before the client is built, since the SDK takes it at construction. The request the fake fetch received.
 */
async function send(build: () => Anthropic): Promise<Sent> {
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(MESSAGE), { status: 200, headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('fetch', fetch);
  await build().messages.create({ model: 'synthetic-model-id', max_tokens: 10, messages: [{ role: 'user', content: 'SYNTHETIC' }] });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as [string | URL, RequestInit];
  return { url: new URL(String(url)), headers: new Headers(init.headers) };
}

function stubEnvironment(): void {
  for (const [name, setting] of Object.entries(ENVIRONMENT)) {
    vi.stubEnv(name, setting);
  }
  // Configuration refuses ANTHROPIC_CUSTOM_HEADERS (config.test.ts), and these tests build the client without it, so the
  // runner's own value must not reach them: the SDK reads a blank value as unset. The control sets it again.
  vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', '');
}

function registerTelemetry(): void {
  expect(trace.setGlobalTracerProvider(recordingProvider())).toBe(true);
  expect(propagation.setGlobalPropagator(propagator)).toBe(true);
}

function spyConsole() {
  return CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
}

const built = () => anthropicClient(KEY, TIMEOUT_MS) as unknown as Anthropic;

afterEach(() => {
  trace.disable();
  propagation.disable();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  started.length = 0;
});

describe('MOD-17: the Anthropic client as configuration builds it, whatever the environment asks of the SDK', () => {
  it('has the SDK’s tracing and propagation off, its logging off, the API’s own host, no retries and the gateway’s timeout', () => {
    stubEnvironment();
    const client = built();
    expect(client.openTelemetry.traces.enabled).toBe(false);
    expect(client.openTelemetry.propagation).toBe(false);
    expect(client.logLevel).toBe('off');
    expect(client.baseURL).toBe('https://api.anthropic.com');
    expect(client.webhookKey).toBeNull();
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(TIMEOUT_MS);
  });

  it('leaves the webhook signing key in the environment unread', () => {
    vi.stubEnv('ANTHROPIC_WEBHOOK_SIGNING_KEY', 'whsec_synthetic');
    expect(built().webhookKey).toBeNull();
  });

  it('is built by an SDK that reads no environment variable, touches the environment nowhere and names no package but what this file lists, each closed', () => {
    const directory = sdkDirectory();
    const names = new Set<string>();
    const sites: Record<string, number> = {};
    for (const { file, text } of packageCode(directory)) {
      for (const match of text.matchAll(ENV_NAME)) {
        names.add(match[2] ?? match[3] ?? '');
      }
      const touches = [...text.matchAll(ENV_SITE)].length;
      if (touches > 0) {
        const key = file.replace(/\.(?:c?js|mjs)$/, '');
        sites[key] = (sites[key] ?? 0) + touches;
      }
    }
    expect([...names].sort()).toEqual([...SDK_ENV_READS].sort());
    expect(sites).toEqual(SDK_ENV_SITES);
    const manifest = manifestOf(directory);
    const kinds = Object.keys(SDK_PACKAGES) as (keyof typeof SDK_PACKAGES)[];
    expect(Object.fromEntries(kinds.map((kind) => [kind, named(manifest[kind])]))).toEqual(SDK_PACKAGES);
  });

  it('brings in no package, its dependencies’ own included, that reads or touches the environment', () => {
    const packages = packagesBroughtIn(sdkDirectory());
    const brought = [...packages.values()].map((installed) => installed.slice(0, installed.lastIndexOf('@')));
    expect(brought).toEqual(expect.arrayContaining([...SDK_PACKAGES.dependencies, ...SDK_PACKAGES.peerDependencies]));
    const touches: string[] = [];
    for (const [directory, installed] of packages) {
      for (const { file, text } of packageCode(directory)) {
        if (text.search(ENV_NAME) !== -1 || text.search(ENV_SITE) !== -1) {
          touches.push(`${installed}: ${file}`);
        }
      }
    }
    expect(touches).toEqual([]);
  });
});

/** A request as the gateway hands it to the provider; synthetic. */
const REQUEST: ModelRequest = {
  modelId: 'synthetic-model-id',
  promptVersion: 'propose-contract-terms/1',
  system: 'SYNTHETIC SYSTEM PROMPT',
  user: 'SYNTHETIC',
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  maxTokens: 10,
  effort: 'high',
};

/** The API's error answer with `status`, as the API writes one. */
function answer(status: number, type: string): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify({ type: 'error', error: { type, message: 'synthetic' } }), { status, headers: { 'content-type': 'application/json' } }));
}

/** A fetch that never answers, and rejects as fetch does once its signal aborts. */
function hanging(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')), { once: true });
  });
}

/** One call through the provider over the client as configuration builds it, the fake fetch stubbed before it is built. */
async function failing(fetch: (url: string | URL | Request, init?: RequestInit) => Promise<Response>, options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {}) {
  vi.stubGlobal('fetch', fetch);
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const provider = new AnthropicProvider({ client: anthropicClient(KEY, timeoutMs), timeoutMs });
  return provider.complete(REQUEST, { signal: options.signal ?? new AbortController().signal });
}

/**
 * The gateway retries once only what anthropicFailure maps to a retryable code (throttled, unavailable, timeout), so the
 * mapping is held here against what the installed SDK's client throws, not only against errors built by hand
 * (providers.test.ts): a later SDK that surfaced a failure another way would fail this.
 */
describe('MOD-17: the failures a request through that client meets, as the gateway reads them', () => {
  it.each([
    ['a rate limit (429)', 'throttled', answer(429, 'rate_limit_error')],
    ['an overload (529)', 'unavailable', answer(529, 'overloaded_error')],
    ['a server error (500)', 'unavailable', answer(500, 'api_error')],
    ['a 503 that is not JSON', 'unavailable', () => Promise.resolve(new Response('synthetic upstream text', { status: 503 }))],
    ['a refused connection', 'unavailable', () => Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }))],
    ['a connect timeout', 'timeout', () => Promise.reject(new TypeError('fetch failed', { cause: new Error('Connect Timeout Error') }))],
    ['a bad request (400)', 'rejected', answer(400, 'invalid_request_error')],
    ['an authentication failure (401)', 'rejected', answer(401, 'authentication_error')],
  ] as const)('maps %s to %s, after one request and with nothing written to the console', async (_name, code, answering) => {
    const fetch = vi.fn(answering);
    const spies = spyConsole();
    await expect(failing(fetch)).rejects.toMatchObject({ name: 'ProviderFailure', code, message: `the model provider failed: ${code}` });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('maps the SDK’s own timeout to timeout, after one request', async () => {
    const fetch = vi.fn(hanging);
    await expect(failing(fetch, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps the gateway’s abort during the request to timeout, after one request', async () => {
    const attempt = new AbortController();
    const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      setTimeout(() => attempt.abort(), 0);
      return hanging(url, init);
    });
    await expect(failing(fetch, { signal: attempt.signal })).rejects.toMatchObject({ code: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('MOD-18: a request through that client with a tracer provider and a propagator registered', () => {
  it('goes once to the API’s own host, starts no span, sends no trace context or header outside the gateway’s set, and writes nothing to the console', async () => {
    stubEnvironment();
    registerTelemetry();
    const spies = spyConsole();
    const { url, headers } = await send(built);
    expect(url.host).toBe('api.anthropic.com');
    expect(started).toEqual([]);
    expect(headers.has('traceparent')).toBe(false);
    expect(headers.has('tracestate')).toBe(false);
    expect(headers.has('baggage')).toBe(false);
    // Moving this pin is a model change once the Anthropic path has a real entry: re-record it first (docs/adr/0048,
    // amendment of 2026-11-01, API version).
    expect(headers.get('anthropic-version')).toBe('2026-10-21');
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.has('x-api-key')).toBe(false);
    expect([...headers.keys()].sort()).toEqual([...GATEWAY_HEADERS]);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('control: a client left at the SDK’s defaults does trace, propagate, log, take another host and send extra headers from the environment, its key replaced among them', async () => {
    stubEnvironment();
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'x-synthetic-extra: 1\nauthorization: Bearer sk-synthetic-other');
    registerTelemetry();
    const spies = spyConsole();
    const { url, headers } = await send(() => new Anthropic({ apiKey: KEY, maxRetries: 0 }));
    expect(url.host).toBe('example.invalid');
    expect(started).toEqual(['anthropic.messages.create']);
    expect(headers.get('traceparent')).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(headers.get('baggage')).toBe('synthetic=1');
    expect(headers.get('x-synthetic-extra')).toBe('1');
    // Why configuration refuses the variable: it can replace the gateway's key (docs/adr/0048, amendment of 2026-11-01).
    expect(headers.get('authorization')).toBe('Bearer sk-synthetic-other');
    expect(spies[CONSOLE_METHODS.indexOf('debug')]).toHaveBeenCalled();
  });
});
