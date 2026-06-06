import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'src/example.ts');
const content = fs.readFileSync(filePath, 'utf8');

if (content.includes('value = 2')) {
  process.exit(0);
}

console.error('Expected the file to contain value = 2');
process.exit(1);