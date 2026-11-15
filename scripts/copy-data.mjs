// tsc does not copy plain JSON that is read at runtime; copy the data tables next to the build output.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/data', { recursive: true });
cpSync('src/data', 'dist/data', { recursive: true });
console.log('copied src/data -> dist/data');
