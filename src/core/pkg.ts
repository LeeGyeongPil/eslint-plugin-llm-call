import { readFileSync } from 'node:fs';

interface PackageJson {
  name: string;
  version: string;
}

// Works from both src/core (tests) and dist/core (published): package.json is two levels up.
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as PackageJson;

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
