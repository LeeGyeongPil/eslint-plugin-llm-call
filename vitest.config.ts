import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Rule messages are resolved once at module load; pin English so the
    // developer's own LANG does not change test expectations.
    env: { LLM_CALL_LINT_LANG: 'en' },
    testTimeout: 30000,
  },
});
