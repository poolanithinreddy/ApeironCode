import {describe, expect, it, beforeEach, vi} from 'vitest';
import {LspContextBuilder} from '../../src/lsp/context.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('LspContextBuilder', () => {
  let builder: LspContextBuilder;

  beforeEach(() => {
    builder = new LspContextBuilder();
  });

  it('should build LSP context summary', async () => {
    const summary = await builder.buildSummary(['TypeScript', 'Python']);

    expect(summary).toBeDefined();
    expect(summary.enabled).toBe(true);
    expect(summary.languages).toContain('TypeScript');
    expect(summary.languages).toContain('Python');
  });

  it('should format context for prompt', async () => {
    const summary = await builder.buildSummary(['TypeScript']);
    const formatted = builder.formatContextForPrompt(summary);

    expect(typeof formatted).toBe('string');
    if (summary.mode === 'lsp' || summary.mode === 'fallback') {
      expect(formatted.length).toBeGreaterThan(0);
    }
  });

  it('should format context for summary', async () => {
    const summary = await builder.buildSummary(['TypeScript']);
    const formatted = builder.formatContextForSummary(summary);

    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('Code Intelligence');
    expect(formatted).toContain('sessions:');
    expect(formatted).toContain('cache:');
  });

  it('should handle empty language list', async () => {
    const summary = await builder.buildSummary([]);

    expect(summary.languages).toEqual([]);
    expect(['disabled', 'fallback', 'lsp']).toContain(summary.mode);
  });

  it('should include install hints for missing servers', async () => {
    const summary = await builder.buildSummary(['TypeScript', 'Go']);

    if (summary.missingServers.length > 0) {
      expect(summary.notes.length).toBeGreaterThan(0);
    }
  });
});
