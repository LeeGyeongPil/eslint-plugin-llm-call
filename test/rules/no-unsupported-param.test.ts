import { describe } from 'vitest';
import tsParser from '@typescript-eslint/parser';
import { RuleTester } from 'eslint';
import rule from '../../src/rules/no-unsupported-param.js';
import { ANTHROPIC, OPENAI, projectFile, tester } from '../helpers.js';

/** 1-based column of `needle` in a single-line `code`. */
const col = (code: string, needle: string): number => code.indexOf(needle) + 1;

const sdk1 = projectFile('sdk1', 1);
const sdk0 = projectFile('sdk0', 0);
const noSdk = projectFile('nosdk');

const spreadCode = `${OPENAI} const legacy = { max_tokens: 10 }; c.responses.create({ model: 'gpt-4o', input: 'hi', ...legacy });`;
const extraCode = `${ANTHROPIC} const extra = { temperature: 0.5 }; a.messages.create({ model: 'claude-opus-5-5', max_tokens: 10, ...extra });`;

describe('token params', () => {
  tester.run('no-unsupported-param', rule, {
    valid: [
      `${OPENAI} c.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 100 });`,
      `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_completion_tokens: 100 });`,
      // non-reasoning chat variant of gpt-5 is excluded in the table
      `${OPENAI} c.chat.completions.create({ model: 'gpt-5-chat-latest', max_tokens: 100 });`,
      `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'hi', max_output_tokens: 10 });`,
    ],
    invalid: [
      {
        // computed key: reported, but never auto-fixed (would reference an undeclared identifier)
        code: `${OPENAI} const k = 'max_tokens'; c.chat.completions.create({ model: 'o3', [k]: 5, messages: [] });`,
        output: null,
        errors: [{ messageId: 'rejectedUse' }],
      },
      {
        code: `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens: 100 });`,
        output: `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_completion_tokens: 100 });`,
        errors: [{ messageId: 'rejectedUse', data: { model: 'o4-mini', param: 'max_tokens', replacement: 'max_completion_tokens', effort: '', sdk: '' } }],
      },
      {
        code: `${OPENAI} const MODEL = 'gpt-5'; c.chat.completions.create({ model: MODEL, max_tokens: 5 });`,
        output: `${OPENAI} const MODEL = 'gpt-5'; c.chat.completions.create({ model: MODEL, max_completion_tokens: 5 });`,
        errors: [{ messageId: 'rejectedUse' }],
      },
      {
        // both present: renaming would create a duplicate key, so no fix
        code: `${OPENAI} c.chat.completions.create({ model: 'o3', max_tokens: 5, max_completion_tokens: 7 });`,
        output: null,
        errors: [{ messageId: 'rejectedUse' }],
      },
      {
        code: `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens });`,
        output: `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_completion_tokens: max_tokens });`,
        errors: [{ messageId: 'rejectedUse' }],
      },
      {
        code: `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'hi', max_tokens: 10 });`,
        output: `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'hi', max_output_tokens: 10 });`,
        errors: [{ messageId: 'rejectedNoModelUse' }],
      },
      {
        // same-file const spread: reported on the spread, no autofix
        code: spreadCode,
        output: null,
        errors: [{ messageId: 'rejectedNoModelUse', column: col(spreadCode, '...legacy') }],
      },
    ],
  });
});

