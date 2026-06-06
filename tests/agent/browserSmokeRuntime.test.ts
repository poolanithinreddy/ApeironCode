import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  buildBrowserSmokeCorrection,
  runBrowserSmoke,
  wantsRenderedSmoke,
} from '../../src/agent/browserSmokeRuntime.js';

const PREMIUM_CSS = `
:root { --bg: #000; --accent: #ff9500; }
* { box-sizing: border-box; }
body { background: #000000; min-height: 100vh; }
.calculator { max-width: 360px; width: min(360px, 100%); margin: 0 auto; }
.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
button { border-radius: 50%; aspect-ratio: 1; }
.operator { background: #ff9500; }
@media (max-width: 480px) { .calculator { width: 100%; } }
`;

const WEAK_CSS = `.btn { border-radius: 4px; color: #333; }`;

const HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="styles.css"></head>
<body><div class="calculator"><div class="display">0</div>
<div class="keys"></div></div><script src="script.js"></script></body></html>`;

describe('browserSmokeRuntime', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-smoke-'));
  });
  afterEach(async () => {
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const writeCalc = async (dir: string, css: string): Promise<void> => {
    const base = path.join(cwd, dir);
    await fs.mkdir(base, {recursive: true});
    await fs.writeFile(path.join(base, 'index.html'), HTML, 'utf8');
    await fs.writeFile(path.join(base, 'styles.css'), css, 'utf8');
    await fs.writeFile(path.join(base, 'script.js'), '// js', 'utf8');
  };

  it('wantsRenderedSmoke triggers on visual/layout prompts only', () => {
    expect(wantsRenderedSmoke('make it a premium iphone calculator, fix the layout')).toBe(true);
    expect(wantsRenderedSmoke('the ui/ux is bad, fix overflow')).toBe(true);
    expect(wantsRenderedSmoke('read package.json')).toBe(false);
  });

  it('passes a genuinely premium nested calculator', async () => {
    await writeCalc('calculator', PREMIUM_CSS);
    const report = await runBrowserSmoke({
      changedFiles: ['calculator/styles.css'],
      cwd,
      prompt: 'premium iphone calculator, fix the layout, no overflow, responsive',
      selectedFiles: ['calculator/index.html'],
    });
    expect(report.kind).toBe('static');
    expect(report.ok).toBe(true);
    expect(report.openHint).toMatch(/calculator\/index\.html/);
    expect(buildBrowserSmokeCorrection(report)).toBeNull();
  });

  it('fails a weak color-only plan and produces a correction directive', async () => {
    await writeCalc('calculator', WEAK_CSS);
    const report = await runBrowserSmoke({
      changedFiles: ['calculator/styles.css'],
      cwd,
      prompt: 'premium iphone calculator, fix the layout, no overflow',
      selectedFiles: ['calculator/index.html'],
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual(expect.arrayContaining(['grid-4col', 'circular-buttons']));
    const directive = buildBrowserSmokeCorrection(report);
    expect(directive).toMatch(/calculator\/index\.html/);
    expect(directive).toMatch(/orange/i);
  });

  it('flags editing the wrong (unlinked root) CSS when a nested app is active', async () => {
    await writeCalc('calculator', PREMIUM_CSS);
    await fs.writeFile(path.join(cwd, 'styles.css'), PREMIUM_CSS, 'utf8');
    const report = await runBrowserSmoke({
      changedFiles: ['styles.css'], // root, but entry links calculator/styles.css
      cwd,
      prompt: 'fix the calculator layout',
      selectedFiles: ['calculator/index.html'],
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toContain('edited-css-linked');
  });

  it('reports a package app as a documented limitation, not a fake pass', async () => {
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"next-app"}', 'utf8');
    const report = await runBrowserSmoke({cwd, prompt: 'make the ui premium', changedFiles: []});
    expect(report.kind).toBe('package');
    expect(report.applicable).toBe(false);
    expect(report.limitation).toMatch(/package\/framework/i);
  });
});
