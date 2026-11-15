import rule from '../../src/rules/anthropic-require-max-tokens.js';
import { ANTHROPIC, OPENAI, tester } from '../helpers.js';

tester.run('anthropic-require-max-tokens', rule, {
  valid: [
    `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 10, messages: [] });`,
    // any spread: the request may be composed elsewhere -> silent
    `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', ...rest });`,
    `${ANTHROPIC} const base = { max_tokens: 5 }; a.messages.create({ model: 'claude-opus-4-5', ...base });`,
    // not an Anthropic client
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [] });`,
    // a computed key could be max_tokens
    `${ANTHROPIC} a.messages.create({ model: 'x', [key]: 1 });`,
  ],
  invalid: [
    {
      code: `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', messages: [] });`,
      // never auto-fixed: the right limit is the author's decision (suggestion only)
      output: null,
      errors: [
        {
          messageId: 'maxTokensRequired',
          suggestions: [
            {
              messageId: 'suggestAddMaxTokens',
              output: `${ANTHROPIC} a.messages.create({ max_tokens: 1024, model: 'claude-opus-4-5', messages: [] });`,
            },
          ],
        },
      ],
    },
    {
      code: `${ANTHROPIC} a.messages.stream({ model: 'claude-opus-4-5' });`,
      output: null,
      errors: [
        {
          messageId: 'maxTokensRequired',
          suggestions: [
            {
              messageId: 'suggestAddMaxTokens',
              output: `${ANTHROPIC} a.messages.stream({ max_tokens: 1024, model: 'claude-opus-4-5' });`,
            },
          ],
        },
      ],
    },
  ],
});
