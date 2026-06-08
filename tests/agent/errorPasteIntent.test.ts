import {describe, expect, it} from 'vitest';

import {detectErrorPaste} from '../../src/agent/errorPasteIntent.js';

describe('detectErrorPaste', () => {
  it('parses "Cannot read properties of undefined (reading bodyBackgroundColor)"', () => {
    const r = detectErrorPaste("Cannot read properties of undefined (reading 'bodyBackgroundColor')");
    expect(r.isError).toBe(true);
    if (!r.isError) return;
    expect(r.errorType).toBe('undefined-property');
    expect(r.symbol).toBe('bodyBackgroundColor');
    expect(r.likelySearchTerms).toContain('bodyBackgroundColor');
    expect(r.shouldUseFilePlan).toBe(true);
    expect(r.likelyFiles).toContain('pages/_app.js');
  });

  it('parses TypeError, ReferenceError, SyntaxError, module not found', () => {
    expect(detectErrorPaste('TypeError: x.map is not a function').isError).toBe(true);
    const ref = detectErrorPaste('ReferenceError: themeColor is not defined');
    expect(ref.isError && ref.symbol).toBe('themeColor');
    expect(detectErrorPaste('SyntaxError: Unexpected token <').isError).toBe(true);
    const mod = detectErrorPaste("Module not found: Can't resolve 'next/image'");
    expect(mod.isError && mod.errorType).toBe('module-not-found');
  });

  it('parses Next.js build error and flags shouldRunBuild', () => {
    const r = detectErrorPaste('Failed to compile.\n./pages/index.js\nType error: Property does not exist');
    expect(r.isError).toBe(true);
    if (!r.isError) return;
    expect(r.errorType).toBe('next-build');
    expect(r.shouldRunBuild).toBe(true);
  });

  it('does not treat normal chat or build requests as a pasted error', () => {
    expect(detectErrorPaste('hi there').isError).toBe(false);
    expect(detectErrorPaste('build a todo app and fix the styling').isError).toBe(false);
    expect(detectErrorPaste('can you improve the error handling in this module').isError).toBe(false);
  });
});
