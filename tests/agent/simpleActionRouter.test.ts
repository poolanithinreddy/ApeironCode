import {describe, expect, it} from 'vitest';

import {
  detectSimpleAction,
  formatSimpleActionPlan,
  shouldBypassHeavyContextForSimpleAction,
  toolsForSimpleAction,
} from '../../src/agent/simpleActionRouter.js';

describe('detectSimpleAction', () => {
  it('detects create file with explicit name in root', () => {
    const a = detectSimpleAction('well create a file named hello.md in the root');
    expect(a?.kind).toBe('create_file');
    expect(a?.path).toBe('hello.md');
    expect(a?.mutating).toBe(true);
  });

  it('detects "make hello.md in root"', () => {
    expect(detectSimpleAction('make hello.md in root')?.kind).toBe('create_file');
  });

  it('detects rename', () => {
    const a = detectSimpleAction('rename README.md to read.md');
    expect(a?.kind).toBe('rename_file');
    expect(a?.path).toBe('README.md');
    expect(a?.toPath).toBe('read.md');
  });

  it('detects delete and create folder', () => {
    expect(detectSimpleAction('delete the file old.txt')?.kind).toBe('delete_file');
    expect(detectSimpleAction('create a folder named docs')?.kind).toBe('create_folder');
  });

  it('detects run tests and run command', () => {
    expect(detectSimpleAction('run the tests')?.kind).toBe('run_tests');
    const cmd = detectSimpleAction('run npm run build');
    expect(cmd?.kind).toBe('run_command');
    expect(cmd?.command).toBe('npm run build');
  });

  it('detects project tree, list, and read file', () => {
    expect(detectSimpleAction('show project tree')?.kind).toBe('project_tree');
    expect(detectSimpleAction('list the files')?.kind).toBe('list_files');
    expect(detectSimpleAction('read src/index.ts')?.kind).toBe('read_file');
  });

  it('does NOT treat explanation/feature prompts as simple actions', () => {
    expect(detectSimpleAction('explain this repo')).toBeNull();
    expect(detectSimpleAction('implement authentication with JWT and refresh tokens')).toBeNull();
    expect(detectSimpleAction('hi')).toBeNull();
  });

  it('detects plain static web app scaffold prompts', () => {
    const action = detectSimpleAction('Create a simple modern web app in this folder using plain HTML, CSS, and JavaScript');
    expect(action?.kind).toBe('static_web_app');
    expect(action?.files).toEqual(['index.html', 'styles.css', 'app.js']);
    expect(action?.theme).toContain('modern');
  });

  it('detects the real static web application prompt', () => {
    const action = detectSimpleAction('Create a simple modern web application in this folder using plain HTML, CSS, and JavaScript.');
    expect(action?.kind).toBe('static_web_app');
    expect(action?.files).toEqual(['index.html', 'styles.css', 'app.js']);
    expect(action?.theme).toContain('modern');
    expect(action?.theme).toContain('web application');
  });

  it('detects simple modern web app and explicit html/css/js file prompts', () => {
    expect(detectSimpleAction('make a basic html css js app')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('create a plain html css js website')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('create index.html styles.css app.js')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('build a simple landing page with html css and javascript')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('make a simple static website')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('make a simple frontend app without frameworks')?.kind).toBe('static_web_app');
    expect(detectSimpleAction('build a simple website in this folder')?.kind).toBe('static_web_app');
  });

  it('does not route React/Vite or large SaaS prompts to the static scaffold', () => {
    expect(detectSimpleAction('create a React Vite app')).toBeNull();
    expect(detectSimpleAction('create a Next.js app with Tailwind')).toBeNull();
    expect(detectSimpleAction('build a large SaaS app with auth payments and dashboard')).toBeNull();
    expect(detectSimpleAction('build a simple website with backend auth and database')).toBeNull();
  });

  it('does not let compound dangerous prompts bypass safety', () => {
    expect(detectSimpleAction('create a simple static website and delete package.json')).toBeNull();
    expect(detectSimpleAction('create a simple static website and install vite')).toBeNull();
  });

  it('marks read/list/tree as non-mutating and create/rename as mutating', () => {
    expect(detectSimpleAction('show project tree')?.mutating).toBe(false);
    expect(detectSimpleAction('create a file named a.md')?.mutating).toBe(true);
  });
});

describe('formatSimpleActionPlan / bypass / tools', () => {
  it('formats a concise plan and flags approval for writes', () => {
    const a = detectSimpleAction('create a file named hello.md in the root')!;
    expect(formatSimpleActionPlan(a)).toContain('requires approval');
    expect(formatSimpleActionPlan(a)).not.toContain('\n');
  });

  it('bypasses heavy context for any detected simple action', () => {
    expect(shouldBypassHeavyContextForSimpleAction(detectSimpleAction('show project tree'))).toBe(true);
    expect(shouldBypassHeavyContextForSimpleAction(null)).toBe(false);
  });

  it('maps actions to a minimal tool set', () => {
    expect(toolsForSimpleAction(detectSimpleAction('create a file named x.md')!)).toEqual(['write_file']);
    expect(toolsForSimpleAction(detectSimpleAction('create a simple modern web app with html css js')!)).toEqual(['write_file']);
    expect(toolsForSimpleAction(detectSimpleAction('show project tree')!)).toContain('project_tree');
  });
});
