import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';

import {Agent} from '../../src/agent/Agent.js';
import {ConfigStore} from '../../src/config/config.js';
import type {ApprovalResponse} from '../../src/safety/approvals.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {createDefaultToolRegistry} from '../../src/tools/registry.js';

export interface WorkspaceSetup {
  projectDir: string;
  previousHome: string | undefined;
  cleanup: () => Promise<void>;
}

export async function createWorkspace(fixtureDir?: string): Promise<WorkspaceSetup> {
  const previousHome = process.env.HOME;
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-test-home-'));
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-test-project-'));

  process.env.HOME = homeDir;

  if (fixtureDir) {
    await fs.cp(fixtureDir, projectDir, {recursive: true});
  }

  return {
    projectDir,
    previousHome,
    cleanup: async () => {
      process.env.HOME = previousHome;
      await fs.rm(homeDir, {force: true, recursive: true});
      await fs.rm(projectDir, {force: true, recursive: true});
    },
  };
}

interface CreateAgentOptions {
  approvalHandler?: (request: unknown) => Promise<ApprovalResponse>;
  permissions?: string[];
}

export async function createAgent(
  projectDir: string,
  options?: CreateAgentOptions,
): Promise<Agent> {
  const store = new ConfigStore(projectDir);
  await store.patchUserConfig({
    approvalMode: 'bypass',
    defaultModel: 'mock-coder',
    defaultProvider: 'mock',
    permissions: options?.permissions ?? [],
  });
  const config = await store.load();
  return new Agent({
    config,
    cwd: projectDir,
    providerRegistry,
    toolRegistry: createDefaultToolRegistry(),
    approvalHandler: options?.approvalHandler,
  });
}

export function initGitRepo(projectDir: string): void {
  try {
    execSync('git init', {cwd: projectDir, stdio: 'pipe'});
    execSync('git config user.name "Test User"', {cwd: projectDir, stdio: 'pipe'});
    execSync('git config user.email "test@example.com"', {cwd: projectDir, stdio: 'pipe'});
  } catch {
    // Git may already be initialized or git not available in test env
  }
}

export function createGitCommit(projectDir: string, message: string): void {
  try {
    execSync('git add .', {cwd: projectDir, stdio: 'pipe'});
    execSync(`git commit -m "${message}"`, {cwd: projectDir, stdio: 'pipe'});
  } catch {
    // Commit may fail if nothing to commit
  }
}

export function getGitDiff(projectDir: string): string {
  try {
    return execSync('git diff', {cwd: projectDir, encoding: 'utf8'});
  } catch {
    return '';
  }
}

export function getGitLog(projectDir: string, lines: number = 5): string {
  try {
    return execSync(`git log -${lines} --oneline`, {cwd: projectDir, encoding: 'utf8'});
  } catch {
    return '';
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
