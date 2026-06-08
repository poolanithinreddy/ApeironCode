#!/usr/bin/env -S npx tsx
// Phase 17E Task A routing audit.
// Exercises every detector against the 8 dogfood prompts and reports
// exactly which short-circuit step fires before the generic agent loop.
//
// Run with: npx tsx scripts/routing-audit.mjs

import {classifyCodingIntent, isAutonomousCodingIntent} from '../src/agent/codingIntent.ts';
import {detectErrorPaste} from '../src/agent/errorPasteIntent.ts';
import {detectAppActionRequest} from '../src/agent/runAppRuntime.ts';
import {decomposeUserRequest} from '../src/agent/requestDecomposition.ts';
import {detectSimpleAction} from '../src/agent/simpleActionRouter.ts';
import {canExecuteSimpleActionDirectly} from '../src/agent/simpleActionExecutor.ts';
import {isPureChatIntent} from '../src/agent/intentClassifier.ts';
import {detectIncompleteSetupPhrase} from '../src/agent/pendingInstruction.ts';
import {classifyToolExposureMode, selectToolsForPrompt} from '../src/tools/exposurePolicy.ts';

const SCENARIOS = [
  {n: 1, prompt: 'hi', workspaceHasAppFiles: false, expect: 'generic-loop (pure chat, tools=[])'},
  {n: 2, prompt: 'tell me what files are in this repo and create a folder named calendar', workspaceHasAppFiles: false, expect: 'combined'},
  {n: 3, prompt: 'Build a calculator web app using HTML CSS JS', workspaceHasAppFiles: false, expect: 'autonomous (build_static_app)'},
  {n: 4, prompt: 'make the UI premium like an iPhone calculator and fix background', workspaceHasAppFiles: true, expect: 'autonomous (modify_existing_app)'},
  {n: 5, prompt: 'can u create a to do application with next js that has to be super with the ui and ux', workspaceHasAppFiles: false, expect: 'autonomous (build_framework_app)'},
  {n: 6, prompt: 'run the application and fix any errors and all', workspaceHasAppFiles: true, expect: 'runAppRuntime (build-fix)'},
  {n: 7, prompt: 'the application is not complete yet there is nothing to add like no option there is just text that it?', workspaceHasAppFiles: true, expect: 'autonomous (modify_existing_app)'},
  {n: 8, prompt: "Cannot read properties of undefined (reading 'bodyBackgroundColor')", workspaceHasAppFiles: true, expect: 'errorFixRuntime'},
  // --- Adversarial prompts: things that *might* fall through to the generic
  //     loop. We do not pre-judge — we just want to see what the runtime does.
  {n: 9, prompt: 'explain this codebase to me', workspaceHasAppFiles: false, expect: '(any: read-only question)'},
  {n: 10, prompt: 'why is my function returning undefined?', workspaceHasAppFiles: true, expect: '(any: generic dev question)'},
  {n: 11, prompt: 'do the following changes in the web app', workspaceHasAppFiles: true, expect: 'pending-instruction'},
  {n: 12, prompt: '1. Make the header dark blue\n2. Add a search bar', workspaceHasAppFiles: true, expect: '(any: continuation handled in Agent.ts before router)'},
  {n: 13, prompt: 'add a login page', workspaceHasAppFiles: true, expect: '(any: small feature add)'},
  {n: 14, prompt: 'write a python script that downloads RSS feeds', workspaceHasAppFiles: false, expect: '(any: language outside frontend regex)'},
  {n: 15, prompt: 'fix the failing test', workspaceHasAppFiles: true, expect: '(any: bug-fix intent)'},
  {n: 16, prompt: 'TypeError: foo is not a function\n    at handle (server.js:23)', workspaceHasAppFiles: true, expect: 'errorFixRuntime'},
  {n: 17, prompt: 'commit and push', workspaceHasAppFiles: true, expect: '(any: git command request)'},
  {n: 18, prompt: 'read package.json', workspaceHasAppFiles: true, expect: 'simple-action'},
];

const padR = (s, n) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

const routeOne = (s) => {
  const {prompt, workspaceHasAppFiles} = s;

  if (detectIncompleteSetupPhrase(prompt)) return {step: 'pending-instruction', detail: 'ASK_FOR_DETAILS_MESSAGE'};

  const decomp = decomposeUserRequest(prompt);
  if (decomp.length >= 2) return {step: 'combined', detail: `${decomp.length} actions: ${decomp.map((a) => a.kind ?? 'unknown').join(', ')}`};

  const err = detectErrorPaste(prompt);
  if (err.isError) return {step: 'errorFixRuntime', detail: `${err.errorType}${err.symbol ? ` (symbol=${err.symbol})` : ''}`};

  const appAction = detectAppActionRequest(prompt);
  if (appAction) return {step: 'runAppRuntime', detail: `mode=${appAction}`};

  const intent = classifyCodingIntent(prompt, '', {workspaceHasAppFiles});
  if (isAutonomousCodingIntent(intent)) return {step: 'autonomous', detail: `intent=${intent.kind}`};

  const simple = detectSimpleAction(prompt);
  if (simple && canExecuteSimpleActionDirectly(simple)) return {step: 'simple-action', detail: `kind=${simple.kind}`};

  const pureChat = isPureChatIntent(prompt);
  const exposureMode = classifyToolExposureMode(prompt);
  return {step: 'generic-loop', detail: `pureChat=${pureChat} exposureMode=${exposureMode} intentFallback=${intent.kind}`};
};

const results = SCENARIOS.map((s) => ({...s, ...routeOne(s)}));

console.log('PHASE 17E — ROUTING AUDIT (Task A)\n');
console.log('Each prompt is run through every detector in Agent.run() order.\n');
for (const r of results) {
  const ok = (r.expect.includes(r.step) || (r.step === 'autonomous' && r.expect.includes('autonomous')) || (r.expect.includes('generic-loop') && r.step === 'generic-loop'));
  const mark = ok ? '✅' : '⚠️ ';
  console.log(`${mark} #${r.n} ${padR(`[${r.step}]`, 22)} ${r.prompt.slice(0, 80)}`);
  console.log(`     expect: ${r.expect}`);
  console.log(`     detail: ${r.detail}`);
  console.log('');
}

const fellThrough = results.filter((r) => r.step === 'generic-loop');
if (fellThrough.length === 0) {
  console.log('Every scenario short-circuits before the generic agent loop.');
} else {
  console.log(`${fellThrough.length} scenario(s) reach the generic agent loop. Tool exposure:`);
  for (const r of fellThrough) {
    const decision = selectToolsForPrompt(r.prompt, undefined, [
      {name: 'read_file', description: 'Read a file'},
      {name: 'write_file', description: 'Write a file'},
      {name: 'run_command', description: 'Run a command'},
      {name: 'todo_write', description: 'Write todos'},
      {name: 'command_output', description: 'Read command output'},
      {name: 'grep', description: 'Search'},
      {name: 'list_files', description: 'List files'},
      {name: 'project_tree', description: 'Project tree'},
    ]);
    console.log(`  #${r.n} -> tools=${JSON.stringify(decision.includedTools)} | ${decision.explanation}`);
  }
}
