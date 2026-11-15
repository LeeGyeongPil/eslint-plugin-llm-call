import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLintError, main } from '../src/cli.js';
import { PACKAGE_VERSION } from '../src/core/pkg.js';

async function run(argv: string[], cwd = process.cwd()): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), cwd });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('cli basics', () => {
  it('--version prints the package version', async () => {
    const { code, out } = await run(['--version']);
    expect(code).toBe(0);
    expect(out).toBe(PACKAGE_VERSION);
  });

  it('--help lists the commands and exits 0', async () => {
    const { code, out } = await run(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('table');
    expect(out).toContain('check');
  });

  it('no command prints usage and exits 2', async () => {
    const { code, out } = await run([]);
    expect(code).toBe(2);
    expect(out).toContain('Usage');
  });

  it('unknown command explains what to do', async () => {
    const { code, err } = await run(['frobnicate']);
    expect(code).toBe(2);
    expect(err).toContain("Unknown command 'frobnicate'");
    expect(err).toContain('--help');
  });

  it('unknown option, bad lang, bad provider and missing value exit 2', async () => {
    expect((await run(['table', '--wat'])).code).toBe(2);
    const lang = await run(['table', '--lang', 'fr']);
    expect(lang.code).toBe(2);
    expect(lang.err).toContain("'en' or 'ko'");
    const provider = await run(['table', '--provider', 'gemini']);
    expect(provider.code).toBe(2);
    expect(provider.err).toContain("'openai' or 'anthropic'");
    expect((await run(['table', '--provider'])).code).toBe(2);
  });
});

describe('table command', () => {
  it('lists every row for a provider with source and date', async () => {
    const { code, out } = await run(['table', '--provider', 'openai']);
    expect(code).toBe(0);
    expect(out).toContain('openai-chat-reasoning-max-tokens');
    expect(out).toContain('max_tokens -> max_completion_tokens');
    expect(out).toContain('https://developers.openai.com/api/docs/guides/reasoning');
    expect(out).toContain('2026-11-16');
    expect(out).not.toContain('anthropic-sdk1-sampling');
  });

  it('--json is machine readable and filtered', async () => {
    const { out } = await run(['table', '--provider', 'anthropic', '--json']);
    const rows = JSON.parse(out) as { id: string; provider: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.provider === 'anthropic')).toBe(true);
  });
});

describe('check command', () => {
  function project(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llm-call-cli-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'src', 'bad.js'),
      "import OpenAI from 'openai';\nconst c = new OpenAI();\nc.chat.completions.create({ model: 'o4-mini', max_tokens: 5, messages: [] });\n",
    );
    writeFileSync(
      join(dir, 'src', 'good.js'),
      "import OpenAI from 'openai';\nconst c = new OpenAI();\nc.chat.completions.create({ model: 'gpt-4o', max_tokens: 5, messages: [] });\n",
    );
    return dir;
  }

  it('exits 1 and names the rule when there is a problem', async () => {
    const dir = project();
    const { code, out } = await run(['check', 'src/bad.js'], dir);
    expect(code).toBe(1);
    expect(out).toContain('llm-call/no-unsupported-param');
    expect(out).toContain('src/bad.js:3:');
    expect(out).toContain('1 fixable');
  });

  it('a file outside the current folder gets guidance, not undefined:undefined', async () => {
    const dir = project();
    const other = project();
    const outside = join(other, 'src', 'bad.js');
    for (const [lang, phrase] of [['en', 'outside the current folder'], ['ko', '현재 폴더 밖']] as const) {
      const { code, out, err } = await run(['check', outside, '--lang', lang], dir);
      expect(code).toBe(0);
      expect(err).toContain(phrase);
      expect(`${out}${err}`).not.toContain('undefined:undefined');
      expect(`${out}${err}`).not.toContain('parse-error');
      expect(out).not.toContain('llm-call/');
    }
  });

  it('exits 0 for a clean file', async () => {
    const dir = project();
    const { code, out } = await run(['check', 'src/good.js'], dir);
    expect(code).toBe(0);
    expect(out).toContain('No problems found.');
  });

  it('walks directories', async () => {
    const dir = project();
    const { code, out } = await run(['check', 'src'], dir);
    expect(code).toBe(1);
    expect(out).toContain('bad.js');
    expect(out).not.toContain('good.js:');
  });

  it('prints rule messages in Korean with --lang ko', async () => {
    const dir = project();
    const { code, out } = await run(['check', 'src/bad.js', '--lang', 'ko'], dir);
    expect(code).toBe(1);
    expect(out).toContain('거부합니다');
  });

  it('needs at least one path', async () => {
    const { code, err } = await run(['check']);
    expect(code).toBe(2);
    expect(err).toContain('check src/');
  });

  it('reports a missing path as a usage error', async () => {
    const dir = project();
    const { code, err } = await run(['check', 'nope/'], dir);
    expect(code).toBe(2);
    expect(err.length).toBeGreaterThan(0);
  });
});

