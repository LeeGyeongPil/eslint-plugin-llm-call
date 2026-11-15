import rule from '../../src/rules/strict-schema-shape.js';
import { OPENAI, tester } from '../helpers.js';

/** Chat call with a json_schema response format. */
const chatSchema = (schema: string, strict = 'true'): string =>
  `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [], response_format: { type: 'json_schema', json_schema: { name: 'x', strict: ${strict}, schema: ${schema} } } });`;
const responsesSchema = (schema: string): string =>
  `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'x', text: { format: { type: 'json_schema', name: 'x', strict: true, schema: ${schema} } } });`;
const chatTool = (parameters: string): string =>
  `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [], tools: [{ type: 'function', function: { name: 'f', strict: true, parameters: ${parameters} } }] });`;
const responsesTool = (parameters: string): string =>
  `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'x', tools: [{ type: 'function', name: 'f', strict: true, parameters: ${parameters} }] });`;

const GOOD = `{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false }`;

/** Build a schema with `n` object levels nested below the root. */
function nested(n: number): string {
  let inner = `{ type: 'object', properties: { leaf: { type: 'string' } }, required: ['leaf'], additionalProperties: false }`;
  for (let i = 0; i < n; i++) {
    inner = `{ type: 'object', properties: { child: ${inner} }, required: ['child'], additionalProperties: false }`;
  }
  return inner;
}

const NO_AP_ROOT = `{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }`;
const WITH_AP_ROOT = `{ additionalProperties: false, type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }`;

tester.run('strict-schema-shape', rule, {
  valid: [
    chatSchema(GOOD),
    responsesSchema(GOOD),
    chatSchema(nested(10)),
    chatTool(GOOD),
    responsesTool(GOOD),
    // strict not set / false -> not our business
    chatSchema(`{ type: 'object', properties: { a: { type: 'string' } } }`, 'false'),
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [], response_format: { type: 'json_schema', json_schema: { name: 'x', schema: { type: 'object', properties: { a: {} } } } } });`,
    `${OPENAI} c.responses.create({ model: 'gpt-4o', input: 'x', tools: [{ type: 'function', name: 'f', parameters: { type: 'object', properties: { a: {} } } }] });`,
    // helper result is not a literal -> silent
    `${OPENAI} c.chat.completions.create({ model: 'gpt-4o', messages: [], response_format: zodResponseFormat(Schema, 'x') });`,
    // schema is not statically known
    chatSchema(`mySchema`),
    // unknown spread inside an object: requirements might come from the spread -> skip that object
    chatSchema(`{ type: 'object', properties: { a: { type: 'string' } }, ...extra }`),
  ],
  invalid: [
    {
      // nested object lacks additionalProperties; the root is fine
      code: chatSchema(
        `{ type: 'object', properties: { addr: { type: 'object', properties: { zip: { type: 'string' } }, required: ['zip'] } }, required: ['addr'], additionalProperties: false }`,
      ),
      errors: [
        {
          messageId: 'missingAdditionalProperties',
          data: { path: '$.addr' },
          suggestions: [
            {
              messageId: 'suggestAddAdditionalProperties',
              output: chatSchema(
                `{ type: 'object', properties: { addr: { additionalProperties: false, type: 'object', properties: { zip: { type: 'string' } }, required: ['zip'] } }, required: ['addr'], additionalProperties: false }`,
              ),
            },
          ],
        },
      ],
    },
    {
      // required lists only some properties: names the missing one
      code: chatSchema(
        `{ type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a'], additionalProperties: false }`,
      ),
      errors: [{ messageId: 'missingRequired', data: { path: '$', names: 'b' } }],
    },
    {
      // required missing entirely: reported at the object
      code: responsesSchema(`{ type: 'object', properties: { a: {}, b: {} }, additionalProperties: false }`),
      errors: [{ messageId: 'missingRequired', data: { path: '$', names: 'a, b' } }],
    },
    {
      code: chatSchema(`{ anyOf: [${GOOD}, ${GOOD}] }`),
      errors: [{ messageId: 'rootAnyOf' }],
    },
    {
      code: chatSchema(`{ type: 'array', items: { type: 'string' } }`),
      errors: [{ messageId: 'rootNotObject', data: { type: 'array' } }],
    },
    {
      code: chatSchema(
        `{ type: 'object', properties: { a: { allOf: [{ type: 'string' }] } }, required: ['a'], additionalProperties: false }`,
      ),
      errors: [{ messageId: 'unsupportedKeyword', data: { keyword: 'allOf', path: '$.a' } }],
    },
    {
      code: chatSchema(
        `{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false, if: { properties: {} }, not: {} }`,
      ),
      errors: [
        { messageId: 'unsupportedKeyword', data: { keyword: 'if', path: '$' } },
        { messageId: 'unsupportedKeyword', data: { keyword: 'not', path: '$' } },
      ],
    },
    {
      code: chatSchema(`{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: true }`),
      errors: [{ messageId: 'missingAdditionalProperties', data: { path: '$' } }],
    },
    {
      // 11 nested object levels below the root
      code: chatSchema(nested(11)),
      errors: [{ messageId: 'tooDeep', data: { max: 10, path: `$${'.child'.repeat(11)}` } }],
    },
    {
      code: chatTool(NO_AP_ROOT),
      errors: [
        {
          messageId: 'missingAdditionalProperties',
          suggestions: [{ messageId: 'suggestAddAdditionalProperties', output: chatTool(WITH_AP_ROOT) }],
        },
      ],
    },
    {
      code: responsesTool(`{ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false }`),
      errors: [{ messageId: 'missingRequired', data: { path: '$', names: 'a' } }],
    },
    {
      // schema held in a same-file const
      code: `${OPENAI} const S = ${NO_AP_ROOT}; c.responses.create({ model: 'gpt-4o', input: 'x', text: { format: { type: 'json_schema', name: 'x', strict: true, schema: S } } });`,
      errors: [
        {
          messageId: 'missingAdditionalProperties',
          suggestions: [
            {
              messageId: 'suggestAddAdditionalProperties',
              output: `${OPENAI} const S = ${WITH_AP_ROOT}; c.responses.create({ model: 'gpt-4o', input: 'x', text: { format: { type: 'json_schema', name: 'x', strict: true, schema: S } } });`,
            },
          ],
        },
      ],
    },
  ],
});
