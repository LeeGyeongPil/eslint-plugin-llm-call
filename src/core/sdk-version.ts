import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const cache = new Map<string, 0 | 1 | undefined>();

/** Clear the per-process detection cache (tests). */
export function clearSdkVersionCache(): void {
  cache.clear();
}

function readMajor(pkgJson: string): 0 | 1 | undefined {
  try {
    const version = (JSON.parse(readFileSync(pkgJson, 'utf8')) as { version?: unknown }).version;
    if (typeof version !== 'string') return undefined;
    const major = Number.parseInt(version.split('.')[0] ?? '', 10);
    if (Number.isNaN(major)) return undefined;
    return major >= 1 ? 1 : 0;
  } catch {
    return undefined;
  }
}

/**
 * Find the installed `@anthropic-ai/sdk` major version by walking up from the linted file.
 * Returns 0 for 0.x, 1 for 1.x or newer, undefined when it cannot be found (rules stay silent).
 */
export function detectAnthropicSdkMajor(filename: string | undefined, cwd: string): 0 | 1 | undefined {
  if (!filename || filename.startsWith('<')) return undefined;
  let dir = dirname(isAbsolute(filename) ? filename : resolve(cwd, filename));
  const visited: string[] = [];
  for (;;) {
    if (cache.has(dir)) {
      const hit = cache.get(dir);
      for (const d of visited) cache.set(d, hit);
      return hit;
    }
    visited.push(dir);
    const candidate = join(dir, 'node_modules', '@anthropic-ai', 'sdk', 'package.json');
    if (existsSync(candidate)) {
      const major = readMajor(candidate);
      for (const d of visited) cache.set(d, major);
      return major;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const d of visited) cache.set(d, undefined);
  return undefined;
}
