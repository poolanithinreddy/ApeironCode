import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';

const incompleteTodoPlan = JSON.stringify({
  commands: [],
  files: [
    {content: '{"name":"todo","scripts":{"dev":"next dev"},"dependencies":{"next":"14"}}', operation: 'create', path: 'package.json'},
    {content: 'export default function Home(){return <div><h1>Todo</h1><p>welcome to my todo app</p></div>}', operation: 'create', path: 'pages/index.js'},
    {content: 'export default function App({Component,pageProps}){return <Component {...pageProps}/>}', operation: 'create', path: 'pages/_app.js'},
    {content: 'body{font-family:sans-serif}', operation: 'create', path: 'styles/globals.css'},
  ],
  summary: 'Initial todo app',
  validation: ['next build'],
});

const fullTodoPlan = JSON.stringify({
  commands: [],
  files: [
    {
      content: `import {useState,useEffect} from 'react';
export default function Home(){
  const [todos,setTodos]=useState([]);
  const [text,setText]=useState('');
  useEffect(()=>{setTodos(JSON.parse(localStorage.getItem('todos')||'[]'));},[]);
  const save=(n)=>{setTodos(n);localStorage.setItem('todos',JSON.stringify(n));};
  const addTodo=()=>{ if(text){ save([...todos,{t:text,done:false}]); setText(''); } };
  const toggle=(i)=>save(todos.map((x,j)=>j===i?{...x,done:!x.done}:x));
  const removeTodo=(i)=>save(todos.filter((_,j)=>j!==i));
  return (<div className="wrap">
    <input value={text} onChange={e=>setText(e.target.value)} placeholder="Add task"/>
    <button onClick={addTodo}>Add</button>
    <ul>{todos.map((td,i)=>(<li key={i}><input type="checkbox" checked={td.done} onChange={()=>toggle(i)}/>{td.t}<button onClick={()=>removeTodo(i)}>delete</button></li>))}</ul>
  </div>);
}`,
      operation: 'overwrite',
      path: 'pages/index.js',
    },
    {content: 'body{font-family:Inter,sans-serif;background:#0b0b0f;color:#fff}.wrap{max-width:480px;margin:40px auto;display:flex;flex-direction:column;gap:12px}button{border-radius:10px;transition:all .2s}button:hover{box-shadow:0 4px 14px rgba(0,0,0,.4)}', operation: 'overwrite', path: 'styles/globals.css'},
  ],
  summary: 'Functional premium todo app',
  validation: ['next build'],
});

describe('app completion dogfood (Phase 17C)', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('1-7. incomplete todo app triggers acceptance correction, summary reports passed', async () => {
    harness = await new E2EHarness({scripts: [incompleteTodoPlan, fullTodoPlan]}).setup();
    const run = await harness.run(
      'can u create a to do application with next js that has to be super with the ui and ux and dont reject any thing implemet',
    );
    expect(run.providerCalls.length).toBeGreaterThanOrEqual(2); // initial + correction
    expect(run.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(run.toolCalls.some((c) => c.toolName === 'todo_write')).toBe(false);
    expect(run.toolCalls.every((c) => c.toolName === 'write_file')).toBe(true);
    await harness.assertFileContains('pages/index.js', 'localStorage');
    await harness.assertFileContains('pages/index.js', 'removeTodo');
    expect(run.result.finalMessage.content).toMatch(/Feature acceptance: passed/);
    expect(run.result.finalMessage.content).not.toMatch(/application is ready/i);
  });

  it('8-11. "run the application and fix any errors" → build-fix, no empty command, no todo_write', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'todo-list/package.json': '{"name":"todo-list","scripts":{}}',
        'todo-list/pages/index.js': 'export default ()=>null',
      },
      scripts: ['provider should not run'],
    }).setup();
    const run = await harness.run('run the application and fix any errors and all');
    expect(run.toolCalls.some((c) => c.toolName === 'todo_write')).toBe(false);
    expect(run.toolCalls.some((c) => c.input?.command === undefined && c.toolName === 'run_command')).toBe(false);
    expect(run.result.finalMessage.content).toMatch(/No `build` script|did not claim success|Build/);
    expect(run.result.finalMessage.content).not.toMatch(/run_command requires command/);
  });

  it('12-15. "application is not complete" repairs app via acceptance, no read_file undefined', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'package.json': '{"name":"todo","scripts":{"dev":"next dev"}}',
        'pages/index.js': 'export default function Home(){return <div><p>just text</p></div>}',
        'pages/_app.js': 'export default function App({Component,pageProps}){return <Component {...pageProps}/>}',
        'styles/globals.css': 'body{}',
      },
      scripts: [fullTodoPlan],
    }).setup();
    const run = await harness.run(
      'the application is not complete yet there is nothing to add like no option there is just text that it?',
    );
    expect(run.providerCalls.length).toBeGreaterThanOrEqual(1);
    expect(run.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(run.toolCalls.some((c) => c.toolName === 'todo_write')).toBe(false);
    await harness.assertFileContains('pages/index.js', 'removeTodo');
    expect(run.result.finalMessage.content).not.toMatch(/pitfall|Provider returned|ZodError/);
  });
});
