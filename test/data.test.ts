import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';
import { BUILTIN_MODELS, SCHEMA_RULES, type ModelRule } from '../src/core/model-table.js';
import { detectAnthropicSdkMajor } from '../src/core/sdk-version.js';
import { ANTHROPIC, OPENAI, newLinter, projectFile } from './helpers.js';

function lint(code: string, settings: object = {}, filename?: string): string[] {
  const linter = newLinter();
  const config = [{ ...plugin.configs.recommended, settings }];
  return linter
    .verify(code, config, { filename: filename ?? projectFile('data-default') })
    .map((m) => `${m.ruleId}: ${m.message}`);
}

describe('built-in table integrity', () => {
  it('has unique ids', () => {
    const ids = BUILTIN_MODELS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const row of BUILTIN_MODELS) {
    it(`row ${row.id} has an https source, a date and valid regular expressions`, () => {
      expect(row.source).toMatch(/^https:\/\/[^\s]+$/);
      expect(row.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.checked))).toBe(false);
      expect(() => new RegExp(row.match)).not.toThrow();
      if (row.exclude) expect(() => new RegExp(row.exclude as string)).not.toThrow();
      expect(row.forbid?.length || row.forbidTogether?.length || (row.thinkingCheck ? 1 : 0)).toBeGreaterThan(0);
    });
  }

  it('schema rules carry a source and a date', () => {
    expect(SCHEMA_RULES.source).toMatch(/^https:\/\//);
    expect(SCHEMA_RULES.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('settings.llmCall overrides', () => {
  const extra: ModelRule = {
    id: 'acme-no-top-k',
    provider: 'openai',
    api: 'chat',
    match: '^acme-',
    forbid: ['top_k'],
    message: 'reasoning',
    source: 'https://example.com/acme-docs',
    checked: '2026-11-16',
  };
  const call = `${OPENAI} c.chat.completions.create({ model: 'acme-1', top_k: 5 });`;

  it('is silent for an unknown model by default', () => {
    expect(lint(call)).toEqual([]);
  });

  it('reports a model added through settings.llmCall.models', () => {
    const result = lint(call, { llmCall: { models: [extra] } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("'top_k'");
  });

  it('a user row with a built-in id replaces the built-in row', () => {
    const replaced: ModelRule = { ...extra, id: 'openai-chat-reasoning-max-tokens', match: '^acme-', forbid: ['max_tokens'], replace: { max_tokens: 'max_completion_tokens' }, message: 'use' };
    const code = `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens: 5 });`;
    expect(lint(code, { llmCall: { models: [replaced] } })).toEqual([]);
  });

  it('disable switches a built-in row off', () => {
    const code = `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens: 5 });`;
    expect(lint(code)).toHaveLength(1);
    expect(lint(code, { llmCall: { disable: ['openai-chat-reasoning-max-tokens'] } })).toEqual([]);
  });

  it('rejects a row with a broken regular expression with a helpful message', () => {
    const bad = { ...extra, match: '(' };
    expect(() => lint(call, { llmCall: { models: [bad] } })).toThrow(/invalid regular expression/);
  });

  it('rejects a row without id', () => {
    expect(() => lint(call, { llmCall: { models: [{ provider: 'openai' } as unknown as ModelRule] } })).toThrow(/needs 'id'/);
  });
});

describe('anthropic SDK major', () => {
  const code = `${ANTHROPIC} a.messages.create({ model: 'claude-opus-4-5', max_tokens: 5, temperature: 0.5, top_p: 0.9 });`;

  it('is auto-detected from node_modules (0.x -> pair rule, 1.x -> sampling rule)', () => {
    expect(detectAnthropicSdkMajor(projectFile('d0', 0), '/')).toBe(0);
    expect(detectAnthropicSdkMajor(projectFile('d1', 1), '/')).toBe(1);
    expect(detectAnthropicSdkMajor(projectFile('d2', 2), '/')).toBe(1);
    expect(detectAnthropicSdkMajor(projectFile('dn'), '/')).toBeUndefined();
    expect(detectAnthropicSdkMajor('<input>', '/')).toBeUndefined();
  });

  it('settings.llmCall.anthropicSdkMajor beats auto-detection', () => {
    const file = projectFile('override', 0);
    const auto = lint(code, {}, file);
    expect(auto).toHaveLength(1);
    expect(auto[0]).toContain('together');
    const forced = lint(code, { llmCall: { anthropicSdkMajor: 1 } }, file);
    expect(forced).toHaveLength(2); // temperature and top_p, each rejected under SDK 1.x
    expect(forced.every((m) => m.includes('2026-10-21'))).toBe(true);
  });

  it('settings.llmCall.anthropicSdkMajor works when nothing is installed', () => {
    const file = projectFile('override-none');
    expect(lint(code, {}, file)).toEqual([]);
    expect(lint(code, { llmCall: { anthropicSdkMajor: 0 } }, file)).toHaveLength(1);
  });

  it('finds the SDK in a parent directory', () => {
    const file = projectFile('parent', 1);
    const nested = file.replace(/src\.js$/, 'deep/er/file.js');
    expect(detectAnthropicSdkMajor(nested, '/')).toBe(1);
  });
});
