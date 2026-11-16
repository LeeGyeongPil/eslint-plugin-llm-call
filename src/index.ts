import type { ESLint, Linter } from 'eslint';
import { PACKAGE_VERSION } from './core/pkg.js';
import anthropicRequireMaxTokens from './rules/anthropic-require-max-tokens.js';
import anthropicThinkingConfig from './rules/anthropic-thinking-config.js';
import jsonModeNeedsJsonWord from './rules/json-mode-needs-json-word.js';
import noUnsupportedParam from './rules/no-unsupported-param.js';
import strictSchemaShape from './rules/strict-schema-shape.js';

export type { LlmCallSettings, ModelRule } from './core/model-table.js';

const rules = {
  'no-unsupported-param': noUnsupportedParam,
  'json-mode-needs-json-word': jsonModeNeedsJsonWord,
  'strict-schema-shape': strictSchemaShape,
  'anthropic-require-max-tokens': anthropicRequireMaxTokens,
  'anthropic-thinking-config': anthropicThinkingConfig,
};

const plugin = {
  meta: { name: 'eslint-plugin-llm-call', version: PACKAGE_VERSION },
  rules,
  configs: {} as { recommended: Linter.Config },
} satisfies ESLint.Plugin;

plugin.configs.recommended = {
  name: 'llm-call/recommended',
  plugins: { 'llm-call': plugin },
  rules: {
    'llm-call/no-unsupported-param': 'error',
    'llm-call/json-mode-needs-json-word': 'error',
    'llm-call/strict-schema-shape': 'error',
    'llm-call/anthropic-require-max-tokens': 'error',
    'llm-call/anthropic-thinking-config': 'error',
  },
};

export default plugin;
