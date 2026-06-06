import fs from 'node:fs/promises';
import path from 'node:path';

import {ensureDirectory, readJsonFile, writeJsonFile} from '../../utils/fs.js';
import {getProjectConfigDir} from '../../utils/paths.js';
import type {TeamArtifact, TeamArtifactKind, TeamRunRecord} from './types.js';

const getTeamRunsRoot = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'team-runs');
const getRunDir = (cwd: string, teamRunId: string): string => path.join(getTeamRunsRoot(cwd), teamRunId);
const getManifestPath = (cwd: string, teamRunId: string): string => path.join(getRunDir(cwd, teamRunId), 'manifest.json');

const slug = (value: string): string => value.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase();

export class TeamArtifactStore {
  constructor(private readonly cwd: string) {}

  async createRun(input: {goal: string; ok?: boolean; teamRunId: string}): Promise<TeamRunRecord> {
    const existing = await this.getRun(input.teamRunId);
    const record: TeamRunRecord = existing ?? {
      artifacts: [],
      createdAt: new Date().toISOString(),
      goal: input.goal,
      ok: Boolean(input.ok),
      teamRunId: input.teamRunId,
    };
    await ensureDirectory(getRunDir(this.cwd, input.teamRunId));
    await writeJsonFile(getManifestPath(this.cwd, input.teamRunId), {...record, ok: input.ok ?? record.ok});
    return {...record, ok: input.ok ?? record.ok};
  }

  async addArtifact(input: {
    content: string;
    kind: TeamArtifactKind;
    teamRunId: string;
    title: string;
  }): Promise<TeamArtifact> {
    const record = await this.createRun({goal: '', teamRunId: input.teamRunId});
    const id = `${input.kind}-${record.artifacts.length + 1}`;
    const relativePath = `${slug(id)}.md`;
    const fullPath = path.join(getRunDir(this.cwd, input.teamRunId), relativePath);
    await ensureDirectory(path.dirname(fullPath));
    await fs.writeFile(fullPath, input.content, 'utf8');
    const artifact: TeamArtifact = {
      createdAt: new Date().toISOString(),
      id,
      kind: input.kind,
      path: relativePath,
      title: input.title,
    };
    await writeJsonFile(getManifestPath(this.cwd, input.teamRunId), {
      ...record,
      artifacts: [...record.artifacts, artifact],
    });
    return artifact;
  }

  async listRuns(): Promise<TeamRunRecord[]> {
    const entries = await fs.readdir(getTeamRunsRoot(this.cwd), {withFileTypes: true}).catch(() => []);
    const records = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.getRun(entry.name)));
    return records.filter((record): record is TeamRunRecord => Boolean(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(teamRunId: string): Promise<TeamRunRecord | null> {
    return readJsonFile<TeamRunRecord | null>(getManifestPath(this.cwd, teamRunId), null);
  }

  async readArtifact(teamRunId: string, artifactId: string): Promise<{artifact: TeamArtifact; content: string} | null> {
    const record = await this.getRun(teamRunId);
    const artifact = record?.artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact) {
      return null;
    }
    const content = await fs.readFile(path.join(getRunDir(this.cwd, teamRunId), artifact.path), 'utf8').catch(() => null);
    return content === null ? null : {artifact, content};
  }
}
