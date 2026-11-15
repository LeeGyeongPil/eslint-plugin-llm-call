// Practice fixture (mock): none of these calls is ever executed or sent to an API.
// TypeScript accepts almost all of them; the providers would answer HTTP 400.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'sk-demo-not-a-real-key' });
const anthropic = new Anthropic({ apiKey: 'demo-not-a-real-key' });

const MODEL = 'o4-mini';

export async function run(): Promise<void> {
  // 1. Reasoning model + max_tokens (400: use max_completion_tokens). The type only marks it deprecated.
  await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 100,
    messages: [{ role: 'user', content: 'hi' }],
  });

  // 2. GPT-5 + temperature (400: sampling parameters are not supported).
  await openai.chat.completions.create({
    model: 'gpt-5',
    temperature: 0.2,
    messages: [{ role: 'user', content: 'hi' }],
  });

  // 3. Responses API has no max_tokens; it hides in a spread so the excess-property check never fires.
  const legacy = { max_tokens: 100 };
  await openai.responses.create({ model: 'gpt-4o', input: 'hi', ...legacy });

  // 4. JSON mode without the word "JSON" anywhere in the messages (400).
  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: 'list three colors' }],
  });

  // 5. Strict schema: nested object without additionalProperties:false, and required lists only one property.
  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'a person' }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'person',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'object', properties: { zip: { type: 'string' } }, required: ['zip'] },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
  });

  // 6. Anthropic SDK 1.x: temperature is gone from the types, so TypeScript reports this one (the only error).
  await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 100,
    temperature: 0.5,
    messages: [{ role: 'user', content: 'hi' }],
  });

  // 7. The same mistake through a spread: TypeScript stays quiet, the API still answers 400.
  const extra = { temperature: 0.5 };
  await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 100,
    ...extra,
    messages: [{ role: 'user', content: 'hi' }],
  });
}
