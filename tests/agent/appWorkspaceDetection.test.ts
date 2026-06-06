import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  findAppDirectories,
  hasWorkspaceAppFiles,
  resolveAppDirByHint,
} from '../../src/agent/appWorkspaceDetection.js';
import {detectRunAppRequest} from '../../src/agent/runAppRuntime.js';

describe('appWorkspaceDetection', () => {
  let cwd = '';
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'awd-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  it('detects nested app dirs and a partial framework app', async () => {
    await fs.mkdir(path.join(cwd, 'todo-list/pages'), {recursive: true});
    await fs.mkdir(path.join(cwd, 'todo-list/styles'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{"scripts":{"dev":"next dev"}}');
    expect(await hasWorkspaceAppFiles(cwd)).toBe(true);
    const dirs = await findAppDirectories(cwd);
    const todo = dirs.find((d) => d.dir === 'todo-list');
    expect(todo?.hasPackageJson).toBe(true);
    expect(todo?.partialApp).toBe(true);
  });

  it('fuzzy-matches "todo" to "todo-list"', async () => {
    await fs.mkdir(path.join(cwd, 'todo-list'), {recursive: true});
    await fs.writeFile(path.join(cwd, 'todo-list/package.json'), '{}');
    const dirs = await findAppDirectories(cwd);
    expect(resolveAppDirByHint(dirs, 'todo')?.dir).toBe('todo-list');
  });

  it('returns false when no app files exist', async () => {
    expect(await hasWorkspaceAppFiles(cwd)).toBe(false);
  });
});

describe('detectRunAppRequest', () => {
  it('detects run-app phrasing', () => {
    expect(detectRunAppRequest('run this todo app by first cd todo and then run')).toBe(true);
    expect(detectRunAppRequest('start the app')).toBe(true);
    expect(detectRunAppRequest('run the dev server')).toBe(true);
  });

  it('does not hijack build/modify prompts', () => {
    expect(detectRunAppRequest('build a calculator web app')).toBe(false);
    expect(detectRunAppRequest('make the UI premium and fix errors')).toBe(false);
    expect(detectRunAppRequest('hi')).toBe(false);
  });
});
