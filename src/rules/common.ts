import type { Rule } from 'eslint';
import type { Node } from '../core/ast.js';
import type { LlmCallSettings } from '../core/model-table.js';
import { resolveLang, ruleMessages } from '../i18n/messages.js';

/** Messages for the given ids in the language chosen when the plugin is loaded. */
export function messagesFor(ids: string[]): Record<string, string> {
  const all = ruleMessages(resolveLang());
  const picked: Record<string, string> = {};
  for (const id of ids) {
    const text = all[id];
    if (text === undefined) throw new Error(`eslint-plugin-llm-call: missing message '${id}'`);
    picked[id] = text;
  }
  return picked;
}

export function getSettings(context: Rule.RuleContext): LlmCallSettings | undefined {
  const settings = context.settings as { llmCall?: LlmCallSettings } | undefined;
  return settings?.llmCall;
}

/** Fix that deletes a property together with one adjacent comma and the whitespace up to the next token. */
export function removeProperty(
  fixer: Rule.RuleFixer,
  sourceCode: Rule.RuleContext['sourceCode'],
  property: Node,
): Rule.Fix {
  const next = sourceCode.getTokenAfter(property);
  if (next && next.value === ',') {
    const afterComma = sourceCode.getTokenAfter(next, { includeComments: true });
    const end = afterComma && afterComma.range ? afterComma.range[0] : next.range[1];
    return fixer.removeRange([property.range[0], end]);
  }
  const prev = sourceCode.getTokenBefore(property);
  if (prev && prev.value === ',') return fixer.removeRange([prev.range[0], property.range[1]]);
  return fixer.remove(property);
}
