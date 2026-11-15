#!/usr/bin/env node
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUILTIN_MODELS, type ModelRule } from './core/model-table.js';
import { PACKAGE_VERSION } from './core/pkg.js';
import { isLang, resolveLang, t, type Lang, type MessageKey } from './i18n/messages.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  cwd: string;
}

interface Parsed {
  command?: string;
  paths: string[];
  provider?: string;
  json: boolean;
  lang?: string;
  help: boolean;
  version: boolean;
  error?: { key: MessageKey; params: Record<string, string> };
}

const VALUE_OPTIONS = new Set(['--lang', '--provider']);
const FLAG_OPTIONS = new Set(['--json', '--help', '-h', '--version', '-v']);

function parseArgs(argv: string[]): Parsed {
  const parsed: Parsed = { paths: [], json: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (VALUE_OPTIONS.has(name)) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined) {
        parsed.error = { key: 'cli.missingValue', params: { option: name } };
        break;
      }
      if (name === '--lang') parsed.lang = value;
      else parsed.provider = value;
    } else if (FLAG_OPTIONS.has(arg)) {
      if (arg === '--json') parsed.json = true;
      if (arg === '--help' || arg === '-h') parsed.help = true;
      if (arg === '--version' || arg === '-v') parsed.version = true;
    } else if (arg.startsWith('-') && arg !== '-') {
      parsed.error = { key: 'cli.unknownOption', params: { option: arg } };
      break;
    } else if (parsed.command === undefined) {
      parsed.command = arg;
    } else {
      parsed.paths.push(arg);
    }
  }
  return parsed;
}

function formatTable(rows: string[][]): string {
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? '').length)));
  return rows
    .map((r) => r.map((cell, col) => cell.padEnd(widths[col] as number)).join('  ').trimEnd())
    .join('\n');
}

function describeCondition(rule: ModelRule): string {
  const parts: string[] = [];
  if (rule.sdkMajor !== undefined) parts.push(`@anthropic-ai/sdk ${rule.sdkMajor}.x`);
  for (const cond of rule.allowWhen ?? []) parts.push(`ok if ${cond.path.join('.')} = ${String(cond.equals)}`);
  return parts.join('; ') || '-';
}

function tableCommand(parsed: Parsed, lang: Lang, io: Io): number {
  const provider = parsed.provider;
  if (provider !== undefined && provider !== 'openai' && provider !== 'anthropic') {
    io.err(t(lang, 'cli.badProvider', { value: provider }));
    return 2;
  }
  const rules = BUILTIN_MODELS.filter((r) => !provider || r.provider === provider);
  if (parsed.json) {
    io.out(JSON.stringify(rules, null, 2));
    return 0;
  }
  const header = [
    t(lang, 'table.id'),
    t(lang, 'table.model'),
    t(lang, 'table.api'),
    t(lang, 'table.forbidden'),
    t(lang, 'table.replacement'),
    t(lang, 'table.condition'),
    t(lang, 'table.source'),
    t(lang, 'table.checked'),
  ];
  const rows = rules.map((r) => [
    r.id,
    r.anyModel ? '*' : r.exclude ? `${r.match}  !${r.exclude}` : r.match,
    r.api,
    [...(r.forbid ?? []), ...(r.forbidTogether ?? []).map((g) => g.join(' + '))].join(', '),
    Object.entries(r.replace ?? {})
      .map(([from, to]) => `${from} -> ${to}`)
      .join(', ') || '-',
    describeCondition(r),
    r.source,
    r.checked,
  ]);
  io.out(formatTable([header, ...rows]));
  io.out('');
  io.out(t(lang, 'table.note'));
  return 0;
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function countTypeScriptFiles(paths: string[], cwd: string): number {
  let count = 0;
  const walk = (p: string): void => {
    let stat;
    try {
      stat = statSync(p);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        walk(join(p, name));
      }
    } else if (TS_EXTENSIONS.has(extname(p)) && !p.endsWith('.d.ts')) {
      count++;
    }
  };
  for (const p of paths) walk(resolve(cwd, p));
  return count;
}

/** Load the user's own @typescript-eslint/parser (the plugin itself has no runtime dependencies). */
async function loadTypeScriptParser(cwd: string): Promise<unknown | undefined> {
  try {
    const require = createRequire(join(cwd, 'noop.js'));
    const mod = (await import(pathToFileURL(require.resolve('@typescript-eslint/parser')).href)) as {
      default?: unknown;
    };
    return mod.default ?? mod;
  } catch {
    return undefined;
  }
}