// v2 Q-17: ESLint's own English text must not leak into the chosen language.
describe('check command error paths in both languages', () => {
  // Fragments of ESLint's built-in English messages that used to reach the output untranslated.
  const ESLINT_ENGLISH = [
    'No files matching',
    'were found.',
    'are ignored',
    'File ignored',
    'Parsing error',
    'Unused eslint-disable',
    'Definition for rule',
    'undefined:undefined',
  ];

  function messy(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llm-call-cli-err-'));
    for (const sub of ['src', 'empty', 'dist', join('node_modules', 'x'), 'notes']) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    writeFileSync(join(dir, 'src', 'broken.js'), 'const a = ;\n');
    writeFileSync(
      join(dir, 'src', 'directives.js'),
      [
        "import OpenAI from 'openai';",
        'const c = new OpenAI();',
        '// eslint-disable-next-line no-console',
        'console.log(1);',
        '/* eslint react/no-danger: 2 */',
        'const y = 2; // eslint-disable-line foo/bar',
        '// eslint-disable-next-line llm-call/no-unsupported-param',
        "c.chat.completions.create({ model: 'o4-mini', max_tokens: 5, messages: [] });",
        "c.chat.completions.create({ model: 'o4-mini', max_tokens: y, messages: [] });",
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, 'dist', 'a.js'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'node_modules', 'x', 'a.js'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'notes', 'a.md'), '# notes\n');
    return dir;
  }

  const cases = [
    {
      name: 'missing file',
      argv: ['check', 'none.js'],
      code: 2,
      en: "No files matching 'none.js' were found. Check the path",
      ko: "'none.js' 에 해당하는 파일이 없습니다",
    },
    {
      name: 'glob with no match',
      argv: ['check', 'src/**/*.zzz'],
      code: 2,
      en: "No files matching 'src/**/*.zzz' were found. Check the path",
      ko: "'src/**/*.zzz' 에 해당하는 파일이 없습니다",
    },
    {
      name: 'empty folder',
      argv: ['check', 'empty'],
      code: 2,
      en: "No files matching 'empty' were found. Check the path",
      ko: "'empty' 에 해당하는 파일이 없습니다",
    },
    {
      name: 'folder with only ignored files',
      argv: ['check', 'dist'],
      code: 2,
      en: "Nothing to check under 'dist'",
      ko: "'dist' 에는 검사할 파일이 없습니다",
    },
    {
      name: 'explicitly named ignored file',
      argv: ['check', 'node_modules/x/a.js'],
      code: 0,
      en: "Skipped 'node_modules/x/a.js': files under node_modules/",
      ko: "'node_modules/x/a.js' 은(는) 건너뛰었습니다",
    },
    {
      name: 'unsupported file type',
      argv: ['check', 'notes/a.md'],
      code: 0,
      en: "Skipped 'notes/a.md': not a file type",
      ko: "'notes/a.md' 은(는) 건너뛰었습니다. 이 명령이 검사하는 파일 형식이 아닙니다",
    },
    {
      name: 'parse error',
      argv: ['check', 'src/broken.js'],
      code: 1,
      en: 'src/broken.js:1:11  parse-error  Could not parse this file (parser says: Unexpected token ;)',
      ko: 'src/broken.js:1:11  parse-error  이 파일을 해석하지 못했습니다(파서 원문: Unexpected token ;)',
    },
  ] as const;

  for (const c of cases) {
    for (const lang of ['en', 'ko'] as const) {
      it(`${c.name} (${lang}) exits ${c.code} with a ${lang} message`, async () => {
        const dir = messy();
        const { code, out, err } = await run([...c.argv, '--lang', lang], dir);
        const all = `${out}\n${err}`;
        expect(code).toBe(c.code);
        expect(all).toContain(c[lang]);
        if (lang === 'ko') {
          for (const fragment of ESLINT_ENGLISH) expect(all).not.toContain(fragment);
        } else {
          expect(all).not.toContain('undefined:undefined');
        }
      });
    }
  }

  it('reports only llm-call problems, not comments about rules of other plugins', async () => {
    const dir = messy();
    for (const lang of ['en', 'ko'] as const) {
      const { code, out, err } = await run(['check', 'src/directives.js', '--lang', lang], dir);
      const all = `${out}\n${err}`;
      expect(code).toBe(1);
      // line 8 is disabled for our rule and stays silent; line 9 is reported
      expect(out).toContain('src/directives.js:9:');
      expect(out).not.toContain('src/directives.js:8:');
      expect(out.match(/llm-call\/no-unsupported-param/g)?.length).toBe(1);
      for (const fragment of ['Unused eslint-disable', 'Definition for rule', 'react/no-danger', 'foo/bar']) {
        expect(all).not.toContain(fragment);
      }
    }
  });

  it('other ESLint errors keep the original text inside a translated sentence', () => {
    const error = new Error('Something unexpected');
    expect(describeLintError(error, 'en')).toBe('ESLint stopped with an error (original message: Something unexpected)');
    expect(describeLintError(error, 'ko')).toBe('ESLint 가 오류로 멈췄습니다(원문: Something unexpected)');
    const notFound = Object.assign(new Error('x'), { messageTemplate: 'file-not-found', messageData: { pattern: 'a.js' } });
    expect(describeLintError(notFound, 'ko')).toContain("'a.js' 에 해당하는 파일이 없습니다");
  });
});
