/**
 * Phase 18A browser/rendered-UI smoke dogfood.
 *
 * Verifies that the coding orchestrator runs a rendered-page smoke for
 * visual/layout repair prompts and reports the result HONESTLY in the final
 * summary: it must not claim a premium UI passed when the rendered page is
 * broken, and it must tell the user exactly which file to open. The smoke is
 * report-only (adds no provider/tool calls), so it never destabilizes the
 * deterministic multi-turn flows.
 *
 * Scripted provider, temp workspace, no network.
 */
import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness} from './harness.js';

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

const INDEX_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="styles.css"></head>
<body><div class="card"><h1>Hello</h1><p>profile</p></div>
<script src="app.js"></script></body></html>`;

const appFixtures = {
  'index.html': INDEX_HTML,
  'styles.css': '.card{padding:10px}',
  'app.js': 'console.log("hi")',
};

const WEAK_PREMIUM = filePlan('Tweak colors', [
  {path: 'styles.css', content: '.card{color:#333;border-radius:4px}'},
]);

const STRONG_PREMIUM = filePlan('Premium responsive layout', [
  {
    path: 'styles.css',
    content: `* { box-sizing: border-box; }
body { background: #0b0b0f; color: #fff; min-height: 100vh; display: flex; justify-content: center; }
.card { max-width: 420px; width: 100%; margin: 40px auto; padding: 24px; border-radius: 16px; overflow-wrap: anywhere; }
@media (max-width: 480px) { .card { width: 100%; } }`,
  },
]);

const PREMIUM_PROMPT = 'the layout is broken and the card overflows, make it premium and responsive';

describe('Phase 18A browser smoke dogfood', () => {
  let harness: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it('honestly reports "Browser smoke: failed" for a weak color-only fix', async () => {
    harness = await new E2EHarness({fixtures: appFixtures, scripts: [WEAK_PREMIUM]}).setup();
    const mod = await harness.run(PREMIUM_PROMPT);
    expect(mod.result.finalMessage.content).toMatch(/Browser smoke: failed/);
    // It must surface a concrete correction directive, not a vague pass.
    expect(mod.result.finalMessage.content).toMatch(/container is bounded|display cannot obviously overflow/i);
    expect(mod.result.finalMessage.content).not.toMatch(/Browser smoke: passed/);
  });

  it('passes the smoke for a real responsive layout fix and says which file to open', async () => {
    harness = await new E2EHarness({fixtures: appFixtures, scripts: [STRONG_PREMIUM]}).setup();
    const mod = await harness.run(PREMIUM_PROMPT);
    expect(mod.result.finalMessage.content).toMatch(/Browser smoke: passed/);
    expect(mod.result.finalMessage.content).toMatch(/Open index\.html/);
  });

  it('does not run a rendered smoke for a non-visual edit (read package.json)', async () => {
    harness = await new E2EHarness({
      fixtures: {'package.json': '{"name":"x","version":"1.0.0"}'},
      scripts: ['SHOULD NOT RUN'],
    }).setup();
    const run = await harness.run('read package.json');
    expect(run.result.finalMessage.content).not.toMatch(/Browser smoke/);
  });
});
