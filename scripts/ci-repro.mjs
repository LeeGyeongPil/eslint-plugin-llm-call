// Reproduce the CI `test` job locally: copy only the files git would commit (no node_modules, dist, .git)
// into a fresh folder, then run the `run:` lines of .github/workflows/ci.yml in the same order.
// Env: CI_REPRO_DIR (target folder), CI_REPRO_NPM (replace the leading `npm`, e.g. 'npx -y npm@10').
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`ci-repro: FAILED - ${message}`);
  process.exit(1);
}

// 1. Committed (or committable) files only. Deleted-but-tracked files are skipped.
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
if (listed.status !== 0) fail(`git ls-files failed. Run this inside the git checkout.\n${listed.stderr}`);
const files = [...new Set(listed.stdout.split('\0').filter(Boolean))].filter((f) => existsSync(join(root, f)));

const base = process.env.CI_REPRO_DIR;
if (base) mkdirSync(base, { recursive: true });
const dir = base ? mkdtempSync(join(base, 'ci-repro-')) : mkdtempSync(join(tmpdir(), 'ci-repro-'));
for (const f of files) {
  mkdirSync(dirname(join(dir, f)), { recursive: true });
  copyFileSync(join(root, f), join(dir, f));
}

// 2. The `run:` lines of the workflow, in order (the workflow has a single job).
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const commands = [...workflow.matchAll(/^\s*-\s*run:\s*(.+?)\s*$/gm)].map((m) => m[1]);
if (commands.length === 0) fail('no `run:` lines found in .github/workflows/ci.yml');

const npmOverride = process.env.CI_REPRO_NPM;
const cacheDir = join(dir, '.npm-cache-ci-repro');
let step = 0;
for (const command of commands) {
  step++;
  const actual = npmOverride && command.startsWith('npm ') ? `${npmOverride}${command.slice(3)}` : command;
  process.stdout.write(`ci-repro: [${step}/${commands.length}] ${command} ... `);
  const result = spawnSync(actual, {
    cwd: dir,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: 'true', npm_config_cache: cacheDir },
  });
  if (result.status !== 0) {
    console.log('FAILED');
    const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd().split('\n').slice(-40).join('\n');
    console.error(`ci-repro: step ${step} (${command}) exited with ${result.status ?? result.signal}. Last 40 lines:\n${tail}`);
    console.error(`ci-repro: the copy is kept in ${dir}`);
    process.exit(1);
  }
  console.log('ok');
}

const versionRun = spawnSync(`${npmOverride ?? 'npm'} --version`, { shell: true, encoding: 'utf8' });
const npmV = (versionRun.stdout ?? '').trim().split('\n').pop();
rmSync(dir, { recursive: true, force: true });
console.log(`ci-repro: ok (node ${process.version}, npm ${npmV}, ${commands.length} steps)`);
