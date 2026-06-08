import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness, toolChunks} from './harness.js';

const premiumPlan = JSON.stringify({
  commands: [],
  files: [
    {content: '<!doctype html><body class="dark"><h1>App</h1><script src="app.js"></script></body>', operation: 'overwrite', path: 'index.html'},
    {content: 'body.dark{background:#000;color:#fff}', operation: 'overwrite', path: 'styles.css'},
    {content: 'document.body.classList.add("dark");', operation: 'overwrite', path: 'app.js'},
  ],
  summary: 'Make UI premium with true black background',
  validation: ['Open index.html'],
});

const notesPlan = JSON.stringify({
  commands: [],
  files: [
    {content: 'const notes=JSON.parse(localStorage.getItem("notes")||"[]");localStorage.setItem("notes",JSON.stringify(notes));', operation: 'overwrite', path: 'app.js'},
  ],
  summary: 'Add notes to tasks, keep localStorage',
  validation: ['Open index.html'],
});

const webFixtures = {
  'index.html': '<h1>Old</h1><script src="app.js"></script>',
  'styles.css': 'body{}',
  'app.js': 'console.log("old")',
};

describe('core dogfood flow', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('1. hi → chat, no tools', async () => {
    harness = await new E2EHarness({scripts: ['Hello!']}).setup();
    const run = await harness.run('hi');
    expect(run.toolCalls).toEqual([]);
  });

  it('2. inspect repo + create folder → no provider, folder created', async () => {
    harness = await new E2EHarness({
      fixtures: {'readme.md': 'x'},
      scripts: ['provider should not run'],
    }).setup();
    const run = await harness.run('tell me what files are in this repo and create a folder named calendar');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.filesChanged).toContain('calendar');
    expect(run.result.finalMessage.content).toMatch(/calendar/u);
  });

  it('3. bare "do the following changes" waits, no tools, no provider', async () => {
    harness = await new E2EHarness({scripts: ['provider should not run']}).setup();
    const run = await harness.run('do the following changes in the web app');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.toolCalls).toEqual([]);
    expect(run.result.finalMessage.content).toMatch(/list the specific changes/u);
  });

  it('4. follow-up numbered instruction continues pending task and edits files', async () => {
    harness = await new E2EHarness({fixtures: webFixtures, scripts: [premiumPlan]}).setup();
    const first = await harness.run('do the following changes in the web app');
    expect(first.providerCalls).toHaveLength(0);
    const second = await harness.run('1. Make the UI premium with a true black/dark background by default.');
    expect(second.providerCalls).toHaveLength(1);
    expect(second.toolCalls.map((c) => c.input.path)).toEqual(['index.html', 'styles.css', 'app.js']);
    await harness.assertFileContains('styles.css', '#000');
  });

  it('5. update existing app reads files and applies provider plan', async () => {
    harness = await new E2EHarness({fixtures: webFixtures, scripts: [notesPlan]}).setup();
    const run = await harness.run('Update this app to add notes to tasks and keep localStorage');
    expect(run.providerCalls).toHaveLength(1);
    await harness.assertFileContains('app.js', 'localStorage');
  });

  it('8. invalid read_file args → read_file-specific error, never write_file, no loop', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('read_file', {}), 'retry should not run'],
    }).setup();
    const run = await harness.run('inspect the project and read the main file');
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]?.error).toMatch(/read_file requires/u);
    expect(run.toolCalls[0]?.error ?? '').not.toMatch(/write_file/u);
  });

  it('9. invalid write_file args → write_file-specific error, no loop', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('write_file', {}), 'retry should not run'],
    }).setup();
    const run = await harness.run('write the config file');
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]?.error).toMatch(/write_file requires path and content/u);
  });

  it('10. invalid todo_write → clean error, no loop, no memory', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('todo_write', {}), 'retry should not run'],
    }).setup();
    const run = await harness.run('organize my todo list');
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0]?.error).toMatch(/todo_write requires|requires a todos array/u);
    expect(run.result.finalMessage.content).not.toContain('ZodError');
  });

  it('12. no stale memory/task/session facts in normal failure output', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('write_file', {}), 'retry should not run'],
    }).setup();
    const run = await harness.run('write the config file');
    expect(run.result.finalMessage.content).not.toMatch(/pitfall|Provider returned|ZodError|stale memory/u);
  });

  // Phase 17B scenarios.
  const calcBuildPlan = JSON.stringify({
    commands: [],
    files: [
      {content: '<!doctype html><div id="display">0</div><div class="keys"><button>7</button><button>8</button><button>9</button><button>/</button><button>4</button><button>5</button><button>6</button><button>*</button><button>1</button><button>2</button><button>3</button><button>-</button><button>0</button><button>+</button><button id="clear">AC</button><button id="equals">=</button></div><script src="script.js"></script>', operation: 'create', path: 'calculator/index.html'},
      {content: '.keys{display:grid}#display{font-family:sans-serif}', operation: 'create', path: 'calculator/styles.css'},
      {content: 'let expr="";document.querySelectorAll("button").forEach(b=>b.onclick=()=>{const v=b.textContent;if(v==="AC"){expr=""}else if(v==="="){expr=String(eval(expr))}else{expr+=v}document.getElementById("display").textContent=expr||"0"});', operation: 'create', path: 'calculator/script.js'},
    ],
    summary: 'Build calculator',
    validation: ['Open calculator/index.html'],
  });
  const calcPremiumPlan = JSON.stringify({
    commands: [],
    files: [
      {content: '<!doctype html><body class="ios"><div id="display">0</div><div class="keys"><button>7</button><button>8</button><button>9</button><button>/</button><button>1</button><button>2</button><button>3</button><button>-</button><button>0</button><button>+</button><button>*</button><button id="clear">AC</button><button id="equals">=</button></div><script src="script.js"></script></body>', operation: 'overwrite', path: 'calculator/index.html'},
      {content: 'body.ios{background:#000;font-family:-apple-system,sans-serif}.keys{display:grid;gap:12px}button{border-radius:18px;transition:all .2s}button:hover{box-shadow:0 6px 18px rgba(0,0,0,.5)}', operation: 'overwrite', path: 'calculator/styles.css'},
      {content: 'document.body.classList.add("ios");let expr="";document.querySelectorAll("button").forEach(b=>b.onclick=()=>{const v=b.textContent;if(v==="AC"){expr=""}else if(v==="="){expr=String(eval(expr))}else{expr+=v}document.getElementById("display").textContent=expr||"0"});', operation: 'overwrite', path: 'calculator/script.js'},
    ],
    summary: 'iPhone-style premium calculator, fixed background',
    validation: ['Open calculator/index.html'],
  });

  it('13. build calculator then premium-iphone modify reads calculator files deterministically', async () => {
    harness = await new E2EHarness({scripts: [calcBuildPlan, calcPremiumPlan]}).setup();
    const build = await harness.run('Build a calculator web app using HTML CSS JS');
    expect(build.toolCalls.map((c) => c.input.path)).toEqual([
      'calculator/index.html', 'calculator/styles.css', 'calculator/script.js',
    ]);
    const mod = await harness.run(
      'Well i dont like the ui and ux make the ui and ux premium like a iphone calculator in web and also fix any errors and background as well ok?',
    );
    expect(mod.providerCalls.length).toBeGreaterThanOrEqual(1);
    // Task F regression: no read_file tool call (and none with undefined path).
    expect(mod.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(mod.toolCalls.every((c) => c.toolName === 'write_file')).toBe(true);
    expect(mod.toolCalls.map((c) => c.input.path)).toEqual([
      'calculator/index.html', 'calculator/styles.css', 'calculator/script.js',
    ]);
    await harness.assertFileContains('calculator/styles.css', '#000');
  });

  it('14. run-app fuzzy-matches todo→todo-list, reads package.json, no undefined read_file', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'todo-list/package.json': '{"name":"todo-list"}',
        'todo-list/pages/index.js': 'export default ()=>null',
        'todo-list/styles/globals.css': 'body{}',
      },
      scripts: ['provider should not run'],
    }).setup();
    const run = await harness.run('run this todo app by first cd todo and then run');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(run.result.finalMessage.content).toMatch(/todo-list/u);
  });

  it('15. create-next-app conflict: partial app detected, not re-scaffolded', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'todo-list/package.json': '{"scripts":{}}',
        'todo-list/pages/_app.js': 'export default ({Component})=>null',
        'todo-list/styles/globals.css': 'body{}',
      },
      scripts: ['provider should not run'],
    }).setup();
    const run = await harness.run('run this todo app by first cd todo and then run');
    expect(run.providerCalls).toHaveLength(0);
    expect(run.result.finalMessage.content).toMatch(/existing\/partial framework app|existing app rather than re-scaffolding/u);
  });
});
