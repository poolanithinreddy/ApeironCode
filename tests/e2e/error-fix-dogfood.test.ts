import {afterEach, describe, expect, it} from 'vitest';

import {E2EHarness, toolChunks} from './harness.js';

const fixPlan = JSON.stringify({
  commands: [],
  files: [
    {
      content: 'export default function Home(){const theme={bodyBackgroundColor:"#0b0b0f"};return <div style={{background:theme.bodyBackgroundColor}}>Todo</div>}',
      operation: 'overwrite',
      path: 'pages/index.js',
    },
  ],
  summary: 'Define theme before reading bodyBackgroundColor',
  validation: ['npm run build'],
});

const brokenApp = {
  'package.json': '{"name":"todo","scripts":{"dev":"next dev"}}',
  'pages/index.js': 'export default function Home(){return <div style={{background:theme.bodyBackgroundColor}}>Todo</div>}',
  'pages/_app.js': 'export default function App({Component,pageProps}){return <Component {...pageProps}/>}',
  'styles/globals.css': 'body{}',
};

describe('error-fix dogfood (Phase 17D)', () => {
  let harness: E2EHarness | undefined;
  let harness2: E2EHarness | undefined;
  afterEach(async () => {
    await harness?.cleanup();
    await harness2?.cleanup();
    harness = undefined;
    harness2 = undefined;
  });

  it('1-13. pasted runtime error → search, read, fix plan, patch, concise output', async () => {
    harness = await new E2EHarness({fixtures: brokenApp, scripts: [fixPlan]}).setup();
    const run = await harness.run("Cannot read properties of undefined (reading 'bodyBackgroundColor')");
    expect(run.providerCalls.length).toBeGreaterThanOrEqual(1);
    expect(run.toolCalls.some((c) => c.toolName === 'read_file')).toBe(false);
    expect(run.toolCalls.some((c) => c.toolName === 'command_output')).toBe(false);
    expect(
      run.toolCalls.every((c) => c.toolName !== 'run_command' || typeof c.input.command === 'string'),
    ).toBe(true);
    expect(run.toolCalls.every((c) => c.toolName === 'write_file')).toBe(true);
    await harness.assertFileContains('pages/index.js', 'bodyBackgroundColor:"#0b0b0f"');
    expect(run.result.finalMessage.content).toMatch(/Fixed pages\/index\.js/);
    // Concise normal output: no giant execution summary, no garbage memory.
    expect(run.result.finalMessage.content).not.toMatch(/Execution summary:|pitfall|Provider returned/);
  });

  it('14. normal vs debug: giant execution summary is verbose-only', async () => {
    harness = await new E2EHarness({
      scripts: [toolChunks('write_file', {}), 'retry should not run'],
    }).setup();
    const normal = await harness.run('write the config file');
    expect(normal.result.finalMessage.content).not.toContain('Execution summary:');

    harness2 = await new E2EHarness({
      scripts: [toolChunks('write_file', {}), 'retry should not run'],
    }).setup();
    const debug = await harness2.run('write the config file', {verbose: true});
    expect(debug.result.finalMessage.content).toContain('Execution summary:');
  });
});
