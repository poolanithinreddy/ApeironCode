import path from 'node:path';

import {readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import type {DependencyGraphEdge} from './dependencyGraph.js';
import type {FileSummary} from './fileSummaries.js';

export interface RepoBrainIndex {
  dependencies: DependencyGraphEdge[];
  files: FileSummary[];
  updatedAt: string;
  version: 1;
}

export const getRepoBrainIndexPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'context', 'index.json');

export class RepoBrainIndexStore {
  constructor(private readonly cwd: string) {}

  async load(): Promise<RepoBrainIndex> {
    return readJsonFile<RepoBrainIndex>(getRepoBrainIndexPath(this.cwd), {
      dependencies: [],
      files: [],
      updatedAt: new Date(0).toISOString(),
      version: 1,
    });
  }

  async save(index: Omit<RepoBrainIndex, 'updatedAt' | 'version'>): Promise<RepoBrainIndex> {
    const next = {
      ...index,
      updatedAt: new Date().toISOString(),
      version: 1 as const,
    };
    await writeJsonFile(getRepoBrainIndexPath(this.cwd), next);
    return next;
  }
}
