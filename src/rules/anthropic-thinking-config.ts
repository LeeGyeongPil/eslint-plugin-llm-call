import type { Rule } from 'eslint';
import { getTable, modelMatches } from '../core/model-table.js';
import { matchCall } from '../core/sdk-calls.js';
import { objectView, staticString, staticValue, UNKNOWN } from '../core/static-value.js';
import { getSettings, messagesFor } from './common.js';

/** Smallest `budget_tokens` the API accepts (source: the `anthropic-thinking-budget-min` table row). */
const MIN_BUDGET = 1024;

/**
 * Reports `thinking` settings that Anthropic `messages.create` rejects with a 400, only when the
 * values are literals. `budget_tokens >= max_tokens` is NOT reported (interleaved thinking allows it).
 * Which models each check applies to comes from the model table, so rows can be switched off.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow Anthropic 'thinking' settings that the API rejects with a 400 (literal values only).",
      recommended: true,
    },
    messages: messagesFor(['thinkingBudgetTooSmall', 'thinkingEnabledRejected', 'thinkingAdaptiveRejected']),
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const table = getTable(getSettings(context));
    return {
      CallExpression(node) {
        const site = matchCall(sourceCode, node, sourceCode.getScope(node));
        if (!site || site.provider !== 'anthropic' || site.api !== 'messages') return;
        const view = objectView(site.scope, site.arg);
        if (!view) return;
        const thinkingEntry = view.props.get('thinking');
        if (!thinkingEntry) return;
        const thinking = objectView(thinkingEntry.scope, thinkingEntry.valueNode);
        // A spread we cannot read might override any key, so stay silent.
        if (!thinking || !thinking.complete) return;

        const modelEntry = view.props.get('model');
        const model = modelEntry && view.complete ? staticString(modelEntry.scope, modelEntry.valueNode) : undefined;
        const typeEntry = thinking.props.get('type');
        const type = typeEntry ? staticString(typeEntry.scope, typeEntry.valueNode) : undefined;

        for (const row of table) {
          const r = row.rule;
          if (r.provider !== 'anthropic' || !r.thinkingCheck) continue;
          if (r.api !== 'any' && r.api !== 'messages') continue;
          if (!r.anyModel && !(model !== undefined && modelMatches(row, model))) continue;

          if (r.thinkingCheck === 'budget-min') {
            const budget = thinking.props.get('budget_tokens');
            if (!budget) continue;
            const value = staticValue(budget.scope, budget.valueNode);
            if (value === UNKNOWN || typeof value !== 'number' || value >= MIN_BUDGET) continue;
            context.report({
              node: budget.valueNode,
              messageId: 'thinkingBudgetTooSmall',
              data: { value: String(value), min: String(MIN_BUDGET) },
            });
          } else if (typeEntry && type === r.thinkingCheck) {
            context.report({
              node: typeEntry.valueNode,
              messageId: r.thinkingCheck === 'enabled' ? 'thinkingEnabledRejected' : 'thinkingAdaptiveRejected',
              data: { model: model ?? '?' },
            });
          }
        }
      },
    };
  },
};

export default rule;
