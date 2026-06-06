/**
 * Phase 18A real product dogfood.
 *
 * Covers the user-visible upgrades shipped in 18A:
 *  - multi-line premium prompt preservation through the input layer
 *  - the file-plan prompt carries the premium-UI repair directive for visual
 *    tasks (not for plain edits)
 *  - +0/-0 (no-op) writes are reported as unchanged, not as progress
 *  - nested-app entry detection targets the file the user actually opens
 *
 * Scripted provider, temp workspaces, no network.
 */
import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';
import {extractSubmittedInput} from '../../src/ui/InputBox.js';
import {buildFilePlanPrompt, wantsVisualRepair} from '../../src/agent/filePlanProtocol.js';
import {classifyCodingIntent} from '../../src/agent/codingIntent.js';
import {detectStaticAppEntry} from '../../src/agent/staticAppEntry.js';

const filePlan = (
  summary: string,
  files: Array<{path: string; content: string; operation?: 'overwrite' | 'create'}>,
): string =>
  JSON.stringify({
    summary,
    commands: [],
    validation: [],
    files: files.map((f) => ({operation: f.operation ?? 'overwrite', path: f.path, content: f.content})),
  });

const MULTILINE = [
  'The calculator UI is not premium yet. Fix the layout properly.',
  '',
  '- The display is overflowing outside the calculator body.',
  '- Use an iPhone-style layout, circular buttons, true dark background.',
  '',
].join('\n');

describe('Phase 18A real dogfood', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('preserves a multi-line premium prompt intact', () => {
    const submitted = extractSubmittedInput(MULTILINE);
    expect(submitted).toContain('display is overflowing');
    expect(submitted).toContain('iPhone-style layout');
    expect((submitted ?? '').split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('injects the premium-UI repair directive only for visual tasks', () => {
    const intent = classifyCodingIntent('fix the layout, the display overflows, make it premium', '', {
      workspaceHasAppFiles: true,
    });
    const visual = buildFilePlanPrompt(intent, '(snapshot)', 'fix the layout, the display overflows, make it premium iphone');
    expect(visual).toMatch(/PREMIUM UI REPAIR REQUIREMENTS/);
    expect(visual).toMatch(/NO overflow/);
    expect(wantsVisualRepair('fix the layout, the display overflows')).toBe(true);

    const plain = buildFilePlanPrompt(intent, '(snapshot)', 'add a new utility function to app.js');
    expect(plain).not.toMatch(/PREMIUM UI REPAIR REQUIREMENTS/);
    expect(wantsVisualRepair('add a new utility function')).toBe(false);
  });

  it('reports a +0/-0 write as unchanged, not as a real change', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'index.html': '<link rel="stylesheet" href="styles.css"><script src="app.js"></script>',
        'styles.css': 'body{margin:0}',
        'app.js': 'console.log("old")',
      },
      scripts: [filePlan('Update app', [
        {path: 'styles.css', content: 'body{margin:0}'}, // identical → no-op
        {path: 'app.js', content: 'console.log("new")'}, // real change
      ])],
    }).setup();
    const run = await harness.run('update the app and rewrite styles.css and app.js');
    expect(run.result.finalMessage.content).toMatch(/No-op \(unchanged\) files: styles\.css/);
    expect(run.result.finalMessage.content).toMatch(/Files changed: app\.js/);
  });

  it('detects the nested app entry the user actually opens', async () => {
    harness = await new E2EHarness({
      fixtures: {
        'index.html': '<h1>root marketing page</h1>',
        'calculator/index.html': '<link rel="stylesheet" href="styles.css"><script src="script.js"></script>',
        'calculator/styles.css': 'body{}',
        'calculator/script.js': '// js',
      },
      scripts: ['unused'],
    }).setup();
    const entry = await detectStaticAppEntry(
      harness.workspace,
      ['calculator/styles.css'],
      'fix the calculator layout in calculator/index.html',
    );
    expect(entry?.htmlPath).toBe('calculator/index.html');
    expect(entry?.styles).toContain('calculator/styles.css');
    expect(entry?.scripts).toContain('calculator/script.js');
    expect(entry?.missing).toEqual([]);
  });
});
