import type { Rule } from 'eslint';
import type { Node } from '../core/ast.js';
import { getTable, modelMatches, type CompiledRule } from '../core/model-table.js';
import { detectAnthropicSdkMajor } from '../core/sdk-version.js';
import { matchCall, type CallSite } from '../core/sdk-calls.js';
import { objectView, staticString, staticValue, UNKNOWN, type ObjectView } from '../core/static-value.js';
import { getSettings, messagesFor, removeProperty } from './common.js';

const MESSAGE_FOR: Record<string, string> = {
  use: 'rejectedUse',
  noModelUse: 'rejectedNoModelUse',
  reasoning: 'rejectedReasoning',
  effort: 'rejectedEffort',
  sdk1: 'rejectedSdk1',
  pair: 'rejectedPair',
};

type Allowed = 'allow' | 'deny' | 'unknown';

/** Evaluate a row's allowWhen conditions against the request object. */
function evaluateAllow(row: CompiledRule, view: ObjectView): { state: Allowed; effort: string } {
  const conditions = row.rule.allowWhen;
  if (!conditions || conditions.length === 0) return { state: 'deny', effort: 'not set' };
  let sawUnknown = false;
  let seen = 'not set';
  for (const cond of conditions) {
    let cur: ObjectView | undefined = view;
    let valueNode: { scope: unknown; node: Node } | undefined;
    for (let i = 0; i < cond.path.length && cur; i++) {
      const entry: ReturnType<ObjectView['props']['get']> = cur.props.get(cond.path[i] as string);
      if (!entry) {
        // Absent key: only a definite "not set" when the object is fully known.
        if (!cur.complete) sawUnknown = true;
        cur = undefined;
        break;
      }
      if (i === cond.path.length - 1) {
        valueNode = { scope: entry.scope, node: entry.valueNode };
        cur = undefined;
      } else {
        const next = objectView(entry.scope, entry.valueNode);
        if (!next) sawUnknown = true;
        cur = next;
      }
    }
    if (valueNode) {
      const value = staticValue(valueNode.scope, valueNode.node);
      if (value === UNKNOWN) sawUnknown = true;
      else if (value === cond.equals) return { state: 'allow', effort: String(value) };
      else seen = `reasoning effort: ${String(value)}`;
    }
  }
  // No effort value was written anywhere: the default effort is not confirmed by a source,
  // so stay silent instead of guessing. Only an explicit non-'none' literal is reported.
  const sawLiteral = seen !== 'not set';
  return { state: sawUnknown || !view.complete || !sawLiteral ? 'unknown' : 'deny', effort: seen };
}

function rule(): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      fixable: 'code',
      hasSuggestions: true,
      docs: {
        description: 'Disallow request parameters that the targeted model or SDK version rejects.',
        recommended: true,
      },
      messages: messagesFor([
        'rejectedUse',
        'rejectedNoModelUse',
        'rejectedReasoning',
        'rejectedEffort',
        'rejectedSdk1',
        'rejectedPair',
        'suggestRemove',
      ]),
      schema: [],
    },
    create(context) {
      const sourceCode = context.sourceCode;
      const table = getTable(getSettings(context));
      const settings = getSettings(context);
      let sdkMajor: 0 | 1 | undefined | null = null; // null = not computed yet

      const anthropicMajor = (): 0 | 1 | undefined => {
        if (sdkMajor === null) {
          sdkMajor = settings?.anthropicSdkMajor ?? detectAnthropicSdkMajor(context.filename, context.cwd);
        }
        return sdkMajor;
      };

      function check(site: CallSite): void {
        const view = objectView(site.scope, site.arg);
        if (!view) return;
        const model =
          view.props.has('model') && view.complete
            ? staticString(view.props.get('model')!.scope, view.props.get('model')!.valueNode)
            : undefined;

        for (const row of table) {
          const r = row.rule;
          if (r.provider !== site.provider) continue;
          if (r.api !== 'any' && r.api !== site.api) continue;
          if (r.sdkMajor !== undefined) {
            if (site.provider !== 'anthropic' || anthropicMajor() !== r.sdkMajor) continue;
          }
          if (!r.anyModel && !(model !== undefined && modelMatches(row, model))) continue;

          for (const param of r.forbid ?? []) {
            const entry = view.props.get(param);
            if (!entry) continue;
            let effortText = '';
            if (r.allowWhen) {
              const verdict = evaluateAllow(row, view);
              if (verdict.state !== 'deny') continue;
              effortText = verdict.effort;
            }
            const replacement = r.replace?.[param];
            const messageId = MESSAGE_FOR[r.message ?? (replacement ? 'use' : 'reasoning')] ?? 'rejectedReasoning';
            const direct = entry.property as Node | undefined;
            // A computed key (`[k]: 1`) is only reported: renaming it would reference an undeclared identifier.
            const canFix = direct && !direct.computed && replacement && !view.props.has(replacement);
            context.report({
              node: entry.reportNode,
              messageId,
              data: {
                model: model ?? '?',
                param,
                replacement: replacement ?? '',
                effort: effortText,
                sdk: String(r.sdkMajor ?? ''),
              },
              fix: canFix
                ? (fixer) =>
                    direct.shorthand
                      ? fixer.replaceText(direct, `${replacement}: ${param}`)
                      : fixer.replaceText(direct.key, replacement)
                : null,
              suggest:
                direct && !replacement
                  ? [{ messageId: 'suggestRemove', data: { param }, fix: (fixer) => removeProperty(fixer, sourceCode, direct) }]
                  : [],
            });
          }

          for (const group of r.forbidTogether ?? []) {
            const entries = group.map((name) => view.props.get(name));
            if (entries.some((e) => !e)) continue;
            const last = entries[entries.length - 1]!;
            const lastProperty = last.property as Node | undefined;
            context.report({
              node: last.reportNode,
              messageId: MESSAGE_FOR[r.message ?? 'pair'] ?? 'rejectedPair',
              data: { model: model ?? '?', param: last.name, other: group[0] as string },
              suggest: lastProperty
                ? [
                    {
                      messageId: 'suggestRemove',
                      data: { param: last.name },
                      fix: (fixer) => removeProperty(fixer, sourceCode, lastProperty),
                    },
                  ]
                : [],
            });
          }
        }
      }

      return {
        CallExpression(node) {
          const site = matchCall(sourceCode, node, sourceCode.getScope(node));
          if (site) check(site);
        },
      };
    },
  };
}

export default rule();
