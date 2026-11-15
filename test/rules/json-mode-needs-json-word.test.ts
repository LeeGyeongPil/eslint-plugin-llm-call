import rule from '../../src/rules/json-mode-needs-json-word.js';
import { OPENAI, tester } from '../helpers.js';

const chat = (messages: string): string =>
  `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', response_format: { type: 'json_object' }, messages: ${messages} });`;
const responses = (body: string): string =>
  `${OPENAI} c.responses.create({ model: 'gpt-4o', text: { format: { type: 'json_object' } }, ${body} });`;

tester.run('json-mode-needs-json-word', rule, {
  valid: [
    chat(`[{ role: 'user', content: 'Reply in JSON with three colors' }]`),
    chat(`[{ role: 'system', content: 'You output json.' }, { role: 'user', content: 'colors' }]`),
    // the word may sit in a text part
    chat(`[{ role: 'user', content: [{ type: 'text', text: 'give me Json' }] }]`),
    // a message that is not statically known -> silent
    chat(`[{ role: 'user', content: userInput }]`),
    chat(`history`),
    chat(`[...history, { role: 'user', content: 'colors' }]`),
    // not json mode
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'colors' }] });`,
    // json_schema is a different mode and has no such requirement
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', response_format: { type: 'json_schema' }, messages: [{ role: 'user', content: 'colors' }] });`,
    responses(`input: 'Answer as JSON'`),
    responses(`input: userInput`),
    // instructions count by default
    responses(`instructions: 'Always answer in JSON.', input: 'colors'`),
    // unknown instructions might contain the word
    responses(`instructions: buildInstructions(), input: 'colors'`),
  ],
  invalid: [
    { code: chat(`[{ role: 'user', content: 'list three colors' }]`), errors: [{ messageId: 'jsonWordMissing' }] },
    {
      code: `${OPENAI} const MSG = 'list three colors'; c.chat.completions.create({ model: 'gpt-4o', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: MSG }] });`,
      errors: [{ messageId: 'jsonWordMissing' }],
    },
    { code: responses(`input: 'list three colors'`), errors: [{ messageId: 'jsonWordMissing' }] },
    {
      code: responses(`input: [{ role: 'user', content: [{ type: 'input_text', text: 'colors' }] }]`),
      errors: [{ messageId: 'jsonWordMissing' }],
    },
    // countInstructions: false -> instructions do not count (forum reports say the API ignores them for this check)
    {
      code: responses(`instructions: 'Always answer in JSON.', input: 'colors'`),
      options: [{ countInstructions: false }],
      errors: [{ messageId: 'jsonWordMissing' }],
    },
  ],
});
