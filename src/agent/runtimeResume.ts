import path from 'node:path';

import {redactSecretLikeContent} from '../memory/safety.js';
import {ensureDirectory, fileExists, readJsonFile, writeJsonFile} from '../utils/fs.js';
import {getProjectConfigDir} from '../utils/paths.js';
import type {RuntimeStateSnapshot} from './runtimeState.js';

export interface RuntimeResumeSnapshot {
  changedFiles: string[];
  checkpointId?: string;
  createdAt: string;
  lastToolResultSummary?: string;
  plan?: string;
  prompt: string;
  sessionId: string;
  state: RuntimeStateSnapshot;
  verificationState?: string;
}

const snapshotDir = (cwd: string): string => path.join(getProjectConfigDir(cwd), 'runtime', 'snapshots');
const snapshotPath = (cwd: string, sessionId: string): string => path.join(snapshotDir(cwd), `${sessionId}.json`);

export const serializeRuntimeSnapshot = (snapshot: RuntimeResumeSnapshot): RuntimeResumeSnapshot => ({
  ...snapshot,
  changedFiles: snapshot.changedFiles.slice(0, 100),
  lastToolResultSummary: snapshot.lastToolResultSummary
    ? redactSecretLikeContent(snapshot.lastToolResultSummary).slice(0, 1000)
    : undefined,
  plan: snapshot.plan ? redactSecretLikeContent(snapshot.plan).slice(0, 4000) : undefined,
  prompt: redactSecretLikeContent(snapshot.prompt).slice(0, 2000),
  verificationState: snapshot.verificationState ? redactSecretLikeContent(snapshot.verificationState) : undefined,
});

export const saveRuntimeSnapshot = async (
  cwd: string,
  snapshot: RuntimeResumeSnapshot,
): Promise<void> => {
  await ensureDirectory(snapshotDir(cwd));
  await writeJsonFile(snapshotPath(cwd, snapshot.sessionId), serializeRuntimeSnapshot(snapshot));
};

export const loadRuntimeSnapshot = async (
  cwd: string,
  sessionId: string,
): Promise<RuntimeResumeSnapshot | null> => {
  const filePath = snapshotPath(cwd, sessionId);
  if (!(await fileExists(filePath))) return null;
  return readJsonFile<RuntimeResumeSnapshot | null>(filePath, null);
};

export const clearRuntimeSnapshot = async (
  cwd: string,
  snapshot: RuntimeResumeSnapshot,
): Promise<void> => {
  const fs = await import('node:fs/promises');
  await fs.rm(snapshotPath(cwd, snapshot.sessionId), {force: true});
};

export const canResume = (snapshot: RuntimeResumeSnapshot): boolean =>
  snapshot.state.phase === 'cancelled' || snapshot.state.phase === 'recovering' || snapshot.state.phase === 'checkpointing';

export const formatResumeSummary = (snapshot: RuntimeResumeSnapshot): string =>
  redactSecretLikeContent([
    `Session: ${snapshot.sessionId}`,
    `State: ${snapshot.state.formatted}`,
    `Prompt: ${snapshot.prompt}`,
    snapshot.checkpointId ? `Checkpoint: ${snapshot.checkpointId}` : '',
    snapshot.changedFiles.length ? `Changed files: ${snapshot.changedFiles.slice(0, 10).join(', ')}` : 'Changed files: none',
    snapshot.lastToolResultSummary ? `Last tool: ${snapshot.lastToolResultSummary}` : '',
  ].filter(Boolean).join('\n'));
