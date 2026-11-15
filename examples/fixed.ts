// Practice fixture (mock): the same calls as broken.ts after the fixes, so the linter reports nothing.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'sk-demo-not-a-real-key' });
const anthropic = new Anthropic({ apiKey: 'demo-not-a-real-key' });

export async function run(): Promise<void> {
  await openai.chat.completions.create({
    model: 'o4-mini',
    max_completion_tokens: 100,
    messages: [{ role: 'user', content: 'hi' }],
  });

  await openai.chat.completions.create({
    model: 'gpt-5',
    messages: [{ role: 'user', content: 'hi' }],
  });

  const modern = { max_output_tokens: 100 };
  await openai.responses.create({ model: 'gpt-4o', input: 'hi', ...modern });

  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: 'list three colors as JSON' }],
  });

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
            address: {
              type: 'object',
              properties: { zip: { type: 'string' } },
              required: ['zip'],
              additionalProperties: false,
            },
          },
          required: ['name', 'address'],
          additionalProperties: false,
        },
      },
    },
  });

  await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'hi' }],
  });
}
