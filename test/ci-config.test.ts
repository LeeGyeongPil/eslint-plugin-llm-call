import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static checks of the CI setup (no network): the workflow, package.json and the lockfile must agree,
// so a mismatch shows up here instead of as a red GitHub Actions run.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string): string => readFileSync(join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json')) as {
  engines: { node: string };
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};
const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, Record<string, unknown>> };
const workflow = read('.github/workflows/ci.yml');

const runLines = [...workflow.matchAll(/^\s*-\s*run:\s*(.+?)\s*$/gm)].map((m) => m[1] as string);
const matrixMajors = (() => {
  const m = /node:\s*\[([^\]]+)\]/.exec(workflow);
  return (m?.[1] ?? '').split(',').map((v) => Number.parseInt(v.trim().replace(/['"]/g, ''), 10));
})();

describe('ci workflow', () => {
  it('matrix covers exactly Node 22, 24 and 26 (no end-of-life 20)', () => {
    expect([...matrixMajors].sort((a, b) => a - b)).toEqual([22, 24, 26]);
  });

  it('every engines.node lower bound major is in the matrix', () => {
    const majors = [...pkg.engines.node.matchAll(/(?:\^|>=)\s*(\d+)/g)].map((m) => Number.parseInt(m[1] as string, 10));
    expect(majors.length).toBeGreaterThan(0);
    for (const major of majors) expect(matrixMajors).toContain(major);
    expect(pkg.engines.node).toBe('^22.13.0 || >=24');
  });

  it('runs npm ci, npm run verify and npm run smoke:pack in that order', () => {
    expect(runLines).toEqual(['npm ci', 'npm run verify', 'npm run smoke:pack']);
  });

  it('every run line is npm ci, npm test or an existing package.json script, without --ignore-scripts', () => {
    for (const line of runLines) {
      expect(line).not.toContain('--ignore-scripts');
      const script = /^npm run (\S+)$/.exec(line)?.[1];
      if (script) expect(pkg.scripts).toHaveProperty(script);
      else expect(['npm ci', 'npm test']).toContain(line);
    }
  });

  it('only the pinned official actions are used', () => {
    const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(['actions/checkout@v7', 'actions/setup-node@v7']).toContain(u);
  });

  it('verify builds before it tests', () => {
    const verify = pkg.scripts.verify ?? '';
    const build = verify.indexOf('build');
    const test = verify.indexOf('test');
    expect(build).toBeGreaterThanOrEqual(0);
    expect(test).toBeGreaterThan(build);
  });

  it('ci:repro script exists', () => {
    expect(pkg.scripts['ci:repro']).toBe('node scripts/ci-repro.mjs');
    expect(existsSync(join(root, 'scripts', 'ci-repro.mjs'))).toBe(true);
  });
});

// Round 7: things that differ between a macOS checkout and a GitHub ubuntu runner.
describe('portability to a Linux CI runner', () => {
  it('relative imports match the file names exactly (Linux file systems are case-sensitive)', () => {
    const problems: string[] = [];
    const walk = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|mjs)$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    for (const file of [...walk('src'), ...walk('test'), ...walk('scripts')]) {
      // Lines that start with a quote are fixture source code inside strings, not real imports.
      const code = read(file)
        .split('\n')
        .filter((line) => !/^\s*['"`]/.test(line))
        .join('\n');
      for (const m of code.matchAll(/(?:from\s+|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
        const spec = m[1] as string;
        let target = join(dirname(file), spec);
        if (target.startsWith('dist')) continue; // built output, checked by the build itself
        if (!existsSync(join(root, target)) && target.endsWith('.js')) target = target.replace(/\.js$/, '.ts');
        // Compare each path segment with the real directory listing (exact case).
        const parts = target.split(/[\\/]/);
        let cur = '';
        for (const part of parts) {
          if (part === '' || part === '.') continue;
          const names = existsSync(join(root, cur)) ? readdirSync(join(root, cur)) : [];
          if (part !== '..' && !names.includes(part)) {
            problems.push(`${file}: '${spec}' -> '${part}' not found with this exact case in '${cur || '.'}'`);
            break;
          }
          cur = join(cur, part);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the bin entry is built with a node shebang and made executable by the build', () => {
    expect((pkg as unknown as { bin: Record<string, string> }).bin['eslint-plugin-llm-call']).toBe('dist/cli.js');
    expect(read('src/cli.ts').startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(pkg.scripts.build).toContain('node scripts/copy-data.mjs');
    expect(read('scripts/copy-data.mjs')).toMatch(/chmodSync\('dist\/cli\.js', 0o755\)/);
  });

  it('pack smoke runs npm and eslint on the current Node and reports spawn errors', () => {
    const smoke = read('scripts/smoke-pack.mjs');
    expect(smoke).toContain('process.env.npm_execpath');
    expect(smoke).toContain("join(project, 'node_modules', 'eslint', 'bin', 'eslint.js')");
    expect(smoke).toContain('result.error');
    expect(smoke).toContain('result.signal');
  });

  it('ci:repro gives the steps a runner-like environment and can copy the committed HEAD', () => {
    const repro = read('scripts/ci-repro.mjs');
    for (const fragment of ["CI: 'true'", "GITHUB_ACTIONS: 'true'", "TZ: 'UTC'", "key === 'LANG'", "key.startsWith('LC_')", 'CI_REPRO_COMMITTED', "'archive'"]) {
      expect(repro).toContain(fragment);
    }
  });

  it('no test depends on the developer locale, time zone or a macOS-only path', () => {
    for (const file of readdirSync(join(root, 'test'))) {
      if (!file.endsWith('.ts') || file === 'ci-config.test.ts') continue;
      const text = read(join('test', file));
      expect(text, file).not.toMatch(/\/Users\/|\/private\/|\/var\/folders|toLocale|Intl\.|new Date\(\)/);
    }
  });
});

describe('lockfile', () => {
  const rootEntry = lock.packages[''] as Record<string, unknown>;
  it('root entry matches package.json (devDependencies, peerDependencies, engines)', () => {
    expect(rootEntry.devDependencies).toEqual(pkg.devDependencies);
    expect(rootEntry.peerDependencies).toEqual(pkg.peerDependencies);
    expect(rootEntry.engines).toEqual(pkg.engines);
  });

  it('every native binding locked for macOS arm64 also has a linux x64 glibc entry (the CI runner)', () => {
    const keys = Object.keys(lock.packages);
    const darwin = keys.filter((k) => /-darwin-arm64$/.test(k));
    expect(darwin.length).toBeGreaterThan(0);
    for (const k of darwin) {
      const linux = k.replace(/-darwin-arm64$/, '-linux-x64-gnu');
      expect(keys, `${k} has no ${linux}`).toContain(linux);
      expect(lock.packages[linux]?.libc).toEqual(['glibc']);
    }
  });
});
