import rule from '../../src/rules/anthropic-thinking-config.js';
import { ANTHROPIC, OPENAI, tester } from '../helpers.js';

const call = (model: string, thinking: string, extra = 'max_tokens: 20000') =>
  `${ANTHROPIC} a.messages.create({ model: '${model}', ${extra}, thinking: ${thinking}, messages: [] });`;
const enabled = (budget: number | string) => `{ type: 'enabled', budget_tokens: ${budget} }`;

tester.run('anthropic-thinking-config', rule, {
  valid: [
    // 1) budget_tokens at or above the minimum
    call('claude-opus-4-5', enabled(1024)),
    call('claude-opus-4-5', enabled(8000)),
    // 1) dynamic budget / dynamic thinking / dynamic model: silent
    call('claude-opus-4-5', enabled('budget')),
    call('claude-opus-4-5', 'thinkingConfig'),
    `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 5, thinking: { type: 'enabled', ...rest } });`,
    `${ANTHROPIC} a.messages.create({ model: process.env.M, max_tokens: 5, thinking: { type: 'adaptive' } });`,
    `${ANTHROPIC} a.messages.create({ model: process.env.M, max_tokens: 5, thinking: { type: 'enabled', budget_tokens: 2000 } });`,
    // budget_tokens >= max_tokens is not reported (interleaved thinking)
    call('claude-opus-4-5', enabled(20000), 'max_tokens: 4096'),
    call('claude-opus-4-5', enabled(4096), 'max_tokens: 4096'),
    // 2) 'enabled' on 4.5 and older models is fine; 4.6 is not in the table
    call('claude-sonnet-4-5', enabled(2048)),
    call('claude-opus-4-1-20250805', enabled(2048)),
    call('claude-opus-4-20250514', enabled(2048)),
    call('claude-3-7-sonnet-20250219', enabled(2048)),
    call('claude-opus-4-6', enabled(2048)),
    // 3) 'adaptive' on 4.7 and later is fine
    call('claude-opus-4-7', "{ type: 'adaptive' }"),
    call('claude-sonnet-5', "{ type: 'adaptive' }"),
    call('claude-opus-4-7-20260301', "{ type: 'adaptive' }"),
    // 3) 'adaptive' with a model that is not in the table (unknown / non-literal) is silent
    call('some-other-model', "{ type: 'adaptive' }"),
    // thinking disabled
    call('claude-opus-4-7', "{ type: 'disabled' }"),
    // no thinking at all / not an Anthropic client
    `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 5 });`,
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', thinking: { type: 'enabled', budget_tokens: 5 } });`,
    // user disables a row by id
    {
      code: call('claude-opus-4-5', enabled(100)),
      settings: { llmCall: { disable: ['anthropic-thinking-budget-min'] } },
    },
    {
      code: call('claude-opus-4-7', enabled(2048)),
      settings: { llmCall: { disable: ['anthropic-thinking-enabled-47'] } },
    },
    {
      code: call('claude-opus-4-5', "{ type: 'adaptive' }"),
      settings: { llmCall: { disable: ['anthropic-thinking-adaptive-45'] } },
    },
  ],
  invalid: [
    // 1) budget_tokens < 1024
    { code: call('claude-opus-4-5', enabled(512)), errors: [{ messageId: 'thinkingBudgetTooSmall', data: { value: '512', min: '1024' } }] },
    { code: call('claude-opus-4-5', enabled(1023)), errors: [{ messageId: 'thinkingBudgetTooSmall' }] },
    // 1) literal reached through a const
    {
      code: `${ANTHROPIC} const b = 100; a.messages.create({ model: 'claude-opus-4-5', max_tokens: 5000, thinking: { type: 'enabled', budget_tokens: b } });`,
      errors: [{ messageId: 'thinkingBudgetTooSmall' }],
    },
    // 1) the model does not need to be known
    {
      code: `${ANTHROPIC} a.messages.create({ model: process.env.M, max_tokens: 5000, thinking: { type: 'enabled', budget_tokens: 10 } });`,
      errors: [{ messageId: 'thinkingBudgetTooSmall' }],
    },
    // 2) 'enabled' on 4.7 and later
    { code: call('claude-opus-4-7', enabled(2048)), errors: [{ messageId: 'thinkingEnabledRejected', data: { model: 'claude-opus-4-7' } }] },
    { code: call('claude-sonnet-5', enabled(2048)), errors: [{ messageId: 'thinkingEnabledRejected' }] },
    { code: call('claude-opus-4-8-20260401', enabled(2048)), errors: [{ messageId: 'thinkingEnabledRejected' }] },
    { code: call('claude-haiku-10', enabled(2048)), errors: [{ messageId: 'thinkingEnabledRejected' }] },
    // 2) both problems in one call are both reported
    { code: call('claude-opus-4-7', enabled(10)), errors: [{ messageId: 'thinkingEnabledRejected' }, { messageId: 'thinkingBudgetTooSmall' }] },
    // 3) 'adaptive' on 4.5 and older
    { code: call('claude-opus-4-5', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected', data: { model: 'claude-opus-4-5' } }] },
    { code: call('claude-sonnet-4-5-20250929', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected' }] },
    { code: call('claude-haiku-4-5', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected' }] },
    { code: call('claude-opus-4-1', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected' }] },
    { code: call('claude-opus-4-20250514', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected' }] },
    { code: call('claude-3-7-sonnet-latest', "{ type: 'adaptive' }"), errors: [{ messageId: 'thinkingAdaptiveRejected' }] },
    // a model written as a const is still a literal
    {
      code: `${ANTHROPIC} const m = 'claude-opus-4-5'; a.messages.create({ model: m, max_tokens: 5, thinking: { type: 'adaptive' } });`,
      errors: [{ messageId: 'thinkingAdaptiveRejected' }],
    },
    // disabling one row leaves the others on
    {
      code: call('claude-opus-4-7', enabled(10)),
      settings: { llmCall: { disable: ['anthropic-thinking-budget-min'] } },
      errors: [{ messageId: 'thinkingEnabledRejected' }],
    },
  ],
});
