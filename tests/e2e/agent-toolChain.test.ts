import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {afterEach, describe, expect, it} from 'vitest';

import {compressToolOutput} from '../../src/tools/outputCompressor.js';
import {E2EHarness, toolChunks} from './harness.js';

const execFileAsync = promisify(execFile);

describe('agent tool-chain E2E', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
  });

  it('runs readFile -> editFile -> runCommand through native tool calls', async () => {
    harness = await new E2EHarness({
      fixtures: {'src/value.ts': 'export const value = 1;\n', 'package.json': '{"scripts":{"test":"node -e \\"process.exit(0)\\""}}'},
      scripts: [
        toolChunks('read_file', {path: 'src/value.ts'}),
        toolChunks('edit_file', {path: 'src/value.ts', search: 'value = 1', replace: 'value = 2'}),
        toolChunks('run_command', {command: 'node -e "console.log(2)"'}),
        'Updated value and command succeeded.',
      ],
    }).setup();

    const run = await harness.run('Read, edit, and run a harmless command', {mode: 'edit'});

    expect(run.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(expect.arrayContaining(['read_file', 'edit_file', 'run_command']));
    await harness.assertFileContains('src/value.ts', 'value = 2');
  });

  it('runs grep/glob -> readFile -> patchFile', async () => {
    harness = await new E2EHarness({
      fixtures: {'src/target.ts': 'const marker = "old";\n'},
      scripts: [
        toolChunks('glob', {pattern: 'src/*.ts'}),
        toolChunks('grep', {pattern: 'marker', path: 'src'}),
        toolChunks('read_file', {path: 'src/target.ts'}),
        toolChunks('patch_file', {
          operations: [{replace: '"new"', search: '"old"', type: 'search_replace'}],
          path: 'src/target.ts',
        }),
        'Patched target.',
      ],
    }).setup();
    const run = await harness.run('Find marker and patch it', {mode: 'fix'});

    expect(run.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(expect.arrayContaining(['glob', 'grep', 'read_file', 'patch_file']));
    await harness.assertFileContains('src/target.ts', '"new"');
  });

  it('handles testRunner failure followed by edit and success', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'package.json': '{"scripts":{"test":"node test.js"}}',
        'src/math.js': 'exports.add = (a, b) => a - b;\n',
        'test.js': 'const fs=require("fs"); const src=fs.readFileSync("src/math.js","utf8"); if (!src.includes("a + b")) { console.error("FAIL add expected plus"); process.exit(1); } console.log("PASS");\n',
      },
      scripts: [
        toolChunks('test_runner', {command: 'node test.js'}),
        toolChunks('edit_file', {path: 'src/math.js', search: 'a - b', replace: 'a + b'}),
        toolChunks('test_runner', {command: 'node test.js'}),
        'Tests pass after the fix.',
      ],
    }).setup();
    const run = await harness.run('Fix the failing test', {mode: 'fix'});

    const testCalls = run.toolCalls.filter((toolCall) => toolCall.toolName === 'test_runner');
    expect(testCalls[0]?.status).toBe('success');
    expect(testCalls[0]?.result?.ok).toBe(false);
    expect(testCalls[1]?.result?.ok).toBe(true);
    await harness.assertFileContains('src/math.js', 'a + b');
  });

  it('collects gitStatus/gitDiff in a review workflow', async () => {
    harness = await new E2EHarness({
      fixtures: {'tracked.txt': 'before\n'},
      scripts: [
        toolChunks('git_status', {}),
        toolChunks('git_diff', {}),
        'Review complete.',
      ],
    }).setup();
    await execFileAsync('git', ['init'], {cwd: harness.workspace});
    await execFileAsync('git', ['add', 'tracked.txt'], {cwd: harness.workspace});
    await execFileAsync('git', ['commit', '-m', 'initial'], {
      cwd: harness.workspace,
      env: {...process.env, GIT_AUTHOR_EMAIL: 'test@example.com', GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test'},
    });
    await harness.createWorkspace({'tracked.txt': 'after\n'});

    const run = await harness.run('Review the current git diff', {mode: 'review'});
    expect(run.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(['git_status', 'git_diff']);
    expect(run.toolCalls[1]?.result?.output).toContain('-before');
  });

  it('compresses long failing test output while preserving the failure', () => {
    const output = [
      'noise\n'.repeat(200),
      'FAIL src/math.test.ts > add',
      'AssertionError: expected 2 to be 3',
      'src/math.test.ts:4:10',
      'Tests: 1 failed, 2 passed',
    ].join('\n');
    const compressed = compressToolOutput('test_runner', output, {
      maxTokens: 60,
      preserveErrors: true,
      preserveFailingTests: true,
      preserveStackTraces: true,
    });

    expect(compressed.compressedTokenEstimate).toBeLessThan(compressed.originalTokenEstimate);
    expect(compressed.content).toContain('FAIL src/math.test.ts');
    expect(compressed.content).toContain('expected 2 to be 3');
  });
});
