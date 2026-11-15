import type { Rule } from 'eslint';
import type { Node } from '../core/ast.js';
import { SCHEMA_RULES } from '../core/model-table.js';
import { matchCall, type CallSite } from '../core/sdk-calls.js';
import {
  childObject,
  childValue,
  objectView,
  resolve,
  staticString,
  type ObjectView,
} from '../core/static-value.js';
import { messagesFor } from './common.js';

const UNSUPPORTED = new Set(SCHEMA_RULES.unsupportedKeywords);

interface Counter {
  properties: number;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description: 'Check inline JSON Schema literals used with strict structured outputs / strict function tools.',
      recommended: true,
    },
    messages: messagesFor([
      'missingAdditionalProperties',
      'suggestAddAdditionalProperties',
      'missingRequired',
      'rootNotObject',
      'rootAnyOf',
      'unsupportedKeyword',
      'tooDeep',
      'tooManyProperties',
    ]),
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    /** Recursively check one schema node. `level` counts nested object schemas (root object = 0). */
    function checkSchema(view: ObjectView, path: string, isRoot: boolean, level: number, counter: Counter): void {
      const node = view.node as Node;
      const type = childValue(view, 'type');

      for (const keyword of UNSUPPORTED) {
        const entry = view.props.get(keyword);
        if (entry) context.report({ node: entry.reportNode, messageId: 'unsupportedKeyword', data: { keyword, path } });
      }

      if (isRoot) {
        if (view.props.has('anyOf')) {
          context.report({ node: view.props.get('anyOf')!.reportNode, messageId: 'rootAnyOf' });
        } else if (typeof type === 'string' && type !== 'object') {
          context.report({ node, messageId: 'rootNotObject', data: { type } });
        }
      }

      const propertiesEntry = view.props.get('properties');
      const isObject = type === 'object' || (type === undefined && propertiesEntry !== undefined);

      if (isObject) {
        if (level > SCHEMA_RULES.maxNestingDepth) {
          context.report({
            node,
            messageId: 'tooDeep',
            data: { max: SCHEMA_RULES.maxNestingDepth, path },
          });
          return; // do not report the same problem again at every deeper level
        }
        checkObject(view, path, counter);
      }

      // Descend into sub-schemas that we can read.
      const props = propertiesEntry ? objectView(propertiesEntry.scope, propertiesEntry.valueNode) : undefined;
      if (props) {
        for (const [name, entry] of props.props) {
          const child = objectView(entry.scope, entry.valueNode);
          if (child) checkSchema(child, `${path}.${name}`, false, level + (isObject ? 1 : 0), counter);
        }
      }
      const items = childObject(view, 'items');
      if (items) checkSchema(items, `${path}[]`, false, level, counter);
      for (const key of ['anyOf', 'oneOf']) {
        const entry = view.props.get(key);
        const arr = entry ? resolve(entry.scope, entry.valueNode) : undefined;
        if (arr && arr.node.type === 'ArrayExpression') {
          for (const el of arr.node.elements as Node[]) {
            const child = el ? objectView(arr.scope, el) : undefined;
            if (child) checkSchema(child, `${path}|${key}`, false, level, counter);
          }
        }
      }
      for (const key of ['$defs', 'definitions']) {
        const defs = childObject(view, key);
        if (!defs) continue;
        for (const [name, entry] of defs.props) {
          const child = objectView(entry.scope, entry.valueNode);
          if (child) checkSchema(child, `${path}.${key}.${name}`, false, level, counter);
        }
      }
    }

    function checkObject(view: ObjectView, path: string, counter: Counter): void {
      const node = view.node as Node;
      const propertiesEntry = view.props.get('properties');
      const properties = propertiesEntry ? objectView(propertiesEntry.scope, propertiesEntry.valueNode) : undefined;
      if (properties) counter.properties += properties.props.size;

      // additionalProperties must be exactly false. If the object has an unreadable spread we cannot know.
      const ap = view.props.get('additionalProperties');
      if (ap) {
        const value = childValue(view, 'additionalProperties');
        if (value === false) {
          /* ok */
        } else if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
          reportMissingAdditional(ap.reportNode, path, undefined);
        } else if (value === null) {
          reportMissingAdditional(ap.reportNode, path, undefined);
        }
        // object value (a schema) or unknown: strict mode rejects schemas too, but stay silent when unsure
      } else if (view.complete && node.type === 'ObjectExpression') {
        reportMissingAdditional(node, path, node);
      }

      // required must list every property
      if (properties && properties.complete && properties.props.size > 0) {
        const names = [...properties.props.keys()];
        const reqEntry = view.props.get('required');
        if (!reqEntry) {
          if (view.complete) {
            context.report({ node, messageId: 'missingRequired', data: { path, names: names.join(', ') } });
          }
          return;
        }
        const req = resolve(reqEntry.scope, reqEntry.valueNode);
        if (!req || req.node.type !== 'ArrayExpression') return;
        const listed = new Set<string>();
        for (const el of req.node.elements as Node[]) {
          const s = el ? staticString(req.scope, el) : undefined;
          if (s === undefined) return; // unknown element: skip
          listed.add(s);
        }
        const missing = names.filter((n) => !listed.has(n));
        if (missing.length > 0) {
          context.report({
            node: reqEntry.reportNode,
            messageId: 'missingRequired',
            data: { path, names: missing.join(', ') },
          });
        }
      }
    }

    function reportMissingAdditional(target: Node, path: string, insertInto: Node | undefined): void {
      context.report({
        node: target,
        messageId: 'missingAdditionalProperties',
        data: { path },
        suggest: insertInto
          ? [
              {
                messageId: 'suggestAddAdditionalProperties',
                fix: (fixer) => {
                  const open = sourceCode.getFirstToken(insertInto)!;
                  return fixer.insertTextAfter(open, ' additionalProperties: false,');
                },
              },
            ]
          : [],
      });
    }

    function checkStrictSchema(holder: ObjectView, schemaKey: string): void {
      // `holder` is the object that has `strict` and the schema under `schemaKey`.
      if (childValue(holder, 'strict') !== true) return;
      const entry = holder.props.get(schemaKey);
      if (!entry) return;
      const schema = objectView(entry.scope, entry.valueNode);
      if (!schema) return;
      const counter: Counter = { properties: 0 };
      checkSchema(schema, '$', true, 0, counter);
      if (counter.properties > SCHEMA_RULES.maxProperties) {
        context.report({
          node: schema.node,
          messageId: 'tooManyProperties',
          data: { max: SCHEMA_RULES.maxProperties, count: counter.properties },
        });
      }
    }

    function checkTools(view: ObjectView, site: CallSite): void {
      const tools = view.props.get('tools');
      if (!tools) return;
      const arr = resolve(tools.scope, tools.valueNode);
      if (!arr || arr.node.type !== 'ArrayExpression') return;
      for (const el of arr.node.elements as Node[]) {
        const tool = el ? objectView(arr.scope, el) : undefined;
        if (!tool) continue;
        if (site.api === 'chat') {
          const fn = childObject(tool, 'function');
          if (fn) checkStrictSchema(fn, 'parameters');
        } else if (childValue(tool, 'type') === 'function') {
          checkStrictSchema(tool, 'parameters');
        }
      }
    }

    return {
      CallExpression(node) {
        const site = matchCall(sourceCode, node, sourceCode.getScope(node));
        if (!site || site.provider !== 'openai') return;
        const view = objectView(site.scope, site.arg);
        if (!view) return;
        if (site.api === 'chat') {
          const jsonSchema = childObject(childObject(view, 'response_format'), 'json_schema');
          if (jsonSchema) checkStrictSchema(jsonSchema, 'schema');
        } else {
          const format = childObject(childObject(view, 'text'), 'format');
          if (format && childValue(format, 'type') === 'json_schema') checkStrictSchema(format, 'schema');
        }
        checkTools(view, site);
      },
    };
  },
};

export default rule;
