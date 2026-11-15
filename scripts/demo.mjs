// Demo: run the REAL TypeScript compiler and the REAL ESLint plugin side by side on the practice fixtures.
// The fixtures in examples/ are mock calls; no provider API is ever contacted.
// Usage: npm run demo [-- --lang en|ko]   (language order: --lang > LLM_CALL_LINT_LANG > LC_ALL/LC_MESSAGES/LANG)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// The plugin reads the language when it loads, so decide it before importing anything from dist/.
const flagIndex = process.argv.indexOf('--lang');
const flag = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
const { resolveLang, t } = await import('../dist/i18n/messages.js');
const lang = resolveLang(flag);
process.env.LLM_CALL_LINT_LANG = lang;

const unit = (count, one, many) => t(lang, count === 1 ? one : many);

console.log(t(lang, 'demo.intro'));
console.log('');

// 1. What TypeScript says (examples/tsconfig.json type-checks broken.ts only).
const require = createRequire(import.meta.url);
const tscBin = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
const tsc = spawnSync(process.execPath, [tscBin, '--noEmit', '-p', 'examples/tsconfig.json', '--pretty', 'false'], {
  encoding: 'utf8',
});
const tscErrors = tsc.stdout.split('\n').filter((line) => /error TS\d+/.test(line));
console.log(
  t(lang, 'demo.tsc', { count: tscErrors.length, unit: unit(tscErrors.length, 'demo.tscUnitOne', 'demo.tscUnitMany') }),
);
for (const line of tscErrors) console.log(`  ${line.slice(0, 110)}`);
console.log('');

// 2. What the plugin says.
const { ESLint } = await import('eslint');
const eslint = new ESLint({ cwd: root, overrideConfigFile: 'examples/eslint.config.mjs' });
const lint = async (file) => (await eslint.lintFiles([file]))[0].messages;

const broken = await lint('examples/broken.ts');
console.log(
  t(lang, 'demo.llm', { count: broken.length, unit: unit(broken.length, 'demo.problemUnitOne', 'demo.problemUnitMany') }),
);
for (const m of broken) {
  console.log(`  broken.ts:${m.line}:${m.column}  ${m.ruleId}  ${m.message}`);
}
console.log('');

// 3. Files where the plugin must stay quiet.
let ok = broken.length >= 6 && tscErrors.length === 1;
const quiet = {};
for (const file of ['unknown.ts', 'fixed.ts']) {
  const messages = await lint(join('examples', file));
  console.log(
    t(lang, 'demo.file', { file, count: messages.length, unit: unit(messages.length, 'demo.problemUnitOne', 'demo.problemUnitMany') }),
  );
  for (const m of messages) console.log(`  ${relative(root, file)}:${m.line}:${m.column}  ${m.ruleId}  ${m.message}`);
  quiet[file] = messages.length;
  if (messages.length > 0) ok = false;
}

// Language-neutral result line (stable text for scripts and CI logs).
console.log('');
console.log(
  `result: tsc: ${tscErrors.length} ${tscErrors.length === 1 ? 'error' : 'errors'}; llm-call: ${broken.length} problems; ` +
    `unknown.ts: ${quiet['unknown.ts']} problems; fixed.ts: ${quiet['fixed.ts']} problems`,
);

if (!ok) {
  console.error('demo expectation failed: expected 1 tsc error, at least 6 llm-call problems in broken.ts, none in unknown.ts/fixed.ts');
  process.exit(1);
}
