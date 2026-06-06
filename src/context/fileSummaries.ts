import crypto from 'node:crypto';
import path from 'node:path';

import {readTextFile} from '../utils/fs.js';

export interface FileSummary {
  hash: string;
  path: string;
  summary: string;
}

const hashText = (text: string): string => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

export const summarizeFile = async (cwd: string, filePath: string): Promise<FileSummary> => {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const text = await readTextFile(absolute);
  const lines = text.split(/\r?\n/u);
  const imports = lines.filter((line) => /^\s*import\s/u.test(line)).slice(0, 5);
  const declarations = lines.filter((line) => /\b(export\s+)?(class|function|const|interface|type)\s+[A-Za-z0-9_]+/u.test(line)).slice(0, 8);
  return {
    hash: hashText(text),
    path: path.relative(cwd, absolute),
    summary: [
      `${path.relative(cwd, absolute)} (${lines.length} lines)`,
      imports.length > 0 ? `Imports: ${imports.join(' | ')}` : null,
      declarations.length > 0 ? `Declarations: ${declarations.join(' | ')}` : null,
    ].filter(Boolean).join('\n'),
  };
};
