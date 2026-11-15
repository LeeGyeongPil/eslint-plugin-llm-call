import type { Linter } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG, isLang, resolveLang, t, type MessageKey } from '../src/i18n/messages.js';
import { main } from '../src/cli.js';
import { OPENAI, newLinter, projectFile } from './helpers.js';

function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  return main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd: process.cwd() }).then((code) => ({
    code,
    out: out.join('\n'),
    err: err.join('\n'),
  }));
}

describe('message catalog', () => {
  it('has identical keys in en and ko', () => {
    expect(Object.keys(CATALOG.ko).sort()).toEqual(Object.keys(CATALOG.en).sort());
  });

  it('uses the same placeholders in both languages', () => {
    const names = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] as string).sort();
    for (const key of Object.keys(CATALOG.en) as MessageKey[]) {
      expect(names(CATALOG.ko[key]), key).toEqual(names(CATALOG.en[key]));
    }
  });

  it('no message is empty', () => {
    for (const lang of ['en', 'ko'] as const) {
      for (const [key, text] of Object.entries(CATALOG[lang])) expect(text.trim(), `${lang}:${key}`).not.toBe('');
    }
  });

  it('fills placeholders', () => {
    expect(t('en', 'cli.summary', { count: 3, files: 2 })).toBe('Found 3 problem(s) in 2 file(s).');
  });
});

describe('language decision order', () => {
  it('--lang beats everything', () => {
    expect(resolveLang('ko', { LLM_CALL_LINT_LANG: 'en', LANG: 'en_US.UTF-8' })).toBe('ko');
    expect(resolveLang('en', { LLM_CALL_LINT_LANG: 'ko', LANG: 'ko_KR.UTF-8' })).toBe('en');
  });

  it('LLM_CALL_LINT_LANG beats LC_ALL, LC_MESSAGES and LANG', () => {
    expect(resolveLang(undefined, { LLM_CALL_LINT_LANG: 'ko', LC_ALL: 'en_US', LANG: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LLM_CALL_LINT_LANG: 'en', LC_ALL: 'ko_KR', LANG: 'ko_KR' })).toBe('en');
  });

  it('LC_ALL beats LC_MESSAGES beats LANG', () => {
    expect(resolveLang(undefined, { LC_ALL: 'ko_KR.UTF-8', LC_MESSAGES: 'en_US', LANG: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LC_MESSAGES: 'ko_KR.UTF-8', LANG: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LANG: 'ko_KR.UTF-8' })).toBe('ko');
    expect(resolveLang(undefined, { LC_ALL: 'en_US', LC_MESSAGES: 'ko_KR', LANG: 'ko_KR' })).toBe('en');
  });

  it('falls back to English when nothing says Korean', () => {
    expect(resolveLang(undefined, {})).toBe('en');
    expect(resolveLang(undefined, { LANG: 'fr_FR.UTF-8' })).toBe('en');
    expect(resolveLang(undefined, { LANG: 'C' })).toBe('en');
    expect(resolveLang(undefined, { LLM_CALL_LINT_LANG: '', LANG: 'ko_KR' })).toBe('ko'); // empty values are ignored
  });

  it('isLang validates', () => {
    expect(isLang('ko')).toBe(true);
    expect(isLang('fr')).toBe(false);
  });
});

describe('table command language', () => {
  it('--lang ko prints Korean headers', async () => {
    const { code, out } = await run(['table', '--provider', 'openai', '--lang', 'ko']);
    expect(code).toBe(0);
    expect(out).toContain('모델');
    expect(out).toContain('확인 날짜');
    expect(out).not.toContain('Model');
  });

  it('--lang en prints English headers', async () => {
    const { out } = await run(['table', '--provider', 'openai', '--lang', 'en']);
    expect(out).toContain('Model');
    expect(out).toContain('Checked');
    expect(out).not.toContain('모델');
  });

  it('--lang overrides LLM_CALL_LINT_LANG', async () => {
    vi.stubEnv('LLM_CALL_LINT_LANG', 'ko');
    const { out } = await run(['table', '--lang', 'en']);
    expect(out).toContain('Model');
    vi.unstubAllEnvs();
  });

  it('LLM_CALL_LINT_LANG selects the language without --lang', async () => {
    vi.stubEnv('LLM_CALL_LINT_LANG', 'ko');
    const { out } = await run(['table']);
    expect(out).toContain('모델');
    vi.unstubAllEnvs();
  });
});

describe('rule messages follow LLM_CALL_LINT_LANG', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function messageFor(lang: string): Promise<string> {
    vi.stubEnv('LLM_CALL_LINT_LANG', lang);
    vi.resetModules();
    const { default: plugin } = await import('../src/index.js');
    const code = `${OPENAI} c.chat.completions.create({ model: 'o4-mini', max_tokens: 5 });`;
    const messages = newLinter().verify(code, [plugin.configs.recommended], { filename: projectFile('i18n') });
    expect(messages).toHaveLength(1);
    return (messages[0] as Linter.LintMessage).message;
  }

  it('Korean when LLM_CALL_LINT_LANG=ko', async () => {
    expect(await messageFor('ko')).toBe("모델 'o4-mini'은(는) 'max_tokens'을(를) 거부합니다. 'max_completion_tokens'을(를) 쓰세요.");
  });

  it('English when LLM_CALL_LINT_LANG=en', async () => {
    expect(await messageFor('en')).toBe("Model 'o4-mini' rejects 'max_tokens'; use 'max_completion_tokens' instead.");
  });
});
