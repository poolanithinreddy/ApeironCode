import path from 'node:path';

import {isSubPath} from '../utils/paths.js';
import {isSensitivePath} from './secretGuard.js';

export interface PathAssessment {
  inputPath: string;
  resolvedPath: string;
  relativePath: string;
  outsideProject: boolean;
  sensitive: boolean;
}

export const assessPath = (cwd: string, inputPath: string): PathAssessment => {
  const resolvedPath = path.resolve(cwd, inputPath);
  const outsideProject = !isSubPath(cwd, resolvedPath);

  return {
    inputPath,
    outsideProject,
    relativePath: path.relative(cwd, resolvedPath) || '.',
    resolvedPath,
    sensitive: isSensitivePath(resolvedPath),
  };
};