import path from 'node:path';

import {appendFile, readFile} from 'node:fs/promises';

import {ensureDirectory} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import type {HookExecutionRecord} from './types.js';

export const getHookEventsPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'hooks', 'events.jsonl');

export class HookEventLog {
  constructor(private readonly cwd: string) {}

  async append(record: HookExecutionRecord): Promise<void> {
    const filePath = getHookEventsPath(this.cwd);
    await ensureDirectory(path.dirname(filePath));
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async list(limit = 50): Promise<HookExecutionRecord[]> {
    try {
      const raw = await readFile(getHookEventsPath(this.cwd), 'utf8');
      return raw
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as HookExecutionRecord)
        .slice(-limit);
    } catch {
      return [];
    }
  }
}
