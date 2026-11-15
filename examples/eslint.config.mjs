// Flat config used by `npm run demo`: the TypeScript parser plus this plugin's recommended rules.
import tsParser from '@typescript-eslint/parser';
import llmCall from 'eslint-plugin-llm-call';

export default [
  { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
  llmCall.configs.recommended,
];
