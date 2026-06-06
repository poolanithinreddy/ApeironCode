import {describe, expect, it} from 'vitest';

import {
  extractRunFacts,
  extractChangedFiles,
  extractCommandsRun,
  extractTestsRun,
  extractBlockers,
  extractNextSteps,
  formatExtractedRunFacts,
} from '../../src/projectBrain/runExtractor.js';

describe('Project Brain run extractor', () => {
  it('extracts changed files from agentResult', () => {
    const files = extractChangedFiles({agentResult: {filesChanged: ['src/app.ts', 'src/index.ts']}});
    expect(files).toContain('src/app.ts');
    expect(files).toContain('src/index.ts');
  });

  it('extracts changed files from changedFiles input', () => {
    const files = extractChangedFiles({changedFiles: ['lib/util.ts']});
    expect(files).toContain('lib/util.ts');
  });

  it('extracts npm commands from taskOutput', () => {
    const cmds = extractCommandsRun({taskOutput: 'npm test\nnpm run build\nsome other text'});
    expect(cmds.some((c) => c.startsWith('npm'))).toBe(true);
  });

  it('extracts failed tests from taskOutput', () => {
    const tests = extractTestsRun({taskOutput: 'FAIL src/app.test.ts\nPASS src/util.test.ts'});
    expect(tests.length).toBeGreaterThan(0);
  });

  it('extracts blockers from failures array', () => {
    const blockers = extractBlockers({failures: ['Type error in auth.ts', 'Test failed']});
    expect(blockers).toContain('Type error in auth.ts');
  });

  it('extracts blockers from completion gate failure', () => {
    const blockers = extractBlockers({completionGateResult: {status: 'failed', reason: 'Tests did not pass'}});
    expect(blockers.some((b) => b.includes('Tests did not pass'))).toBe(true);
  });

  it('extracts next steps from agentResult', () => {
    const steps = extractNextSteps({agentResult: {nextSteps: ['Deploy to staging', 'Run E2E tests']}});
    expect(steps).toContain('Deploy to staging');
  });

  it('redacts secrets in extracted facts', () => {
    const facts = extractRunFacts({
      agentResult: {finalMessage: 'done, api_key=sk-secretsecretsecretsecret'},
      prompt: 'build with token=ghp_supersecretghptoken123456789012',
    });
    expect(facts.promptSummary).not.toContain('ghp_supersecretghptoken123456789012');
    expect(facts.validationResult).not.toContain('sk-secret');
  });

  it('does not invent missing data', () => {
    const facts = extractRunFacts({});
    expect(facts.changedFiles).toHaveLength(0);
    expect(facts.commandsRun).toHaveLength(0);
    expect(facts.blockers).toHaveLength(0);
    expect(facts.nextSteps).toHaveLength(0);
  });

  it('formatExtractedRunFacts produces redacted output', () => {
    const facts = extractRunFacts({
      agentResult: {filesChanged: ['src/a.ts'], finalMessage: 'ok, token=sk-abc123456789012345678901'},
    });
    const text = formatExtractedRunFacts(facts);
    expect(text).toContain('src/a.ts');
    expect(text).not.toContain('sk-abc');
  });
});
