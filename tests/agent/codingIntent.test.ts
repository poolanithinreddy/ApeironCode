import {describe, expect, it} from 'vitest';

import {classifyCodingIntent} from '../../src/agent/codingIntent.js';

describe('classifyCodingIntent', () => {
  it('classifies required examples', () => {
    expect(classifyCodingIntent('hi').kind).toBe('pure_chat');
    expect(classifyCodingIntent('create calendar folder').kind).toBe('create_folder');
    expect(classifyCodingIntent('creare a calender folder').kind).toBe('create_folder');
    expect(classifyCodingIntent('delete app.js and styles.css').kind).toBe('delete_file');
    expect(classifyCodingIntent('Build a small task manager web app using HTML, CSS, and JavaScript.').kind).toBe('build_static_app');
    expect(classifyCodingIntent('Improve this app into a calendar app.').kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('run npm test').kind).toBe('run_tests');
  });

  it('routes vague follow-up tweaks to modify_existing_app when app files exist', () => {
    const opts = {workspaceHasAppFiles: true};
    expect(
      classifyCodingIntent(
        'Well i dont like the ui and ux make the ui and ux premium like a iphone calculator in web and also fix any errors and background as well ok?',
        '',
        opts,
      ).kind,
    ).toBe('modify_existing_app');
    expect(classifyCodingIntent('make it dark mode', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('add notes to tasks', '', opts).kind).toBe('modify_existing_app');
  });

  it('routes app-incomplete complaints to modify_existing_app when app files exist', () => {
    const opts = {workspaceHasAppFiles: true};
    expect(
      classifyCodingIntent(
        'the application is not complete yet there is nothing to add like no option there is just text that it?',
        '',
        opts,
      ).kind,
    ).toBe('modify_existing_app');
    expect(classifyCodingIntent('it is not working', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('the UI is bad', '', opts).kind).toBe('modify_existing_app');
  });

  it('does not route pure chat or fresh builds to modify_existing_app', () => {
    const opts = {workspaceHasAppFiles: true};
    expect(classifyCodingIntent('hi', '', opts).kind).toBe('pure_chat');
    expect(
      classifyCodingIntent('build a new calculator web app using HTML CSS JS', '', opts).kind,
    ).toBe('build_static_app');
  });

  it('without app files, a UI tweak does not become modify_existing_app', () => {
    expect(classifyCodingIntent('make it premium').kind).not.toBe('modify_existing_app');
  });

  it('separates full-stack from static apps', () => {
    const full = classifyCodingIntent('Build a full-stack app with auth, database, API, and React client.');
    expect(full.kind).toBe('build_full_stack_app');
    expect(full.requiresCommands).toBe(true);
  });

  it('routes app-feature-add prompts to modify_existing_app when app files exist (Phase 17E)', () => {
    const opts = {workspaceHasAppFiles: true};
    // The realistic prompts the audit surfaced as falling through.
    expect(classifyCodingIntent('add a login page', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('add an auth screen', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('add a settings page', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('add a dashboard page', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('implement user authentication', '', opts).kind).toBe('modify_existing_app');
    expect(classifyCodingIntent('create a profile screen', '', opts).kind).toBe('modify_existing_app');

    // Without app files, "add a login page" must NOT become modify_existing_app
    // (no existing app to modify). It can fall through to the unknown_coding
    // branch where the model is asked to plan it.
    expect(classifyCodingIntent('add a login page').kind).not.toBe('modify_existing_app');

    // False-positive guard: incidental "add" verbs are not feature adds.
    expect(classifyCodingIntent('add 2 numbers', '', opts).kind).not.toBe('modify_existing_app');
    expect(classifyCodingIntent('add comments to function foo', '', opts).kind).not.toBe('modify_existing_app');
  });

  it('routes JS framework app builds to build_framework_app, not build_static_app', () => {
    // Real user prompt: a Next.js todo app should not be misclassified as a
    // static HTML+CSS+JS scaffold just because "next js" contains "js".
    const nextTodo = classifyCodingIntent(
      'can u create a to do application with next js that has to be super with the ui and ux',
    );
    expect(nextTodo.kind).toBe('build_framework_app');
    expect(nextTodo.suggestedFiles).toEqual([]);
    expect(nextTodo.requiresProvider).toBe(true);
    expect(nextTodo.requiresFileWrites).toBe(true);

    expect(classifyCodingIntent('Build a React app with a counter.').kind).toBe('build_framework_app');
    expect(classifyCodingIntent('scaffold a SvelteKit project').kind).toBe('build_framework_app');
    expect(classifyCodingIntent('create a Vue app').kind).toBe('build_framework_app');
    // Plain HTML/CSS/JS must still classify as static.
    expect(
      classifyCodingIntent('Build a calculator web app using HTML CSS JS').kind,
    ).toBe('build_static_app');
  });

  it('does not depend on stale memory hints', () => {
    const intent = classifyCodingIntent('hi', 'old task: build a CRM', {memoryHints: ['user is building a SaaS']});
    expect(intent.kind).toBe('pure_chat');
    expect(intent.requiresFileWrites).toBe(false);
  });
});
