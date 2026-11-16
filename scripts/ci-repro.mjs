// Reproduce the CI `test` job locally: copy only the files git tracks (no node_modules, dist, .git)
// into a fresh folder, then run the `run:` lines of .github/workflows/ci.yml in the same order,
// with the environment a GitHub ubuntu runner gives a step (CI=true, GITHUB_ACTIONS=true, no LANG/LC_*,
// TZ=UTC, non-TTY, an empty npm cache).
// Env: CI_REPRO_DIR (target folder), CI_REPRO_NPM (replace the leading `npm`, e.g. 'npx -y npm@10'),
//      CI_REPRO_COMMITTED=1 (copy the committed HEAD content, exactly what actions/checkout gets,
//      instead of the working-tree content of tracked files).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`ci-repro: FAILED - ${message}`);
  process.exit(1);
}

const base = process.env.CI_REPRO_DIR;
if (base) mkdirSync(base, { recursive: true });
const dir = base ? mkdtempSync(join(base, 'ci-repro-')) : mkdtempSync(join(tmpdir(), 'ci-repro-'));
const committed = process.env.CI_REPRO_COMMITTED === '1';

if (committed) {
  // 1a. Committed content only: `git archive HEAD` is what a checkout of this commit contains.
  const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  if (archive.status !== 0) fail(`git archive failed. Run this inside the git checkout.\n${archive.stderr}`);
  const untar = spawnSync('tar', ['-x', '-f', '-', '-C', dir], { input: archive.stdout });
  if (untar.status !== 0) fail(`tar failed\n${untar.stderr}`);
  console.log('ci-repro: copied committed HEAD content (CI_REPRO_COMMITTED=1)');
} else {
  // 1b. Tracked files only (stage new files with `git add` first). Deleted-but-tracked files are skipped.
  const listed = spawnSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) fail(`git ls-files failed. Run this inside the git checkout.\n${listed.stderr}`);
  const files = [...new Set(listed.stdout.split('\0').filter(Boolean))].filter((f) => existsSync(join(root, f)));
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  // CI checks out the commit, not your edits: say so when they differ.
  const changed = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const names = (changed.stdout ?? '').split('\n').filter(Boolean);
  if (names.length > 0) {
    console.log(`ci-repro: note - ${names.length} tracked file(s) differ from HEAD and are copied with your edits:`);
    for (const n of names.slice(0, 20)) console.log(`  ${n}`);
    console.log('ci-repro: run with CI_REPRO_COMMITTED=1 to check exactly what CI checks out.');
  }
}

// 2. The `run:` lines of the workflow, in order (the workflow has a single job).
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const commands = [...workflow.matchAll(/^\s*-\s*run:\s*(.+?)\s*$/gm)].map((m) => m[1]);
if (commands.length === 0) fail('no `run:` lines found in .github/workflows/ci.yml');

// 3. A runner-like environment: drop the developer's locale, pin UTC, mark CI and GitHub Actions.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key === 'LANG' || key === 'LANGUAGE' || key.startsWith('LC_') || key === 'LLM_CALL_LINT_LANG' || key === 'TZ') {
    delete env[key];
  }
}
const summary = join(dir, '.ci-repro-step-summary.md');
writeFileSync(summary, '');
Object.assign(env, {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_STEP_SUMMARY: summary,
  RUNNER_OS: process.platform === 'linux' ? 'Linux' : process.platform,
  TZ: 'UTC',
  npm_config_cache: join(dir, '.npm-cache-ci-repro'),
});

const npmOverride = process.env.CI_REPRO_NPM;
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
    stdio: ['ignore', 'pipe', 'pipe'], // non-TTY like a runner
    env,
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

const versionRun = spawnSync(`${npmOverride ?? 'npm'} --version`, { shell: true, encoding: 'utf8', env });
const npmV = (versionRun.stdout ?? '').trim().split('\n').pop();
rmSync(dir, { recursive: true, force: true });
console.log(`ci-repro: ok (node ${process.version}, npm ${npmV}, ${commands.length} steps${committed ? ', committed HEAD' : ''})`);
