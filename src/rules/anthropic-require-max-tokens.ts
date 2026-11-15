import type { Rule } from 'eslint';
import { matchCall } from '../core/sdk-calls.js';
import { objectView } from '../core/static-value.js';
import { messagesFor } from './common.js';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description: "Require 'max_tokens' in Anthropic messages.create calls (TypeScript catches this; plain JavaScript does not).",
      recommended: true,
    },
    messages: messagesFor(['maxTokensRequired', 'suggestAddMaxTokens']),
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        const site = matchCall(sourceCode, node, sourceCode.getScope(node));
        if (!site || site.provider !== 'anthropic' || site.api !== 'messages') return;
        const view = objectView(site.scope, site.arg);
        // Any spread (even a readable one) means we stay silent: the author may be composing the request elsewhere.
        if (!view || !view.complete || view.hasSpread) return;
        if (view.props.has('max_tokens')) return;
        context.report({
          node: site.arg,
          messageId: 'maxTokensRequired',
          suggest: [
            {
              messageId: 'suggestAddMaxTokens',
              fix: (fixer) => fixer.insertTextAfter(sourceCode.getFirstToken(site.arg)!, ' max_tokens: 1024,'),
            },
          ],
        });
      },
    };
  },
};

export default rule;
