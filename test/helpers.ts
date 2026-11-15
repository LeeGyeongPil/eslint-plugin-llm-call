import { Linter, RuleTester } from 'eslint';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

export const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
});

export const OPENAI = "import OpenAI from 'openai'; const c = new OpenAI();";
export const ANTHROPIC = "import Anthropic from '@anthropic-ai/sdk'; const a = new Anthropic();";

const root = mkdtempSync(join(tmpdir(), 'llm-call-fixtures-'));

/**
 * Create a fake project directory. With `major` set it contains a minimal
 * node_modules/@anthropic-ai/sdk/package.json (version only); without it there is no SDK at all.
 * Returns an absolute file name inside that project to pass as RuleTester `filename`.
 */
export function projectFile(name: string, major?: number): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (major !== undefined) {
    const sdk = join(dir, 'node_modules', '@anthropic-ai', 'sdk');
    mkdirSync(sdk, { recursive: true });
    writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: '@anthropic-ai/sdk', version: `${major}.2.3` }));
  }
  return join(dir, 'src.js');
}

/** A Linter whose base path is the filesystem root, so fixture files under the temp dir match the config. */
export function newLinter(): Linter {
  return new Linter({ cwd: '/' });
}
