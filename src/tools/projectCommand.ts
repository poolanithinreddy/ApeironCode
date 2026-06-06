import path from 'node:path';

import {readJsonFile} from '../utils/fs.js';

export const detectProjectCommand = async (
  cwd: string,
  scriptName: 'build' | 'lint' | 'test',
): Promise<string> => {
  const packageJson = await readJsonFile<{scripts?: Record<string, string>}>(
    path.join(cwd, 'package.json'),
    {},
  );

  if (packageJson.scripts?.[scriptName]) {
    return `npm run ${scriptName}`;
  }

  switch (scriptName) {
    case 'build':
      return 'npm run build';
    case 'lint':
      return 'npm run lint';
    case 'test':
    default:
      return 'npm test';
  }
};