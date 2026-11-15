// Practice fixture (mock): calls the linter cannot judge, so it must stay silent.
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'sk-demo-not-a-real-key' });

// The model comes from the environment: it might be a non-reasoning model.
export function fromEnvironment(): Promise<unknown> {
  return openai.chat.completions.create({
    model: process.env.CHAT_MODEL ?? 'gpt-4o',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'hi' }],
  });
}

// The model is a function argument.
export function fromArgument(model: string): Promise<unknown> {
  return openai.chat.completions.create({
    model,
    max_tokens: 100,
    temperature: 0.2,
    messages: [{ role: 'user', content: 'hi' }],
  });
}

// An unknown spread might override anything, including the model.
export function withOverrides(overrides: Record<string, unknown>): Promise<unknown> {
  return openai.chat.completions.create({
    model: 'o4-mini',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  });
}

// A different SDK with the same method name: `client.messages.create` is not an LLM call here.
declare const twilioLike: { messages: { create(body: Record<string, unknown>): Promise<unknown> } };
export function sendSms(): Promise<unknown> {
  return twilioLike.messages.create({ to: '+10000000000', body: 'hi', temperature: 1 });
}
