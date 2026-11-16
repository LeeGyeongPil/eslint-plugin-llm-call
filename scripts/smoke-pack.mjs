// Smoke test of the published artifact: `npm pack`, install the tarball next to eslint 10.15.0 in a brand-new
// project, lint a bad and a good file with `llmCall.configs.recommended`, and check the exit codes.
// Needs network access to the npm registry (to install eslint). Must finish within 5 minutes.
//
// Portability (GitHub Actions ubuntu runners, any Node in the CI matrix):
// - npm and eslint run on the SAME Node that runs this script (process.execPath + npm_execpath / eslint.js),
//   not whatever `node` or `npm` comes first on PATH.
// - Every failed child process prints its spawn error (ENOENT, EACCES, ETIMEDOUT) and signal, not only its output.
// - The registry install is retried once, because a cold CI runner can hit a transient network error.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// `npm run smoke:pack` sets npm_execpath to the npm-cli.js that is running us; reuse it with this Node.
const npmCli = process.env.npm_execpath;
const npm = npmCli && /npm-cli\.js$/.test(npmCli) ? [process.execPath, npmCli] : ['npm'];

function run(cmd, args, cwd, timeoutMs) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  let out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // 프로세스를 띄우지 못했거나(ENOENT·EACCES) 시간 초과로 죽은 경우를 출력에 남긴다.
  if (result.error) out += `\n[spawn error] ${result.error.code ?? ''} ${result.error.message}`;
  if (result.signal) out += `\n[killed by ${result.signal}${result.signal === 'SIGTERM' ? ` after ${timeoutMs} ms timeout` : ''}]`;
  return { code: result.status ?? 1, out };
}

const runNpm = (args, cwd, timeoutMs) => run(npm[0], [...npm.slice(1), ...args], cwd, timeoutMs);

function fail(message, detail = '') {
  console.error(`smoke: FAILED - ${message}`);
  if (detail) console.error(detail.trimEnd().split('\n').slice(-60).join('\n'));
  console.error(`smoke: work folder kept at ${work}`);
  process.exit(1);
}

console.log(`smoke: node ${process.version}, npm ${runNpm(['--version'], root, 60_000).out.trim().split('\n').pop()}`);

// 1. Pack (the prepare script builds dist/ first).
const pack = runNpm(['pack', '--cache', cache, '--pack-destination', packDir], root, 180_000);
if (pack.code !== 0) fail('npm pack failed', pack.out);
const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
if (!tarball) fail('npm pack produced no tarball', pack.out);
console.log(`packed ${tarball}`);

// 2. New project with eslint 10.15.0 and the tarball.
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'smoke', version: '1.0.0', private: true, type: 'module' }));
const installArgs = ['install', '--cache', cache, '--no-audit', '--no-fund', 'eslint@10.15.0', join(packDir, tarball)];
let install = runNpm(installArgs, project, 240_000);
if (install.code !== 0) {
  console.log('npm install failed once; retrying (transient registry errors happen on cold runners)');
  install = runNpm(installArgs, project, 240_000);
}
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

// eslint's own JS entry, run with this Node (no dependence on the shebang or on PATH).
const eslintJs = join(project, 'node_modules', 'eslint', 'bin', 'eslint.js');
if (!existsSync(eslintJs)) fail(`eslint entry not found at ${eslintJs}`);
const bad = run(process.execPath, [eslintJs, 'bad.js'], project, 60_000);
if (bad.code !== 1) fail(`bad.js should exit 1, got ${bad.code}`, bad.out);
if (!bad.out.includes('llm-call/no-unsupported-param')) fail('bad.js output lacks llm-call/no-unsupported-param', bad.out);
const good = run(process.execPath, [eslintJs, 'good.js'], project, 60_000);
if (good.code !== 0) fail(`good.js should exit 0, got ${good.code}`, good.out);

// 4. The bin of the installed package works too: the link exists, its target is executable and has a
//    shebang, and running the link itself (as a user's shell would) prints the table.
const installedCli = join(project, 'node_modules', 'eslint-plugin-llm-call', 'dist', 'cli.js');
const binLink = join(project, 'node_modules', '.bin', 'eslint-plugin-llm-call');
if (!existsSync(installedCli)) fail(`installed package has no ${installedCli}`);
if (!lstatSync(binLink, { throwIfNoEntry: false })) fail(`npm did not create the bin link ${binLink}`);
if ((statSync(installedCli).mode & 0o111) === 0) fail('installed dist/cli.js is not executable (bin would fail with EACCES)');
if (!readFileSync(installedCli, 'utf8').startsWith('#!/usr/bin/env node')) fail('installed dist/cli.js has no node shebang');
const cli = run(binLink, ['table', '--provider', 'openai', '--lang', 'en'], project, 60_000);
if (cli.code !== 0 || !cli.out.includes('Model')) fail('installed CLI table failed', cli.out);

const seconds = Math.round((Date.now() - started) / 1000);
if (seconds > 300) fail(`took ${seconds}s, limit is 300s`);
console.log(`bad.js exit 1 with llm-call/no-unsupported-param, good.js exit 0, CLI ok (${seconds}s)`);
rmSync(work, { recursive: true, force: true }); // 성공하면 임시 폴더(캐시·tarball·프로젝트)를 지운다
console.log('smoke: ok');
