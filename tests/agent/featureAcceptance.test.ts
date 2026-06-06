import {describe, expect, it} from 'vitest';

import {
  detectAppKind,
  evaluateImplementedFeatures,
  extractFeatureRequirements,
  formatFeatureAcceptanceReport,
} from '../../src/agent/featureAcceptance.js';

const incompleteTodoPage = `--- pages/index.js ---
export default function Home(){ return <div><h1>Todo</h1><p>welcome</p></div> }`;

const realTodoPage = `--- pages/index.js ---
import {useState,useEffect} from 'react';
export default function Home(){
  const [todos,setTodos]=useState([]);
  const [text,setText]=useState("");
  useEffect(()=>{ setTodos(JSON.parse(localStorage.getItem('todos')||'[]')); },[]);
  const addTodo=()=>{ const n=[...todos,{t:text,done:false}]; setTodos(n); localStorage.setItem('todos',JSON.stringify(n)); };
  const removeTodo=(i)=>setTodos(todos.filter((_,x)=>x!==i));
  return (<div>
    <input value={text} onChange={e=>setText(e.target.value)} />
    <button onClick={addTodo}>Add</button>
    <ul>{todos.map((td,i)=><li key={i}><input type="checkbox" checked={td.done}/>{td.t}<button onClick={()=>removeTodo(i)}>delete</button></li>)}</ul>
  </div>);
}`;

describe('featureAcceptance', () => {
  it('detects app kind', () => {
    expect(detectAppKind('create a to do application with next js')).toBe('todo');
    expect(detectAppKind('make an iphone calculator')).toBe('calculator');
    expect(detectAppKind('build a landing page')).toBe('generic');
  });

  it('extracts todo requirements incl. premium + localStorage', () => {
    const {appKind, requirements} = extractFeatureRequirements(
      'can u create a to do application with next js that has to be super with the ui and ux',
    );
    expect(appKind).toBe('todo');
    const ids = requirements.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['add-input', 'add-button', 'list-render', 'delete', 'localstorage', 'premium-ui']));
  });

  it('fails acceptance for an incomplete text-only page', () => {
    const {requirements} = extractFeatureRequirements('create a to do nextjs app');
    const report = evaluateImplementedFeatures(requirements, incompleteTodoPage);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(expect.arrayContaining(['add-input', 'delete', 'localstorage']));
  });

  it('passes acceptance for a real functional todo app', () => {
    const {requirements} = extractFeatureRequirements('create a to do nextjs app with localStorage');
    const report = evaluateImplementedFeatures(requirements, realTodoPage);
    expect(report.ok).toBe(true);
    expect(formatFeatureAcceptanceReport(report)).toMatch(/Feature acceptance: passed/);
  });

  it('extracts calculator requirements and detects premium UI', () => {
    const {appKind, requirements} = extractFeatureRequirements('make an iphone-style premium calculator');
    expect(appKind).toBe('calculator');
    expect(requirements.map((r) => r.id)).toEqual(
      expect.arrayContaining(['digits', 'operators', 'equals', 'clear', 'display', 'premium-ui']),
    );
  });
});
