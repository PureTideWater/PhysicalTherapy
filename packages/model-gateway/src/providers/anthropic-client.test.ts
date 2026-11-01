import Anthropic from '@anthropic-ai/sdk';
import { type Span, type TextMapPropagator, type Tracer, type TracerProvider, propagation, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { anthropicClient } from './anthropic';

/**
 * The Anthropic client as configuration builds it, with SDK 1.x (test matrix MOD-17, MOD-18; docs/adr/0048, amendment
 * of 2026-11-01): nothing the SDK would take from the environment (its OpenTelemetry tracing and their content, its
 * debug logging, another host) reaches a request. A fake fetch answers a synthetic message in memory, so no request
 * leaves the process; the key is synthetic. Its own file, so the global OpenTelemetry state it registers stays in one
 * Vitest file; every test leaves that state, the environment and the console as it found them.
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
 * platform headers, the retry and timeout headers) and the gateway's key. Pinned from the first green run.
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

const CONSOLE_METHODS = ['debug', 'info', 'warn', 'log', 'error'] as const;

const started: string[] = [];

function recordingProvider(): TracerProvider {
  const tracer: Tracer = {
    startSpan(name: string) {
      started.push(name);
      const span = trace.wrapSpanContext({ traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 });
      return Object.assign(Object.create(span) as Span, { isRecording: () => true, end: () => undefined, setAttribute: () => span, setAttributes: () => span, setStatus: () => span, recordException: () => undefined });
    },
    startActiveSpan: (() => {
      throw new Error('not used by the SDK');
    }) as Tracer['startActiveSpan'],
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

/** One Messages request through `client` with a fake fetch; the request the fake fetch received. */
async function send(client: Anthropic): Promise<Sent> {
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(MESSAGE), { status: 200, headers: { 'content-type': 'application/json' } })));
  await client.withOptions({ fetch }).messages.create({ model: 'synthetic-model-id', max_tokens: 10, messages: [{ role: 'user', content: 'SYNTHETIC' }] });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as [string | URL, RequestInit];
  return { url: new URL(String(url)), headers: new Headers(init.headers) };
}

function stubEnvironment(): void {
  for (const [name, setting] of Object.entries(ENVIRONMENT)) {
    vi.stubEnv(name, setting);
  }
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
});

describe('MOD-18: a request through that client with a tracer provider and a propagator registered', () => {
  it('goes once to the API’s own host, starts no span, sends no trace context or header outside the gateway’s set, and writes nothing to the console', async () => {
    stubEnvironment();
    registerTelemetry();
    const spies = spyConsole();
    const { url, headers } = await send(built());
    expect(url.host).toBe('api.anthropic.com');
    expect(started).toEqual([]);
    expect(headers.has('traceparent')).toBe(false);
    expect(headers.has('tracestate')).toBe(false);
    expect(headers.has('baggage')).toBe(false);
    expect(headers.get('anthropic-version')).toBe('2026-10-21');
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.has('x-api-key')).toBe(false);
    expect([...headers.keys()].sort()).toEqual([...GATEWAY_HEADERS]);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('control: a client left at the SDK’s defaults does trace, propagate, log, take another host and send extra headers from the environment', async () => {
    stubEnvironment();
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'x-synthetic-extra: 1');
    registerTelemetry();
    const spies = spyConsole();
    const { url, headers } = await send(new Anthropic({ apiKey: KEY, maxRetries: 0 }));
    expect(url.host).toBe('example.invalid');
    expect(started).toEqual(['anthropic.messages.create']);
    expect(headers.get('traceparent')).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(headers.get('baggage')).toBe('synthetic=1');
    expect(headers.get('x-synthetic-extra')).toBe('1');
    expect(spies[CONSOLE_METHODS.indexOf('debug')]).toHaveBeenCalled();
  });
});
