import {describe, expect, it} from 'vitest';

import {resolveWorkspacePath, toDisplayPath, toServerId} from '../../src/lsp/sessionPaths.js';

describe('LSP session path helpers', () => {
  it('formats display paths relative to the workspace when possible', () => {
    expect(toDisplayPath('/workspace/src/index.ts', '/workspace')).toBe('src/index.ts');
    expect(toDisplayPath('/other/index.ts', '/workspace')).toBe('/other/index.ts');
    expect(toDisplayPath('src/index.ts', '/workspace')).toBe('src/index.ts');
  });

  it('resolves server identifiers and workspace paths', () => {
    expect(toServerId({serverCommand: 'typescript-language-server', serverArgs: ['--stdio']}))
      .toBe('typescript-language-server --stdio');
    expect(resolveWorkspacePath('/workspace', 'src/index.ts')).toBe('/workspace/src/index.ts');
    expect(resolveWorkspacePath('/workspace', '/tmp/index.ts')).toBe('/tmp/index.ts');
  });
});
