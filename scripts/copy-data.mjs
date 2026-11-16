// Post-build step (runs right after tsc):
// 1. tsc does not copy plain JSON that is read at runtime; copy the data tables next to the build output.
// 2. tsc writes dist/cli.js as 0644. Mark the CLI entry executable so the packed tarball and a direct
//    `./dist/cli.js` (or a stale npx cache) do not fail with "Permission denied" on Linux/macOS.
import { chmodSync, cpSync, existsSync, mkdirSync } from 'node:fs';

mkdirSync('dist/data', { recursive: true });
cpSync('src/data', 'dist/data', { recursive: true });
console.log('copied src/data -> dist/data');

if (existsSync('dist/cli.js')) {
  chmodSync('dist/cli.js', 0o755); // 실행 비트: npm bin 링크가 가리키는 파일
  console.log('chmod 755 dist/cli.js');
}
