/**
 * Phase 17G real dogfood — covers the failures reported from interactive use:
 *  1. multi-line pasted prompts (InputBox truncation bug)
 *  2. detailed UI-repair prompt routes to modify_existing_app (not generic loop)
 *  3. explicit calculator file paths reach the workspace snapshot
 *  4. premium visual acceptance catches shallow CSS
 *
 * Uses ScriptedStreamingProvider on temp workspaces; no real network.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';
import {extractSubmittedInput} from '../../src/ui/InputBox.js';
import {classifyCodingIntent, isAutonomousCodingIntent} from '../../src/agent/codingIntent.js';
import {
  evaluateImplementedFeatures,
  extractFeatureRequirements,
} from '../../src/agent/featureAcceptance.js';

const filePlan = (
  summary: string,
  files: Array<{path: string; content: string; operation?: 'overwrite' | 'create' | 'delete' | 'rename'}>,
): string =>
  JSON.stringify({
    summary,
    commands: [],
    validation: [],
    files: files.map((f) => ({operation: f.operation ?? 'overwrite', path: f.path, content: f.content})),
  });

const DETAILED_MULTILINE_PROMPT = [
  'The calculator UI is not premium yet. Fix the layout properly.',
  '',
  'Problems:',
  '- The display is overflowing outside the calculator body.',
  '- The calculator is too wide.',
  '- The button grid does not look like an iPhone calculator.',
  '- Buttons should be rounded/circular with consistent spacing.',
  '- The background should be true dark/premium.',
  '- Use an iPhone-style layout with display on top, AC/÷/×/−, number grid, +, equals, 0, decimal.',
  '- Make it centered, responsive, visually polished, and keep all calculator functionality working.',
  '- Read calculator/index.html, calculator/styles.css, and calculator/script.js, then apply a complete fix.',
  '',
].join('\n');

const DETAILED_ONELINE_PROMPT =
  "The calculator UI is not premium yet. Fix the layout properly. Problems: the display is overflowing outside the calculator body; the calculator is too wide; the button grid does not look like an iPhone calculator; buttons should be rounded/circular with consistent spacing; the background should be true dark/premium; use an iPhone-style layout with display on top, AC/÷/×/−, number grid, +, equals, 0, decimal; make it centered, responsive, visually polished, and keep all calculator functionality working. Read calculator/index.html, calculator/styles.css, and calculator/script.js, then apply a complete fix.";

describe('Phase 17G real dogfood — interactive failures', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('multi-line pasted prompt reaches the runtime intact (was truncated at first newline)', () => {
    const submitted = extractSubmittedInput(DETAILED_MULTILINE_PROMPT);
    expect(submitted).not.toBeNull();
    expect(submitted).toContain('display is overflowing');
    expect(submitted).toContain('button grid does not look like an iPhone calculator');
    expect(submitted).toContain('Read calculator/index.html');
    expect(submitted).toContain('calculator/styles.css');
    expect(submitted).toContain('calculator/script.js');
    // Internal newlines preserved.
    expect((submitted ?? '').split('\n').length).toBeGreaterThanOrEqual(10);
  });

  it('detailed UI-repair prompt classifies as modify_existing_app', () => {
    // Workspace pretends to have a calculator subdir.
    const intentMulti = classifyCodingIntent(
      DETAILED_MULTILINE_PROMPT.trim(),
      '',
      {workspaceHasAppFiles: true},
    );
    expect(intentMulti.kind).toBe('modify_existing_app');
    expect(isAutonomousCodingIntent(intentMulti)).toBe(true);
    expect(intentMulti.suggestedFiles).toContain('calculator/index.html');
    expect(intentMulti.suggestedFiles).toContain('calculator/styles.css');
    expect(intentMulti.suggestedFiles).toContain('calculator/script.js');

    const intentOne = classifyCodingIntent(
      DETAILED_ONELINE_PROMPT,
      '',
      {workspaceHasAppFiles: true},
    );
    expect(intentOne.kind).toBe('modify_existing_app');
    expect(intentOne.suggestedFiles).toContain('calculator/index.html');
  });

  it('detailed prompt: provider gets calculator file contents and writes the fix (no generic loop)', async () => {
    const indexHtml = '<!doctype html><div id="cal"><div id="display">0</div><div id="grid"><button>1</button></div></div>';
    const stylesCss = '#cal { background: #888; width: 1000px; } #display { background: lime; }';
    const scriptJs = 'document.getElementById("display").textContent = "0";';

    harness = await new E2EHarness({
      fixtures: {
        'calculator/index.html': indexHtml,
        'calculator/styles.css': stylesCss,
        'calculator/script.js': scriptJs,
      },
      scripts: [
        filePlan('Premium iPhone calculator', [
          {
            path: 'calculator/styles.css',
            content: `:root { --bg: #000; --accent: #fa0; }
* { box-sizing: border-box; }
body { background: var(--bg); color: #fff; font-family: -apple-system, system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
#cal { background: #111; width: 100%; max-width: 360px; padding: 16px; border-radius: 24px; }
#display { background: transparent; color: #fff; font-size: 56px; text-align: right; padding: 16px; overflow: hidden; }
#grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
#grid button { aspect-ratio: 1 / 1; border: none; border-radius: 50%; background: #333; color: #fff; font-size: 24px; }
#grid button.op { background: var(--accent); }
@media (max-width: 400px) { #cal { max-width: 100%; } }
`,
          },
        ]),
      ],
    }).setup();

    const run = await harness.run(DETAILED_ONELINE_PROMPT);

    // Provider must have been called (autonomous flow), but not via a raw
    // model-driven read_file/run_command loop.
    expect(harness.provider.calls.length).toBeGreaterThan(0);
    // Every recorded tool call must carry a valid argument shape.
    for (const tc of run.toolCalls) {
      if (tc.toolName === 'read_file') expect(tc.input.path).toBeTypeOf('string');
      if (tc.toolName === 'write_file') {
        expect(tc.input.path).toBeTypeOf('string');
        expect(tc.input.content).toBeTypeOf('string');
      }
      if (tc.toolName === 'run_command') expect(tc.input.command).toBeTypeOf('string');
    }
    // The model never called raw read_file — the runtime read the files.
    expect(run.toolCalls.some((tc) => tc.toolName === 'read_file')).toBe(false);
    // The file plan was applied: new CSS in calculator/styles.css.
    const updated = await harness.readFile('calculator/styles.css');
    expect(updated).toMatch(/border-radius:\s*50%/);
    expect(updated).toMatch(/background:\s*#000|--bg:\s*#000/);
    expect(updated).toMatch(/max-width:\s*360px/);
    // The provider message must have carried the original calculator content
    // so it could write a real fix, not invent one.
    const firstCall = harness.provider.calls[0]!;
    const promptToProvider = firstCall.messages.map((m) => m.content).join('\n');
    expect(promptToProvider).toContain('#display');
    expect(promptToProvider).toContain('width: 1000px');
  });

  it('premium acceptance: rejects shallow CSS, passes iPhone-style CSS', () => {
    const prompt =
      'make the UI premium like an iPhone calculator, fix the layout, no display overflow, responsive';
    const {requirements} = extractFeatureRequirements(prompt, {appKind: 'calculator'});
    // The 'premium-ui' requirement is present.
    expect(requirements.some((r) => r.id === 'premium-ui')).toBe(true);

    // Shallow CSS: only border-radius. Should now NOT pass the premium UI
    // requirement (Phase 17G strictens the heuristic to multiple signals).
    const shallowSnapshot = `--- calculator/styles.css ---
body { background: #ccc; }
button { border-radius: 4px; }
#display { background: lime; font-family: monospace; }
`;
    const shallowReport = evaluateImplementedFeatures(requirements, shallowSnapshot);
    expect(shallowReport.missing).toContain('premium-ui');

    // Solid iPhone-style CSS: multiple premium signals + container bound.
    const goodSnapshot = `--- calculator/index.html ---
<div id="cal"><div id="display">0</div><div id="grid"><button>1</button><button>+</button><button>=</button><button>AC</button></div></div>
--- calculator/styles.css ---
:root { --bg: #000; --accent: #fa0; }
* { box-sizing: border-box; }
body { background: var(--bg); color: #fff; font-family: -apple-system, system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
#cal { background: #111; width: 100%; max-width: 360px; padding: 16px; border-radius: 24px; }
#display { color: #fff; font-size: 56px; text-align: right; overflow: hidden; }
#grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
#grid button { aspect-ratio: 1 / 1; border-radius: 50%; background: #333; color: #fff; }
@media (max-width: 400px) { #cal { max-width: 100%; } }
`;
    const goodReport = evaluateImplementedFeatures(requirements, goodSnapshot);
    expect(goodReport.missing).not.toContain('premium-ui');
  });

  it('non-premium calculator still passes functional acceptance without premium checks', () => {
    const prompt = 'Build a calculator web app using HTML CSS JS';
    const {requirements} = extractFeatureRequirements(prompt, {appKind: 'calculator'});
    // No premium-ui requirement when not requested.
    expect(requirements.some((r) => r.id === 'premium-ui')).toBe(false);
    // Functional requirements are still required.
    const snapshot = `--- index.html ---
<div id="display">0</div>
<button>1</button><button>2</button>
<button>+</button><button>=</button>
<button id="clear">AC</button>
--- app.js ---
function calculate(a,b,op){return op==='+'?a+b:0}
`;
    const report = evaluateImplementedFeatures(requirements, snapshot);
    expect(report.ok).toBe(true);
  });

  it('repeated malformed tool failures produce one concise final message (no duplicate planning blocks)', async () => {
    // Two consecutive malformed read_file{} attempts must NOT re-emit the
    // "Understanding / Plan" block twice; the final message should be one
    // clean failure summary.
    harness = await new E2EHarness({
      fixtures: {'a.txt': 'hi'},
      scripts: [
        [
          {toolName: 'read_file', toolUseId: 'rf1', type: 'tool_use_start'},
          {toolInputDelta: '{}', toolUseId: 'rf1', type: 'tool_use_delta'},
          {toolUseId: 'rf1', type: 'tool_use_end'},
          {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}},
        ],
        [
          {toolName: 'read_file', toolUseId: 'rf2', type: 'tool_use_start'},
          {toolInputDelta: '{}', toolUseId: 'rf2', type: 'tool_use_delta'},
          {toolUseId: 'rf2', type: 'tool_use_end'},
          {type: 'done', usage: {inputTokens: 1, outputTokens: 1, totalTokens: 2}},
        ],
        'Stopped after consecutive tool failures.',
      ],
    }).setup();

    const run = await harness.run('What does a.txt contain?', {mode: 'chat'});

    // No assistant message should appear more than once verbatim.
    const assistantContents = run.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.trim())
      .filter((c) => c.length > 40); // ignore tiny status lines
    const seen = new Set<string>();
    for (const c of assistantContents) {
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
  });

  it('multi-line prompt with explicit paths: paths are usable as workspace selection', () => {
    // Even before reaching the runtime, the intent classifier exposes the
    // explicit paths as suggestedFiles, which the orchestrator feeds into
    // buildWorkspaceSnapshotForIntent. This is the wiring point.
    const intent = classifyCodingIntent(
      DETAILED_MULTILINE_PROMPT.trim(),
      '',
      {workspaceHasAppFiles: true},
    );
    expect(intent.suggestedFiles).toEqual(
      expect.arrayContaining([
        'calculator/index.html',
        'calculator/styles.css',
        'calculator/script.js',
      ]),
    );
    // Path safety: traversal must not be smuggled in.
    expect(intent.suggestedFiles.every((p) => !p.includes('..'))).toBe(true);
    expect(intent.suggestedFiles.every((p) => !p.startsWith('/'))).toBe(true);
  });

  it('path-safety: traversal attempts in detailed prompts are rejected by the workspace snapshot', async () => {
    // workspaceFileSnapshot's assessPath blocks ../../etc/passwd.
    const {readWorkspaceFiles} = await import('../../src/agent/workspaceFileSnapshot.js');
    const tmp = await fs.mkdtemp(path.join((await import('node:os')).tmpdir(), 'opencode-e2e-17g-'));
    try {
      await fs.writeFile(path.join(tmp, 'calculator-x.css'), 'body{}');
      const entries = await readWorkspaceFiles(['../../etc/passwd', 'calculator-x.css'], {cwd: tmp});
      const passwd = entries.find((e) => e.path === '../../etc/passwd');
      const sibling = entries.find((e) => e.path === 'calculator-x.css');
      expect(passwd?.exists).toBe(false);
      expect(passwd?.error).toMatch(/outside|sensitive/i);
      expect(sibling?.exists).toBe(true);
    } finally {
      await fs.rm(tmp, {force: true, recursive: true});
    }
  });
});
