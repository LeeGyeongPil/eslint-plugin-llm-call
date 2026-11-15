import { existsSync, readFileSync } from 'node:fs';
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

describe('lockfile', () => {
  const rootEntry = lock.packages[''] as Record<string, unknown>;
  it('root entry matches package.json (devDependencies, peerDependencies, engines)', () => {
    expect(rootEntry.devDependencies).toEqual(pkg.devDependencies);
    expect(rootEntry.peerDependencies).toEqual(pkg.peerDependencies);
    expect(rootEntry.engines).toEqual(pkg.engines);
  });
});
