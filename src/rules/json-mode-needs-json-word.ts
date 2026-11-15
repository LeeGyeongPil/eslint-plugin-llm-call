import type { Rule } from 'eslint';
import type { Node, Scope } from '../core/ast.js';
import { matchCall } from '../core/sdk-calls.js';
import { childObject, childValue, objectView, resolve, staticString, type ObjectView } from '../core/static-value.js';
import { messagesFor } from './common.js';

interface Options {
  countInstructions?: boolean;
}

/** Collect text from a message `content` (string or array of parts). Returns false if some text is not statically known. */
function contentTexts(scope: Scope, node: Node, out: string[]): boolean {
  const s = staticString(scope, node);
  if (s !== undefined) {
    out.push(s);
    return true;
  }
  const r = resolve(scope, node);
  if (r && r.node.type === 'ArrayExpression') {
    for (const el of r.node.elements) {
      if (!el) continue;
      const part = objectView(r.scope, el);
      if (!part || !part.complete) return false;
      const text = part.props.get('text');
      const type = childValue(part, 'type');
      if (text) {
        if (!contentTexts(text.scope, text.valueNode, out)) return false;
      } else if (type === 'text' || type === 'input_text') {
        return false;
      }
      // Non-text parts (images, files) carry no words; ignore them.
    }
    return true;
  }
  return false;
}

/** Collect all message texts from an array of message objects; false when anything is not statically known. */
function messageTexts(scope: Scope, node: Node, out: string[]): boolean {
  const r = resolve(scope, node);
  if (!r || r.node.type !== 'ArrayExpression') return false;
  for (const el of r.node.elements) {
    if (!el) continue;
    const msg = objectView(r.scope, el);
    if (!msg || !msg.complete) return false;
    const content = msg.props.get('content');
    if (!content) {
      if (msg.props.has('tool_calls')) continue;
      return false;
    }
    if (!contentTexts(content.scope, content.valueNode, out)) return false;
  }
  return true;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Require the word 'JSON' in the messages when JSON mode ('json_object') is used.",
      recommended: true,
    },
    messages: messagesFor(['jsonWordMissing']),
    schema: [
      {
        type: 'object',
        properties: { countInstructions: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const options = (context.options[0] ?? {}) as Options;
    const countInstructions = options.countInstructions !== false;

    return {
      CallExpression(node) {
        const site = matchCall(sourceCode, node, sourceCode.getScope(node));
        if (!site || site.provider !== 'openai') return;
        const view = objectView(site.scope, site.arg);
        if (!view || !view.complete) return;

        let formatHolder: ObjectView | undefined;
        let reportEntry;
        if (site.api === 'chat') {
          formatHolder = childObject(view, 'response_format');
          reportEntry = view.props.get('response_format');
        } else {
          formatHolder = childObject(childObject(view, 'text'), 'format');
          reportEntry = view.props.get('text');
        }
        if (!formatHolder || !reportEntry) return;
        if (childValue(formatHolder, 'type') !== 'json_object') return;

        const texts: string[] = [];
        let known: boolean;
        if (site.api === 'chat') {
          const messages = view.props.get('messages');
          known = messages ? messageTexts(messages.scope, messages.valueNode, texts) : false;
        } else {
          const input = view.props.get('input');
          if (!input) {
            known = false;
          } else {
            const asString = staticString(input.scope, input.valueNode);
            if (asString !== undefined) {
              texts.push(asString);
              known = true;
            } else {
              known = messageTexts(input.scope, input.valueNode, texts);
            }
          }
          const instructions = view.props.get('instructions');
          if (instructions && countInstructions) {
            const text = staticString(instructions.scope, instructions.valueNode);
            if (text === undefined) known = false;
            else texts.push(text);
          }
        }
        if (!known) return;
        if (texts.some((text) => /json/i.test(text))) return;
        context.report({ node: reportEntry.reportNode, messageId: 'jsonWordMissing' });
      },
    };
  },
};

export default rule;
