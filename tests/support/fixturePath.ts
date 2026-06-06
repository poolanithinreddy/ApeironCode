import path from 'node:path';
import {fileURLToPath} from 'node:url';

const testsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const fixturePath = (...segments: string[]): string => {
  return path.join(testsRoot, 'fixtures', ...segments);
};
