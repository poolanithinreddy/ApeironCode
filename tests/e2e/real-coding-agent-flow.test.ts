import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness, toolChunks} from './harness.js';

const taskAppPlan = JSON.stringify({
  commands: [],
  files: [
    {content: '<!doctype html><input id="task" type="text"/><button id="add">Add</button><ul id="tasks"></ul><script src="app.js"></script>', operation: 'create', path: 'index.html'},
    {content: '.complete{text-decoration:line-through}.filters{display:flex}', operation: 'create', path: 'styles.css'},
    {content: 'let tasks=JSON.parse(localStorage.getItem("tasks")||"[]");function render(){document.getElementById("tasks").innerHTML="";tasks.map((t,i)=>{const li=document.createElement("li");const cb=document.createElement("input");cb.type="checkbox";cb.checked=t.done;cb.onchange=()=>{t.done=!t.done;save()};const del=document.createElement("button");del.textContent="delete";del.onclick=()=>{tasks.splice(i,1);save()};li.append(cb,t.text,del);document.getElementById("tasks").append(li)})}function save(){localStorage.setItem("tasks",JSON.stringify(tasks));render()}document.getElementById("add").onclick=()=>{tasks.push({text:document.getElementById("task").value,done:false});save()};render();', operation: 'create', path: 'app.js'},
  ],
  summary: 'Build task manager',
  validation: ['Open index.html'],
});

const calendarPlan = JSON.stringify({
  commands: [],
  files: [
    {content: '<!doctype html><h1>Calendar</h1><div id="calendar"></div><script src="app.js"></script>', operation: 'overwrite', path: 'index.html'},
    {content: '.calendar{display:grid;grid-template-columns:repeat(7,1fr)}', operation: 'overwrite', path: 'styles.css'},
    {content: 'document.querySelector("#calendar").textContent = "Calendar app";', operation: 'overwrite', path: 'app.js'},
  ],
  summary: 'Improve app into calendar',
  validation: ['Open index.html'],
});

describe('real coding agent flow', () => {
  let harness: E2EHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('hi chats without tools', async () => {
    harness = await new E2EHarness({scripts: ['Hello!']}).setup();
    const run = await harness.run('hi');
    expect(run.toolCalls).toEqual([]);
    expect(run.providerCalls).toHaveLength(1);
  });

  it('create calendar folder is deterministic and approval-gated', async () => {
    harness = await new E2EHarness({scripts: ['provider should not run']}).setup();
    const run = await harness.run('create calendar folder');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.filesChanged).toEqual(['calendar']);
  });

  it('delete app.js and styles.css deletes both without provider', async () => {
    harness = await new E2EHarness({fixtures: {'app.js': 'x', 'styles.css': 'y'}, scripts: ['provider should not run']}).setup();
    const run = await harness.run('delete app.js and styles.css');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.filesChanged).toEqual(['app.js', 'styles.css']);
  });

  it('builds a task manager from a provider file plan, not canned template', async () => {
    harness = await new E2EHarness({scripts: [taskAppPlan]}).setup();
    const run = await harness.run('Build a small task manager web app using HTML, CSS, and JavaScript. It should save to localStorage.');
    expect(run.providerCalls).toHaveLength(1);
    expect(run.providerCalls[0]?.tools).toEqual([]);
    expect(run.filesChanged).toEqual(['index.html', 'styles.css', 'app.js']);
    await harness.assertFileContains('app.js', 'localStorage');
    expect(run.toolCalls.every((call) => call.toolName === 'write_file')).toBe(true);
  });

  it('improves an existing app into a calendar app with valid paths', async () => {
    harness = await new E2EHarness({
      fixtures: {'index.html': '<h1>Old</h1>', 'styles.css': 'body{}', 'app.js': 'console.log("old")'},
      scripts: [calendarPlan],
    }).setup();
    const run = await harness.run('Improve this app into a calendar app.');
    expect(run.providerCalls).toHaveLength(1);
    expect(run.toolCalls.map((call) => call.input.path)).toEqual(['index.html', 'styles.css', 'app.js']);
    await harness.assertFileContains('index.html', 'Calendar');
  });

  it('invalid model file plan fails cleanly with no writes', async () => {
    harness = await new E2EHarness({scripts: ['```json\n{"files":[]}\n```']}).setup();
    const run = await harness.run('Build a small task manager web app using HTML CSS JS');
    expect(run.toolCalls).toEqual([]);
    expect(run.result.finalMessage.content).toContain('No files were changed');
  });

  it('malformed todo_write does not loop or save memory', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('todo_write', {}), 'provider retry should not run'],
    }).setup();
    const run = await harness.run('organize my todo list');
    expect(run.providerCalls).toHaveLength(1);
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]?.error).toMatch(/requires (?:a path|path|path and content|a todos array|todos)/u);
    expect(run.result.finalMessage.content).not.toContain('ZodError');
  });
});
