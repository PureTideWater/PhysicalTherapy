import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';

import { type ModelRequest, ProviderFailure } from '../provider';
import { type AnthropicMessages, AnthropicProvider, anthropicClient, anthropicFailure } from './anthropic';
import { BEDROCK_ANTHROPIC_VERSION, BedrockProvider, bedrockFailure } from './bedrock';
import { LOCAL_OUTPUT_FORMAT, LocalDeterministicProvider, localOutputKey } from './local';
import { messagesBody, messagesResponse } from './messages';

/**
 * The providers behind the gateway's one interface, with their SDK clients mocked (no network, no
 * credentials, no model): what each sends, what it reads back, and how its failures map to the
 * gateway's codes. Synthetic text only.
 */

const REQUEST: ModelRequest = {
  modelId: 'synthetic-model-id',
  promptVersion: 'propose-contract-terms/1',
  system: 'SYNTHETIC SYSTEM PROMPT',
  user: '<document kind="contract" pages="1">\n<page number="1">\nSYNTHETIC PAGE\n</page>\n</document>',
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  maxTokens: 1000,
  effort: 'high',
};

const RESPONSE = {
  id: 'msg_synthetic',
  type: 'message',
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: '{"candidates":' },
    { type: 'text', text: '[]}' },
  ],
  usage: { input_tokens: 1200, output_tokens: 34 },
  stop_reason: 'end_turn',
};

const signal = () => new AbortController().signal;

/** Keys that would give a model a way to act; no request may carry one. */
const ACTING_KEYS = ['tools', 'tool_choice', 'mcp_servers', 'container', 'betas'];

