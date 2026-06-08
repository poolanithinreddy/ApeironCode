import {describe, expect, it} from 'vitest';

import {extractSubmittedInput} from '../../src/ui/InputBox.js';

describe('InputBox helpers', () => {
  it('extracts submitted slash commands from newline-delimited PTY input', () => {
    expect(extractSubmittedInput('/commands beginner\n')).toBe('/commands beginner');
    expect(extractSubmittedInput('/memory review\r')).toBe('/memory review');
    expect(extractSubmittedInput('/team run fix tests --dry-run\r\n')).toBe('/team run fix tests --dry-run');
  });

  it('does not treat ordinary typing as a submitted command', () => {
    expect(extractSubmittedInput('/commands beginner')).toBeNull();
    expect(extractSubmittedInput('explain this repo')).toBeNull();
  });

  it('preserves multi-line pasted content with trailing newline (Phase 17G)', () => {
    // The real dogfood failure: a 10-line paste used to be truncated to its
    // first line. Now the whole content reaches the runtime intact.
    const multiline = [
      'Fix the calculator UI.',
      '',
      'Problems:',
      '- Display overflows.',
      '- Buttons not rounded.',
      'Read calculator/index.html, calculator/styles.css.',
      '',
    ].join('\n');
    const result = extractSubmittedInput(multiline);
    expect(result).not.toBeNull();
    expect(result).toContain('Fix the calculator UI.');
    expect(result).toContain('- Display overflows.');
    expect(result).toContain('- Buttons not rounded.');
    expect(result).toContain('Read calculator/index.html, calculator/styles.css.');
    expect((result ?? '').split('\n').length).toBeGreaterThanOrEqual(5);
  });

  it('preserves explicit file paths across multiple lines', () => {
    const value = 'apply a complete fix\ncalculator/index.html\ncalculator/styles.css\ncalculator/script.js\n';
    const result = extractSubmittedInput(value);
    expect(result).not.toBeNull();
    expect(result).toContain('calculator/index.html');
    expect(result).toContain('calculator/styles.css');
    expect(result).toContain('calculator/script.js');
  });

  it('returns null while user is still composing a multi-line paste (no trailing newline)', () => {
    // The user is mid-paste / mid-edit; don't submit yet.
    expect(extractSubmittedInput('hello\nworld')).toBeNull();
    expect(extractSubmittedInput('line1\nline2\nline3')).toBeNull();
  });

  it('handles CRLF newlines from terminals consistently', () => {
    const value = 'first line\r\nsecond line\r\n';
    const result = extractSubmittedInput(value);
    expect(result).toBe('first line\nsecond line');
  });

  it('normalizes whitespace-only content to null', () => {
    expect(extractSubmittedInput('   \n')).toBeNull();
    expect(extractSubmittedInput('\n\n\n')).toBeNull();
  });
});
