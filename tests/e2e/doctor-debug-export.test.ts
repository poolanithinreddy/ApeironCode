import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {ConfigStore} from '../../src/config/config.js';
import {formatDoctorReport, runDoctor} from '../../src/diagnostics/doctor.js';
import {formatSystemReportMarkdown, generateSystemReport} from '../../src/diagnostics/report.js';
import type {AgentSessionRecord} from '../../src/multisession/types.js';
import {providerRegistry} from '../../src/providers/registry.js';
import {SessionExporter} from '../../src/share/exportSession.js';
import {StructuredLogger, readRecentLogLines} from '../../src/utils/structuredLogger.js';
import {clearSpans, formatTraceSummary, startSpan} from '../../src/utils/trace.js';

describe('doctor, debug, and export acceptance E2E', () => {
  let previousHome: string | undefined;
  let home = '';
  let cwd = '';

  afterEach(async () => {
    process.env.HOME = previousHome;
    clearSpans();
    await fs.rm(home, {force: true, recursive: true});
    await fs.rm(cwd, {force: true, recursive: true});
  });

  const setup = async () => {
    previousHome = process.env.HOME;
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-doctor-home-'));
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'opencode-doctor-cwd-'));
    process.env.HOME = home;
    const store = new ConfigStore(cwd);
    await store.patchUserConfig({approvalMode: 'bypass', defaultModel: 'mock-coder', defaultProvider: 'mock'});
    return store.load();
  };

  it('runs doctor offline and reports major subsystems without secrets', async () => {
    process.env.LINEAR_API_KEY = 'linear-secret-value';
    const config = await setup();
    const report = await runDoctor({config, cwd, providerRegistry});
    const output = formatDoctorReport(report);

    expect(output).toContain('Provider selection');
    expect(output).toContain('connector');
    expect(output).toContain('sandbox');
    expect(output).toContain('Token efficiency');
    expect(output).not.toContain('linear-secret-value');
  });

  it('formats recent traces and structured logs with redaction', async () => {
    const config = await setup();
    const span = startSpan('acceptance.trace', {authorization: 'Bearer secret-token'});
    span.end();
    const traceOutput = formatTraceSummary([span.span]);
    const logDir = path.join(home, '.opencode-agent', 'logs');
    new StructuredLogger({level: 'debug', logDir}).info('token=secret-token', {apiKey: 'secret-token', config});
    await new Promise((resolve) => setTimeout(resolve, 20));
    const logs = await readRecentLogLines(logDir, 10);

    expect(traceOutput).toContain('acceptance.trace');
    expect(JSON.stringify(span.span)).not.toContain('secret-token');
    expect(logs.join('\n')).toContain('[REDACTED]');
    expect(logs.join('\n')).not.toContain('secret-token');
  });

  it('exports markdown and self-contained HTML sessions with redaction', async () => {
    await setup();
    const session: AgentSessionRecord = {
      commandsRun: ['echo ok', 'curl -H "Authorization: Bearer secret-token" example.invalid'],
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      filesChanged: ['src/index.ts'],
      filesLocked: [],
      goal: 'Export test',
      id: 'session-export-e2e',
      mode: 'feature',
      model: 'mock-coder',
      projectRoot: cwd,
      provider: 'mock',
      startedAt: new Date().toISOString(),
      status: 'completed',
      summary: 'Finished with token=secret-token',
      testsRun: ['npm test'],
      updatedAt: new Date().toISOString(),
    };
    const exporter = new SessionExporter(cwd);
    const markdown = await exporter.exportSession(session, {format: 'markdown'});
    const html = await exporter.exportSession(session, {format: 'html'});
    const markdownContent = await fs.readFile(markdown.filePath, 'utf8');
    const htmlContent = await fs.readFile(html.filePath, 'utf8');

    expect(markdownContent).toContain('# Session Report');
    expect(markdownContent).toContain('<details>');
    expect(htmlContent).toContain('<style>');
    expect(htmlContent).not.toContain('secret-token');
    expect(markdownContent).not.toContain('secret-token');
  });

  it('generates a redacted system report markdown', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-secret-token';
    const config = await setup();
    const markdown = formatSystemReportMarkdown(await generateSystemReport({config, cwd, providerRegistry}));

    expect(markdown).toContain('# ApeironCode System Report');
    expect(markdown).toContain('Connectors');
    expect(markdown).not.toContain('xoxb-secret-token');
  });
});
