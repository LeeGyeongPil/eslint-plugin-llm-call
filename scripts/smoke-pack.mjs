// Smoke test of the published artifact: `npm pack`, install the tarball next to eslint 10.15.0 in a brand-new
// project, lint a bad and a good file with `llmCall.configs.recommended`, and check the exit codes.
// Needs network access to the npm registry (to install eslint). Must finish within 5 minutes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const started = Date.now();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'llmcall-smoke-'));
// A cache of our own: a shared ~/.npm cache can stall when other npm processes hold it.
const cache = join(work, 'npmcache');
mkdirSync(cache, { recursive: true });
const packDir = join(work, 'pack');
const project = join(work, 'project');
mkdirSync(packDir);
mkdirSync(project);

function run(cmd, args, cwd, timeoutMs) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  return { code: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function fail(message, detail = '') {
  console.error(`smoke: FAILED - ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// 1. Pack (the prepare script builds dist/ first).
const pack = run('npm', ['pack', '--cache', cache, '--pack-destination', packDir], root, 180_000);
if (pack.code !== 0) fail('npm pack failed', pack.out);
const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
if (!tarball) fail('npm pack produced no tarball', pack.out);
console.log(`packed ${tarball}`);

// 2. New project with eslint 10.15.0 and the tarball.
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'smoke', version: '1.0.0', private: true, type: 'module' }));
const install = run(
  'npm',
  ['install', '--cache', cache, '--no-audit', '--no-fund', 'eslint@10.15.0', join(packDir, tarball)],
  project,
  240_000,
);
if (install.code !== 0) fail('npm install failed', install.out);
console.log('installed eslint@10.15.0 and the tarball');

// 3. Config and fixtures.
writeFileSync(
  join(project, 'eslint.config.mjs'),
  "import llmCall from 'eslint-plugin-llm-call';\nexport default [llmCall.configs.recommended];\n",
);
writeFileSync(
  join(project, 'bad.js'),
  "import OpenAI from 'openai';\nconst client = new OpenAI();\nawait client.chat.completions.create({ model: 'o4-mini', max_tokens: 100, messages: [] });\n",
);
writeFileSync(
  join(project, 'good.js'),
  "import OpenAI from 'openai';\nconst client = new OpenAI();\nawait client.chat.completions.create({ model: 'o4-mini', max_completion_tokens: 100, messages: [] });\n",
);

const eslintBin = join(project, 'node_modules', '.bin', 'eslint');
const bad = run(eslintBin, ['bad.js'], project, 60_000);
if (bad.code !== 1) fail(`bad.js should exit 1, got ${bad.code}`, bad.out);
if (!bad.out.includes('llm-call/no-unsupported-param')) fail('bad.js output lacks llm-call/no-unsupported-param', bad.out);
const good = run(eslintBin, ['good.js'], project, 60_000);
if (good.code !== 0) fail(`good.js should exit 0, got ${good.code}`, good.out);

// 4. The bin of the installed package works too.
const cli = run(join(project, 'node_modules', '.bin', 'eslint-plugin-llm-call'), ['table', '--provider', 'openai', '--lang', 'en'], project, 60_000);
if (cli.code !== 0 || !cli.out.includes('Model')) fail('installed CLI table failed', cli.out);

const seconds = Math.round((Date.now() - started) / 1000);
if (seconds > 300) fail(`took ${seconds}s, limit is 300s`);
console.log(`bad.js exit 1 with llm-call/no-unsupported-param, good.js exit 0, CLI ok (${seconds}s)`);
console.log('smoke: ok');
