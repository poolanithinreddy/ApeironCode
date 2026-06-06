import {describe, expect, it} from 'vitest';

import {
  buildVisualCorrectionDirective,
  evaluateVisual,
  formatVisualAcceptanceReport,
  type VisualInputs,
} from '../../src/agent/visualAcceptance.js';
import type {StaticAppEntry} from '../../src/agent/staticAppEntry.js';

const entry = (over: Partial<StaticAppEntry> = {}): StaticAppEntry => ({
  dir: 'calculator',
  htmlPath: 'calculator/index.html',
  missing: [],
  scripts: ['calculator/script.js'],
  styles: ['calculator/styles.css'],
  ...over,
});

const base = (over: Partial<VisualInputs> = {}): VisualInputs => ({
  changedFiles: [],
  css: '',
  entry: entry(),
  html: '<html><body></body></html>',
  js: '',
  prompt: 'fix the calculator',
  ...over,
});

const WEAK_CSS = `.btn { border-radius: 4px; color: #333; }`;

const PREMIUM_IPHONE_CSS = `
:root { --bg: #000; }
* { box-sizing: border-box; }
body { background: #000000; min-height: 100vh; }
.calculator { max-width: 360px; width: min(360px, 100%); margin: 0 auto; }
.display { overflow-wrap: anywhere; }
.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
button { border-radius: 50%; aspect-ratio: 1; }
.operator { background: #ff9500; }
.ac { background: #a5a5a5; }
.zero { grid-column: span 2; }
@media (max-width: 480px) { .calculator { width: 100%; } }
`;

describe('evaluateVisual', () => {
  it('fails a weak color-only plan for an iPhone premium request', () => {
    const report = evaluateVisual(base({css: WEAK_CSS, prompt: 'make it a premium iphone calculator, fix the layout, no overflow'}));
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual(expect.arrayContaining([
      'bounded-container', 'no-overflow', 'grid-4col', 'operator-orange', 'circular-buttons',
    ]));
  });

  it('passes a strong iPhone-style premium plan', () => {
    const report = evaluateVisual(base({
      css: PREMIUM_IPHONE_CSS,
      prompt: 'make it a premium iphone calculator, fix the layout, no overflow, responsive',
    }));
    expect(report.ok).toBe(true);
    expect(formatVisualAcceptanceReport(report)).toMatch(/Browser smoke: passed/);
    expect(formatVisualAcceptanceReport(report)).toMatch(/Open calculator\/index\.html/);
  });

  it('fails when linked CSS/JS files are missing', () => {
    const report = evaluateVisual(base({css: PREMIUM_IPHONE_CSS, entry: entry({missing: ['calculator/styles.css']})}));
    expect(report.ok).toBe(false);
    expect(report.failed).toContain('linked-assets-exist');
  });

  it('fails when the edited CSS is not the one linked by the entry', () => {
    const report = evaluateVisual(base({
      css: PREMIUM_IPHONE_CSS,
      changedFiles: ['styles.css'], // root file, but entry links calculator/styles.css
      prompt: 'fix the calculator layout',
    }));
    expect(report.ok).toBe(false);
    expect(report.failed).toContain('edited-css-linked');
  });

  it('accepts editing the correctly linked nested CSS', () => {
    const report = evaluateVisual(base({
      css: PREMIUM_IPHONE_CSS,
      changedFiles: ['calculator/styles.css'],
      prompt: 'fix the calculator layout',
    }));
    expect(report.failed).not.toContain('edited-css-linked');
  });

  it('skips iPhone/premium checks for a plain request', () => {
    const report = evaluateVisual(base({css: 'body{background:#fff}', prompt: 'tweak the text'}));
    expect(report.checks.find((c) => c.id === 'grid-4col')).toBeUndefined();
    expect(report.ok).toBe(true);
  });

  it('builds a correction directive naming the entry and failures', () => {
    const report = evaluateVisual(base({css: WEAK_CSS, prompt: 'premium iphone calculator, fix layout, no overflow'}));
    const directive = buildVisualCorrectionDirective(report);
    expect(directive).toMatch(/calculator\/index\.html/);
    expect(directive).toMatch(/orange/i);
  });
});
