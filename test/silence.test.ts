import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';
import { ANTHROPIC, OPENAI, newLinter, projectFile } from './helpers.js';

// "Silent when unsure": every case here would be a bug if the model/SDK were known,
// but something about it is not statically known, so the plugin must report nothing.
const sdk1 = projectFile('silence-sdk1', 1);
const noSdk = projectFile('silence-nosdk');

function lint(code: string, filename = projectFile('silence-default')): Linter.LintMessage[] {
  const linter = newLinter();
  return linter.verify(code, [plugin.configs.recommended], { filename });
}

const cases: Record<string, string> = {
  'model from process.env': `${OPENAI} c.chat.completions.create({ model: process.env.MODEL, max_tokens: 5, temperature: 1 });`,
  'model from a function argument': `${OPENAI} export function ask(model) { return c.chat.completions.create({ model, max_tokens: 5 }); }`,
  'model imported from another file': `import { MODEL } from './models.js'; ${OPENAI} c.chat.completions.create({ model: MODEL, max_tokens: 5 });`,
  'model from a let variable': `${OPENAI} let model = 'o4-mini'; model = pick(); c.chat.completions.create({ model, max_tokens: 5 });`,
  'model built by a template with an expression': `${OPENAI} c.chat.completions.create({ model: \`o4-\${size}\`, max_tokens: 5 });`,
  'unknown spread may override the model': `${OPENAI} c.chat.completions.create({ model: 'o4-mini', ...overrides, max_tokens: 5 });`,
  'unknown spread, spread first': `${OPENAI} c.chat.completions.create({ ...overrides, model: 'o4-mini', max_tokens: 5 });`,
  'spread of an imported object': `import { base } from './base.js'; ${OPENAI} c.chat.completions.create({ ...base, max_tokens: 5 });`,
  'Azure deployment name (not a model id)': `import { AzureOpenAI } from 'openai'; const az = new AzureOpenAI(); az.chat.completions.create({ model: 'my-o4-mini-deployment', max_tokens: 5 });`,
  'twilio-shaped client.messages.create without SDK import': `import twilio from 'twilio'; const client = twilio(); client.messages.create({ to: '+10000000000', body: 'hi', temperature: 1 });`,
  'client of unknown origin': `const client = makeClient(); client.chat.completions.create({ model: 'o4-mini', max_tokens: 5 });`,
  'model not in the table': `${OPENAI} c.chat.completions.create({ model: 'my-finetune-v3', max_tokens: 5, temperature: 1 });`,
  'future model not in the table (anthropic)': `${ANTHROPIC} a.messages.create({ model: 'my-claude-proxy', max_tokens: 5, temperature: 1 });`,
  'reasoning effort is a variable': `${OPENAI} c.chat.completions.create({ model: 'gpt-5.1', reasoning_effort: effort, temperature: 1 });`,
  'client name shadowed by a function parameter': `${OPENAI} function f(c) { return c.chat.completions.create({ model: 'o3', max_tokens: 5 }); }`,
  'client name shadowed by a local of another origin': `${OPENAI} function f() { const c = other(); return c.chat.completions.create({ model: 'o3', max_tokens: 5 }); }`,
  'argument is not an object literal': `${OPENAI} c.chat.completions.create(params);`,
  'computed key might be anything': `${OPENAI} c.chat.completions.create({ model: 'o4-mini', [key]: 5 });`,
  'json mode with a message from a variable': `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: question }] });`,
  'strict schema produced by a helper': `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [], response_format: zodResponseFormat(Schema, 'x') });`,
};

describe('silence when unsure', () => {
  for (const [name, code] of Object.entries(cases)) {
    it(name, () => {
      expect(lint(code).map((m) => `${m.ruleId}: ${m.message}`)).toEqual([]);
    });
  }

  it('anthropic call with no SDK found: silent', () => {
    const code = `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 5, temperature: 1 });`;
    expect(lint(code, noSdk)).toEqual([]);
  });

  it('control: the same anthropic call IS reported once SDK 1.x is found', () => {
    const code = `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 5, temperature: 1 });`;
    expect(lint(code, sdk1).map((m) => m.ruleId)).toEqual(['llm-call/no-unsupported-param']);
  });

  it('control: a known reasoning model IS reported', () => {
    const code = `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens: 5 });`;
    expect(lint(code).map((m) => m.ruleId)).toEqual(['llm-call/no-unsupported-param']);
  });
});
