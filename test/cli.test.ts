import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli.js';
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
