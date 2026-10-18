import { z } from 'zod';

import { type ModelRequest, type ModelResponse, ProviderFailure, type StopReason } from '../provider';

/**
 * The Messages request and response both real providers speak: Bedrock's InvokeModel carries the
 * same JSON body (with its anthropic_version and without the model, which the command names), and
 * Anthropic's API takes it as the create parameters. One user message, the system prompt, the token
 * limit, and output_config with the effort and the JSON schema (structured outputs). Nothing else: no
 * tools, tool choice, servers, containers or files, so the call cannot act (PRD 14, Untrusted input).
 */

export interface MessagesBody {
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly [{ readonly role: 'user'; readonly content: readonly [{ readonly type: 'text'; readonly text: string }] }];
  readonly output_config: { readonly effort: ModelRequest['effort']; readonly format: { readonly type: 'json_schema'; readonly schema: Readonly<Record<string, unknown>> } };
}

export function messagesBody(request: ModelRequest): MessagesBody {
  return {
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: request.user }] }],
    output_config: { effort: request.effort, format: { type: 'json_schema', schema: request.outputSchema } },
  };
}

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
  stop_reason: z.string().nullable().optional(),
});

const STOP_REASONS: Readonly<Record<string, StopReason>> = { end_turn: 'end', stop_sequence: 'end', max_tokens: 'max_tokens', refusal: 'refusal' };

/** Why the response stopped, as the gateway reads it: a finished answer, the token limit, a refusal, or anything else. */
function stopReason(reason: string | null | undefined): StopReason {
  return STOP_REASONS[reason ?? ''] ?? 'other';
}

/** The answer's text blocks joined, its token counts and why it stopped; thinking blocks are left out. */
export function messagesResponse(raw: unknown): ModelResponse {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderFailure('rejected');
  }
  const { content, usage } = parsed.data;
  return {
    text: content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join(''),
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    stopReason: stopReason(parsed.data.stop_reason),
  };
}