describe('sampling', () => {
  tester.run('no-unsupported-param', rule, {
    valid: [
      `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', temperature: 0.2 });`,
      `${OPENAI} c.chat.completions.create({ model: 'gpt-5.1', reasoning_effort: 'none', temperature: 0.2 });`,
      `${OPENAI} c.responses.create({ model: 'gpt-5.1', reasoning: { effort: 'none' }, temperature: 0.2 });`,
      // effort not statically known -> silent
      `${OPENAI} c.chat.completions.create({ model: 'gpt-5.1', reasoning_effort: effort, temperature: 0.2 });`,
      `${OPENAI} c.chat.completions.create({ model: 'gpt-5.1', ...opts, temperature: 0.2 });`,
      // no effort written: the default is unconfirmed, so stay silent
      `${OPENAI} c.chat.completions.create({ model: 'gpt-5.1', temperature: 0.2 });`,
    ],
    invalid: [
      {
        code: `${OPENAI} c.chat.completions.create({ model: 'gpt-5', temperature: 0.2, messages: [] });`,
        output: null,
        errors: [
          {
            messageId: 'rejectedReasoning',
            suggestions: [
              {
                messageId: 'suggestRemove',
                output: `${OPENAI} c.chat.completions.create({ model: 'gpt-5', messages: [] });`,
              },
            ],
          },
        ],
      },
      {
        code: `${OPENAI} c.chat.completions.create({ model: 'o3-mini', messages: [], top_p: 0.5 });`,
        output: null,
        errors: [
          {
            messageId: 'rejectedReasoning',
            suggestions: [
              {
                messageId: 'suggestRemove',
                output: `${OPENAI} c.chat.completions.create({ model: 'o3-mini', messages: [] });`,
              },
            ],
          },
        ],
      },
      {
        code: `${OPENAI} c.chat.completions.create({ model: 'gpt-5.2', reasoning_effort: 'low', temperature: 0.2 });`,
        output: null,
        errors: [
          {
            messageId: 'rejectedEffort',
            suggestions: [
              {
                messageId: 'suggestRemove',
                output: `${OPENAI} c.chat.completions.create({ model: 'gpt-5.2', reasoning_effort: 'low' });`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('anthropic sdk major', () => {
  tester.run('no-unsupported-param', rule, {
    valid: [
      // SDK 1.x: only the listed sampling parameters are a problem
      { code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 10 });`, filename: sdk1 },
      // SDK 0.x: temperature alone is fine, temperature + top_p on an old model is fine
      { code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 10, temperature: 0.5 });`, filename: sdk0 },
      { code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 10, top_p: 0.5 });`, filename: sdk0 },
      { code: `${ANTHROPIC} a.messages.create({ model: 'claude-3-5-sonnet-latest', max_tokens: 10, temperature: 0.5, top_p: 0.5 });`, filename: sdk0 },
      // SDK not found -> silent
      { code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 10, temperature: 0.5 });`, filename: noSdk },
    ],
    invalid: [
      {
        code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 10, temperature: 0.5 });`,
        filename: sdk1,
        output: null,
        errors: [
          {
            messageId: 'rejectedSdk1',
            data: { model: 'claude-opus-5-5', param: 'temperature', replacement: '', effort: '', sdk: '1' },
            suggestions: [
              {
                messageId: 'suggestRemove',
                output: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-5-5', max_tokens: 10 });`,
              },
            ],
          },
        ],
      },
      {
        // temperature smuggled in through a same-file const spread (tsc does not catch this)
        code: extraCode,
        filename: sdk1,
        output: null,
        errors: [{ messageId: 'rejectedSdk1', column: col(extraCode, '...extra') }],
      },
      {
        code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 10, temperature: 0.5, top_p: 0.9 });`,
        filename: sdk0,
        output: null,
        errors: [
          {
            messageId: 'rejectedPair',
            data: { model: 'claude-opus-4-5', param: 'top_p', other: 'temperature', replacement: '', effort: '', sdk: '0' },
            suggestions: [
              {
                messageId: 'suggestRemove',
                output: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 10, temperature: 0.5 });`,
              },
            ],
          },
        ],
      },
    ],
  });
});

describe('typescript syntax', () => {
  const tsTester = new RuleTester({ languageOptions: { parser: tsParser } });
  tsTester.run('no-unsupported-param', rule, {
    valid: [
      `import OpenAI from 'openai'; const c = new OpenAI(); c.chat.completions.create({ model: 'gpt-4o', max_tokens: 5 } as const);`,
    ],
    invalid: [
      {
        // client stored on a class property and the model pinned with `as const`
        code: `import OpenAI from 'openai';
const MODEL = 'o4-mini' as const;
class Svc {
  private client = new OpenAI();
  run() { return this.client.chat.completions.create({ model: MODEL, max_tokens: 5, messages: [] }); }
}`,
        output: `import OpenAI from 'openai';
const MODEL = 'o4-mini' as const;
class Svc {
  private client = new OpenAI();
  run() { return this.client.chat.completions.create({ model: MODEL, max_completion_tokens: 5, messages: [] }); }
}`,
        errors: [{ messageId: 'rejectedUse' }],
      },
      {
        code: `import OpenAI from 'openai';
const params = { max_tokens: 5 } satisfies Record<string, number>;
new OpenAI().responses.create({ model: 'gpt-4o', input: 'x', ...params });`,
        output: null,
        errors: [{ messageId: 'rejectedNoModelUse' }],
      },
    ],
  });
});
