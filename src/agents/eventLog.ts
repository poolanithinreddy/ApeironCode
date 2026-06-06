import path from 'node:path';

import {ensureDirectory, fileExists, readTextFile, writeTextFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';

export type TeamEventType =
  | 'artifact_exported'
  | 'artifact_opened'
  | 'cockpit_action'
  | 'cockpit_closed'
  | 'cockpit_opened'
  | 'conflict_marked_manual'
  | 'conflict_skipped'
  | 'memory_suggestion_approved'
  | 'memory_suggestion_rejected'
  | 'merge_apply_requested'
  | 'merge_applied'
  | 'patch_exported'
  | 'patch_validated'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'subagent_started'
  | 'team_completed'
  | 'team_failed'
  | 'team_started';

export interface TeamEventRecord {
  agent?: string;
  createdAt: string;
  message: string;
  task: string;
  teamRunId: string;
  type: TeamEventType;
}

export const getTeamEventLogPath = (cwd: string): string =>
  path.join(getProjectConfigDir(cwd), 'teams', 'events.jsonl');

export class TeamEventLog {
  constructor(private readonly cwd: string) {}

  async append(record: Omit<TeamEventRecord, 'createdAt'>): Promise<TeamEventRecord> {
    const next: TeamEventRecord = {
      ...record,
      createdAt: new Date().toISOString(),
    };
    const filePath = getTeamEventLogPath(this.cwd);
    await ensureDirectory(path.dirname(filePath));
    const existing = await this.list();
    await writeTextFile(filePath, [...existing, next].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    return next;
  }

  async list(limit = 100): Promise<TeamEventRecord[]> {
    const filePath = getTeamEventLogPath(this.cwd);
    if (!(await fileExists(filePath))) {
      return [];
    }
    const raw = await readTextFile(filePath);
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TeamEventRecord)
      .slice(-limit);
  }
}
