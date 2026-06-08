import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {Agent} from '../agent/Agent.js';
import {ConfigStore} from '../config/config.js';
import {providerRegistry} from '../providers/registry.js';
import {createDefaultToolRegistry} from '../tools/registry.js';

interface BenchTask {
  label: string;
  prompt: string;
}

const tasks: BenchTask[] = [
  {
    label: 'explain repo',
    prompt: 'Explain this repo in 3 bullets.',
  },
  {
    label: 'find bug',
    prompt: 'Read src/example.ts and explain what needs to change for tests to pass.',
  },
  {
    label: 'edit file',
    prompt: 'Read src/example.ts, replace "value = 1" with "value = 2", and summarize.',
  },
  {
    label: 'run test',
    prompt: 'Read src/example.ts, replace "value = 1" with "value = 2", run tests, and summarize.',
  },
  {
    label: 'review diff',
    prompt: 'Review the current git diff and summarize the main risk.',
  },
];

const fixtureRoot = path.resolve(process.cwd(), 'tests/fixtures/node-basic');

const createBenchProject = async (): Promise<string> => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-bench-project-'));
  await fs.cp(fixtureRoot, projectDir, {recursive: true});
  return projectDir;
};

const createBenchAgent = async (cwd: string): Promise<Agent> => {
  const store = new ConfigStore(cwd);
  await store.patchUserConfig({
    approvalMode: 'bypass',
    defaultModel: 'mock-coder',
    defaultProvider: 'mock',
  });
  const config = await store.load();

  return new Agent({
    config,
    cwd,
    providerRegistry,
    toolRegistry: createDefaultToolRegistry(),
  });
};

const runTask = async (task: BenchTask): Promise<{durationMs: number; label: string; output: string}> => {
  const projectDir = await createBenchProject();
  const previousHome = process.env.HOME;
  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'apeironcode-bench-home-'));

  try {
    const agent = await createBenchAgent(projectDir);
    const startTime = Date.now();
    const result = await agent.run({prompt: task.prompt});
    const durationMs = Date.now() - startTime;

    return {
      durationMs,
      label: task.label,
      output: result.finalMessage.content.split('\n')[0] ?? '',
    };
  } finally {
    process.env.HOME = previousHome;
    await fs.rm(projectDir, {force: true, recursive: true});
  }
};

const main = async (): Promise<void> => {
  process.stdout.write('ApeironCode benchmark (mock provider)\n');
  for (const task of tasks) {
    const result = await runTask(task);
    process.stdout.write(
      `${result.label.padEnd(12)} | ${result.durationMs.toString().padStart(4)} ms | ${result.output}\n`,
    );
  }
};

await main();