describe('the Messages request and response', () => {
  it('is one user message, the system prompt, the limit, the effort and the schema, and nothing a model could act with', () => {
    const body = messagesBody(REQUEST);
    expect(body).toEqual({
      max_tokens: 1000,
      system: 'SYNTHETIC SYSTEM PROMPT',
      messages: [{ role: 'user', content: [{ type: 'text', text: REQUEST.user }] }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema: REQUEST.outputSchema } },
    });
    for (const key of ACTING_KEYS) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('reads the text blocks, the token counts and why the answer stopped', () => {
    expect(messagesResponse(RESPONSE)).toEqual({ text: '{"candidates":[]}', tokensIn: 1200, tokensOut: 34, stopReason: 'end' });
    expect(messagesResponse({ ...RESPONSE, stop_reason: 'stop_sequence' }).stopReason).toBe('end');
    expect(messagesResponse({ ...RESPONSE, stop_reason: 'max_tokens' }).stopReason).toBe('max_tokens');
    expect(messagesResponse({ ...RESPONSE, stop_reason: 'refusal' }).stopReason).toBe('refusal');
    expect(messagesResponse({ ...RESPONSE, stop_reason: 'pause_turn' }).stopReason).toBe('other');
    expect(messagesResponse({ ...RESPONSE, stop_reason: null }).stopReason).toBe('other');
    expect(messagesResponse({ ...RESPONSE, content: [{ type: 'text' }] }).text).toBe('');
  });

  it('refuses a response that is not a Messages response', () => {
    expect(() => messagesResponse({ content: 'no' })).toThrow(ProviderFailure);
    expect(() => messagesResponse(undefined)).toThrow(expect.objectContaining({ code: 'rejected', retryable: false }));
  });
});

describe('BedrockProvider (mocked Bedrock runtime client)', () => {
  it('invokes the pinned model with the Messages body under Bedrock’s anthropic_version, and the attempt’s signal', async () => {
    const send = vi.fn((command: InvokeModelCommand, options: { abortSignal: AbortSignal }) => {
      expect(command).toBeInstanceOf(InvokeModelCommand);
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
      return Promise.resolve({ body: new TextEncoder().encode(JSON.stringify(RESPONSE)) });
    });
    const provider = new BedrockProvider({ client: { send } as never });
    expect(provider.kind).toBe('bedrock');
    await expect(provider.complete(REQUEST, { signal: signal() })).resolves.toEqual({ text: '{"candidates":[]}', tokensIn: 1200, tokensOut: 34, stopReason: 'end' });
    const command = send.mock.calls[0]?.[0] as InvokeModelCommand;
    expect(command.input.modelId).toBe('synthetic-model-id');
    expect(command.input.contentType).toBe('application/json');
    const body = JSON.parse(new TextDecoder().decode(command.input.body as Uint8Array)) as Record<string, unknown>;
    expect(body).toEqual({ anthropic_version: BEDROCK_ANTHROPIC_VERSION, ...messagesBody(REQUEST) });
    for (const key of [...ACTING_KEYS, 'model']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it.each([
    ['ThrottlingException', 'throttled', true],
    ['ServiceQuotaExceededException', 'throttled', true],
    ['ServiceUnavailableException', 'unavailable', true],
    ['InternalServerException', 'unavailable', true],
    ['ModelNotReadyException', 'unavailable', true],
    ['ModelTimeoutException', 'timeout', true],
    ['ValidationException', 'rejected', false],
    ['AccessDeniedException', 'rejected', false],
    ['ResourceNotFoundException', 'rejected', false],
  ])('maps %s to %s', async (name, code, retryable) => {
    const error = Object.assign(new Error('SYNTHETIC'), { name });
    const provider = new BedrockProvider({ client: { send: () => Promise.reject(error) } as never });
    await expect(provider.complete(REQUEST, { signal: signal() })).rejects.toMatchObject({ code, retryable });
  });

  it('reports its own abort as a timeout, and anything that is not an error as rejected', () => {
    const controller = new AbortController();
    controller.abort();
    expect(bedrockFailure(new Error('anything'), controller.signal).code).toBe('timeout');
    expect(bedrockFailure(Object.assign(new Error('x'), { name: 'AbortError' }), signal()).code).toBe('timeout');
    expect(bedrockFailure('not an error', signal()).code).toBe('rejected');
    const failure = new ProviderFailure('throttled');
    expect(bedrockFailure(failure, signal())).toBe(failure);
  });

  it('refuses a body that is not JSON', async () => {
    const provider = new BedrockProvider({ client: { send: () => Promise.resolve({ body: new TextEncoder().encode('not json') }) } as never });
    await expect(provider.complete(REQUEST, { signal: signal() })).rejects.toMatchObject({ code: 'rejected' });
  });
});

describe('AnthropicProvider (mocked SDK client)', () => {
  function mocked(create: (...args: unknown[]) => Promise<unknown>): AnthropicMessages {
    return { messages: { create } } as unknown as AnthropicMessages;
  }

  it('creates a message with the pinned model and the same body, no SDK retries, the attempt’s signal and timeout', async () => {
    const create = vi.fn(() => Promise.resolve(RESPONSE));
    const provider = new AnthropicProvider({ client: mocked(create), timeoutMs: 1234 });
    expect(provider.kind).toBe('anthropic');
    const attempt = signal();
    await expect(provider.complete(REQUEST, { signal: attempt })).resolves.toMatchObject({ text: '{"candidates":[]}', tokensIn: 1200 });
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toEqual({ model: 'synthetic-model-id', ...messagesBody(REQUEST), stream: false });
    for (const key of ACTING_KEYS) {
      expect(params).not.toHaveProperty(key);
    }
    expect(options).toEqual({ signal: attempt, maxRetries: 0, timeout: 1234 });
  });

  it('defaults the SDK timeout to the gateway’s 60 seconds', async () => {
    const create = vi.fn(() => Promise.resolve(RESPONSE));
    await new AnthropicProvider({ client: mocked(create) }).complete(REQUEST, { signal: signal() });
    expect((create.mock.calls[0] as unknown as [unknown, { timeout: number }])[1].timeout).toBe(60_000);
  });

  it.each([
    ['a rate limit', Anthropic.APIError.generate(429, {}, 'x', new Headers()), 'throttled'],
    ['an overload', Anthropic.APIError.generate(529, {}, 'x', new Headers()), 'unavailable'],
    ['a server error', Anthropic.APIError.generate(500, {}, 'x', new Headers()), 'unavailable'],
    ['a server status on an error the SDK did not classify', new Anthropic.APIError(502, {}, 'x', new Headers()), 'unavailable'],
    ['an error with no status that is not a connection error', new Anthropic.APIError(undefined, {}, 'x', new Headers()), 'rejected'],
    ['a connection error', new Anthropic.APIConnectionError({ message: 'x' }), 'unavailable'],
    ['a connection timeout', new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    ['a bad request', Anthropic.APIError.generate(400, {}, 'x', new Headers()), 'rejected'],
    ['an authentication failure', Anthropic.APIError.generate(401, {}, 'x', new Headers()), 'rejected'],
    ['something else', new Error('x'), 'rejected'],
  ])('maps %s to %s', async (_name, error, code) => {
    const provider = new AnthropicProvider({ client: mocked(() => Promise.reject(error)) });
    await expect(provider.complete(REQUEST, { signal: signal() })).rejects.toMatchObject({ code });
  });

  it('reports its own abort as a timeout, and keeps a failure it already mapped', () => {
    const controller = new AbortController();
    controller.abort();
    expect(anthropicFailure(new Anthropic.APIUserAbortError(), controller.signal).code).toBe('timeout');
    const failure = new ProviderFailure('unavailable');
    expect(anthropicFailure(failure, signal())).toBe(failure);
    expect(anthropicFailure(Object.assign(Anthropic.APIError.generate(undefined, undefined, 'x', undefined), {}), signal()).code).toBe('unavailable');
  });

  it('builds the SDK client with no retries of its own', () => {
    const client = anthropicClient('sk-synthetic-not-a-key', 60_000) as unknown as Anthropic;
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(60_000);
  });
});

describe('LocalDeterministicProvider: fixed outputs by input hash, not a model', () => {
  it('answers a registered request with its fixed output at no cost, whatever the model identifier', async () => {
    const provider = new LocalDeterministicProvider().register(REQUEST, { candidates: [] });
    expect(provider.kind).toBe('local');
    await expect(provider.complete({ ...REQUEST, modelId: 'local-deterministic' })).resolves.toEqual({ text: '{"candidates":[]}', tokensIn: 0, tokensOut: 0, stopReason: 'end' });
    expect(provider.requests).toHaveLength(1);
  });

  it('keys on the prompt version and the user message', () => {
    const key = localOutputKey(REQUEST);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(localOutputKey({ ...REQUEST, user: `${REQUEST.user} ` })).not.toBe(key);
    expect(localOutputKey({ ...REQUEST, promptVersion: 'propose-contract-terms/2' })).not.toBe(key);
  });

  it('refuses a request it has no fixed output for, and a key that is not a hash', async () => {
    await expect(new LocalDeterministicProvider().complete(REQUEST)).rejects.toMatchObject({ code: 'no_fixed_output', retryable: false });
    expect(() => new LocalDeterministicProvider().registerKey('not-a-hash', {})).toThrow(TypeError);
  });

  it('keeps a string output as written (a malformed answer, for tests)', async () => {
    const provider = new LocalDeterministicProvider().register(REQUEST, 'not json');
    await expect(provider.complete(REQUEST)).resolves.toMatchObject({ text: 'not json' });
  });

  it('reads a directory of fixed outputs', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-local-model-'));
    try {
      writeFileSync(path.join(dir, `${localOutputKey(REQUEST)}.json`), JSON.stringify({ format: LOCAL_OUTPUT_FORMAT, output: { candidates: [] } }));
      writeFileSync(path.join(dir, 'README.txt'), 'ignored');
      const provider = LocalDeterministicProvider.fromDirectory(dir);
      await expect(provider.complete(REQUEST)).resolves.toMatchObject({ text: '{"candidates":[]}' });
      writeFileSync(path.join(dir, `${'f'.repeat(64)}.json`), JSON.stringify({ output: {} }));
      expect(() => LocalDeterministicProvider.fromDirectory(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
