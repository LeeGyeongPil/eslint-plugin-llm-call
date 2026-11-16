import { readFileSync } from 'node:fs';
import type { Api, Provider } from './sdk-calls.js';

/** One row of the model constraint table. Every row carries the source URL and the date it was checked. */
export interface ModelRule {
  /** Unique id; a user entry with the same id replaces the built-in one. */
  id: string;
  provider: Provider;
  /** Which API the row applies to; `any` covers every API of the provider. */
  api: Api | 'any';
  /** Regular expression source matched against the model id. */
  match: string;
  /** Model ids matching this expression are excluded from the row. */
  exclude?: string;
  /** Apply even when the model id is unknown (the parameter is invalid for every model). */
  anyModel?: boolean;
  /** Required Anthropic SDK major version (0 or 1). */
  sdkMajor?: 0 | 1;
  /** Literal `thinking` check handled by the `anthropic-thinking-config` rule. */
  thinkingCheck?: 'budget-min' | 'enabled' | 'adaptive';
  /** Parameters that are rejected. */
  forbid?: string[];
  /** Groups of parameters that are rejected when sent together. */
  forbidTogether?: string[][];
  /** Replacement parameter names, enabling an autofix. */
  replace?: Record<string, string>;
  /** The forbidden parameters are accepted when any of these conditions holds. */
  allowWhen?: AllowCondition[];
  /** Which message template to use. */
  message?: 'use' | 'noModelUse' | 'reasoning' | 'effort' | 'sdk1' | 'pair';
  source: string;
  /** YYYY-MM-DD date the row was last checked against the source. */
  checked: string;
}

export interface AllowCondition {
  path: string[];
  equals: string | number | boolean;
}

/** Shared `settings.llmCall` object. */
export interface LlmCallSettings {
  /** Extra or replacement rows (same `id` replaces a built-in row). */
  models?: ModelRule[];
  /** Row ids to switch off. */
  disable?: string[];
  /** Anthropic SDK major version; overrides auto-detection. */
  anthropicSdkMajor?: 0 | 1;
}

export interface SchemaRules {
  unsupportedKeywords: string[];
  maxNestingDepth: number;
  maxProperties: number;
  source: string;
  checked: string;
}

export const BUILTIN_MODELS = JSON.parse(
  readFileSync(new URL('../data/models.json', import.meta.url), 'utf8'),
) as ModelRule[];

export const SCHEMA_RULES = JSON.parse(
  readFileSync(new URL('../data/schema-rules.json', import.meta.url), 'utf8'),
) as SchemaRules;

export interface CompiledRule {
  rule: ModelRule;
  match: RegExp;
  exclude?: RegExp;
}

function compile(rule: ModelRule): CompiledRule {
  try {
    return {
      rule,
      match: new RegExp(rule.match),
      exclude: rule.exclude ? new RegExp(rule.exclude) : undefined,
    };
  } catch (error) {
    throw new Error(
      `eslint-plugin-llm-call: model rule '${rule.id}' has an invalid regular expression ` +
        `(${error instanceof Error ? error.message : String(error)}). ` +
        `Fix 'match'/'exclude' in settings.llmCall.models.`,
    );
  }
}

function validateUserRule(rule: ModelRule): void {
  if (!rule || typeof rule.id !== 'string' || typeof rule.match !== 'string' || !rule.provider) {
    throw new Error(
      "eslint-plugin-llm-call: each settings.llmCall.models entry needs 'id', 'provider' and 'match' " +
        '(see `npx eslint-plugin-llm-call table --json` for examples).',
    );
  }
}

/** Merge the built-in table with user settings: add / replace by id, then drop disabled ids. */
export function mergeTable(settings: LlmCallSettings | undefined): ModelRule[] {
  const byId = new Map<string, ModelRule>();
  for (const rule of BUILTIN_MODELS) byId.set(rule.id, rule);
  for (const rule of settings?.models ?? []) {
    validateUserRule(rule);
    byId.set(rule.id, rule);
  }
  for (const id of settings?.disable ?? []) byId.delete(id);
  return [...byId.values()];
}

const compiledCache = new WeakMap<object, CompiledRule[]>();
let builtinCompiled: CompiledRule[] | undefined;

/** Compiled table for the given settings (cached per settings object). */
export function getTable(settings: LlmCallSettings | undefined): CompiledRule[] {
  if (!settings) return (builtinCompiled ??= mergeTable(undefined).map(compile));
  let compiled = compiledCache.get(settings);
  if (!compiled) {
    compiled = mergeTable(settings).map(compile);
    compiledCache.set(settings, compiled);
  }
  return compiled;
}

export function modelMatches(c: CompiledRule, model: string): boolean {
  return c.match.test(model) && !(c.exclude && c.exclude.test(model));
}