async function checkCommand(parsedIn: Parsed, lang: Lang, io: Io): Promise<number> {
  let parsed = parsedIn;
  if (parsed.paths.length === 0) {
    io.err(t(lang, 'cli.checkNeedsPaths'));
    return 2;
  }
  // ESLint only lints files under its base path; a path outside the current folder would yield a
  // message without a line or rule, so tell the user to run from a parent folder instead.
  const inside: string[] = [];
  for (const p of parsed.paths) {
    const rel = relative(io.cwd, resolve(io.cwd, p));
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      io.err(t(lang, 'cli.outsideCwd', { path: p }));
    } else {
      inside.push(p);
    }
  }
  if (inside.length === 0) return 0;
  parsed = { ...parsed, paths: inside };
  // Rule messages are fixed when the plugin module loads, so choose the language first.
  process.env.LLM_CALL_LINT_LANG = lang;
  let eslintModule: typeof import('eslint');
  try {
    eslintModule = await import('eslint');
  } catch {
    io.err(t(lang, 'cli.noEslint'));
    return 2;
  }
  const { ESLint } = eslintModule;
  const { default: plugin } = await import('./index.js');
  const tsParser = await loadTypeScriptParser(io.cwd);

  const config: unknown[] = [
    { ignores: ['**/node_modules/**', '**/dist/**'] },
    {
      files: ['**/*.{js,mjs,jsx}'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    },
    { files: ['**/*.cjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' } },
  ];
  if (tsParser) {
    config.push({ files: ['**/*.{ts,tsx,mts,cts}'], languageOptions: { parser: tsParser } });
  }
  config.push(plugin.configs.recommended);

  const eslint = new ESLint({
    cwd: io.cwd,
    overrideConfigFile: true,
    overrideConfig: config as never,
  });
  let results;
  try {
    results = await eslint.lintFiles(parsed.paths);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }

  let problems = 0;
  let fixable = 0;
  let files = 0;
  for (const result of results) {
    if (result.messages.length === 0) continue;
    files++;
    const file = relative(io.cwd, result.filePath) || result.filePath;
    for (const m of result.messages) {
      problems++;
      if (m.fix) fixable++;
      io.out(`${file}:${m.line}:${m.column}  ${m.ruleId ?? 'parse-error'}  ${m.message}`);
    }
  }
  if (!tsParser) {
    const skipped = countTypeScriptFiles(parsed.paths, io.cwd);
    if (skipped > 0) io.err(t(lang, 'cli.noTsParser', { count: skipped }));
  }
  if (problems === 0) {
    io.out(t(lang, 'cli.noProblems'));
    return 0;
  }
  io.out('');
  io.out(t(lang, 'cli.summary', { count: problems, files }));
  if (fixable > 0) io.out(t(lang, 'cli.fixable', { count: fixable }));
  return 1;
}

/** Run the CLI. Returns the process exit code (0 ok, 1 problems found, 2 usage error). */
export async function main(argv: string[], io?: Partial<Io>): Promise<number> {
  const full: Io = {
    out: io?.out ?? ((s) => console.log(s)),
    err: io?.err ?? ((s) => console.error(s)),
    cwd: io?.cwd ?? process.cwd(),
  };
  const parsed = parseArgs(argv);
  // --lang > LLM_CALL_LINT_LANG > LC_ALL / LC_MESSAGES / LANG
  if (parsed.lang !== undefined && !isLang(parsed.lang)) {
    full.err(t(resolveLang(undefined), 'cli.badLang', { value: parsed.lang }));
    return 2;
  }
  const lang = resolveLang(parsed.lang);
  if (parsed.error) {
    full.err(t(lang, parsed.error.key, parsed.error.params));
    return 2;
  }
  if (parsed.version) {
    full.out(PACKAGE_VERSION);
    return 0;
  }
  if (parsed.help || parsed.command === undefined) {
    full.out(t(lang, 'cli.usage'));
    return parsed.help ? 0 : 2;
  }
  if (parsed.command === 'table') return tableCommand(parsed, lang, full);
  if (parsed.command === 'check') return checkCommand(parsed, lang, full);
  full.err(t(lang, 'cli.unknownCommand', { command: parsed.command }));
  return 2;
}

// Run only when executed directly (also through the npm bin symlink), not when imported by tests.
const entry = process.argv[1];
if (entry && existsSync(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    },
  );
}
