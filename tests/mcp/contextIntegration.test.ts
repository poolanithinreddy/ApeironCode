import {describe, expect, it} from 'vitest';
import {
  prepareResourceForContext,
  previewMcpPrompt,
  requirePromptInjectionApproval,
} from '../../src/mcp/contextIntegration.js';

describe('prepareResourceForContext', () => {
  it('redacts bearer tokens and api keys', () => {
    const raw = 'Header: Authorization: Bearer abcdef.ghijkl\napi_key=sk-very-secret-token-1234567890';
    const result = prepareResourceForContext(raw, {source: 'docs/secrets.md'});
    expect(result.content).not.toContain('abcdef.ghijkl');
    expect(result.content).not.toContain('sk-very-secret-token-1234567890');
    expect(result.redactedHits).toBeGreaterThan(0);
  });

  it('truncates large content with byte budget', () => {
    const raw = 'a'.repeat(50_000);
    const result = prepareResourceForContext(raw, {maxBytes: 1_000, source: 'big.txt'});
    expect(result.bytes).toBeLessThanOrEqual(1_100);
    expect(result.truncated).toBe(true);
  });

  it('redacts known secrets passed in', () => {
    const result = prepareResourceForContext('value=mysecret123', {knownSecrets: ['mysecret123'], source: 'x'});
    expect(result.content).not.toContain('mysecret123');
  });

  it('annotates source for context', () => {
    const result = prepareResourceForContext('hello', {source: 'mcp://server/file'});
    expect(result.content.startsWith('[mcp resource: mcp://server/file]')).toBe(true);
  });
});

describe('previewMcpPrompt', () => {
  it('renders templates with arguments', () => {
    const out = previewMcpPrompt({name: 'greet', template: 'Hello, {{name}}!', args: {name: 'world'}});
    expect(out.rendered).toContain('Hello, world!');
    expect(out.knownArguments).toEqual(['name']);
    expect(out.injection).toBe('requires-confirmation');
  });

  it('redacts secrets even from rendered preview', () => {
    const out = previewMcpPrompt({name: 'leak', template: 'token=ghp_supersecretvaluewithlength12345678', args: {}});
    expect(out.rendered).not.toContain('ghp_supersecretvaluewithlength12345678');
  });

  it('falls back when template missing', () => {
    const out = previewMcpPrompt({name: 'no-template'});
    expect(out.rendered).toContain('no-template');
  });
});

describe('requirePromptInjectionApproval', () => {
  it('rejects without explicit approval', () => {
    const result = requirePromptInjectionApproval({approved: false});
    expect(result.injected).toBe(false);
    expect(result.error).toMatch(/explicit/);
  });
  it('accepts explicit approval', () => {
    const result = requirePromptInjectionApproval({approved: true});
    expect(result.injected).toBe(true);
  });
});
