import {describe, expect, it} from 'vitest';
import {
  parseMarkdownFrontmatter,
  stripFrontmatter,
  stringifyMarkdownFrontmatter,
  validateFrontmatterObject,
} from '../../src/workflows/markdown/frontmatter.js';

describe('parseMarkdownFrontmatter', () => {
  it('parses basic frontmatter', () => {
    const text = `---
name: my-agent
description: A test agent
---

Body content here.`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['name']).toBe('my-agent');
    expect(result.data['description']).toBe('A test agent');
    expect(result.body.trim()).toBe('Body content here.');
  });

  it('parses inline arrays', () => {
    const text = `---
tools: [read_file, grep_search, write_file]
---
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['tools']).toEqual(['read_file', 'grep_search', 'write_file']);
  });

  it('parses booleans', () => {
    const text = `---
progressiveDisclosure: true
background: false
---
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['progressiveDisclosure']).toBe(true);
    expect(result.data['background']).toBe(false);
  });

  it('parses numbers', () => {
    const text = `---
maxTurns: 8
tokenBudget: 1200
---
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['maxTurns']).toBe(8);
    expect(result.data['tokenBudget']).toBe(1200);
  });

  it('handles no frontmatter', () => {
    const text = 'No frontmatter here.';
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({});
    expect(result.body).toBe('No frontmatter here.');
  });

  it('rejects unclosed frontmatter delimiter', () => {
    const text = `---
name: test
description: missing closing delimiter
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/delimiter not closed/u);
  });

  it('rejects frontmatter that exceeds line limit', () => {
    const lines = ['---'];
    for (let i = 0; i < 210; i++) {
      lines.push(`key${i}: value`);
    }
    lines.push('---');
    const text = lines.join('\n');
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line limit/u);
  });

  it('handles quoted string values', () => {
    const text = `---
name: "my agent"
description: 'another name'
---
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['name']).toBe('my agent');
    expect(result.data['description']).toBe('another name');
  });

  it('preserves body markdown', () => {
    const text = `---
name: test
---

# Heading

Some **markdown** content.

- item 1
- item 2
`;
    const result = parseMarkdownFrontmatter(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toContain('# Heading');
    expect(result.body).toContain('**markdown**');
    expect(result.body).toContain('- item 1');
  });
});

describe('stripFrontmatter', () => {
  it('strips frontmatter correctly', () => {
    const text = `---
name: test
---

Body here.`;
    const result = stripFrontmatter(text);
    expect(result.trim()).toBe('Body here.');
    expect(result).not.toContain('---');
    expect(result).not.toContain('name: test');
  });

  it('returns original text when no frontmatter', () => {
    const text = 'Just a body.';
    expect(stripFrontmatter(text)).toBe(text);
  });
});

describe('stringifyMarkdownFrontmatter', () => {
  it('serializes data and body', () => {
    const data = {name: 'test', tools: ['read_file', 'write_file'], enabled: true, budget: 100};
    const body = 'Do something.';
    const result = stringifyMarkdownFrontmatter(data, body);
    expect(result).toContain('---');
    expect(result).toContain('name: test');
    expect(result).toContain('tools: [read_file, write_file]');
    expect(result).toContain('enabled: true');
    expect(result).toContain('budget: 100');
    expect(result).toContain('Do something.');
  });

  it('returns body when no data', () => {
    const result = stringifyMarkdownFrontmatter({}, 'Just body.');
    expect(result).toBe('Just body.');
  });

  it('round-trips through parse', () => {
    const data = {name: 'round-trip', description: 'test', maxTurns: 5};
    const body = 'Prompt body.';
    const markdown = stringifyMarkdownFrontmatter(data, body);
    const parsed = parseMarkdownFrontmatter(markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data['name']).toBe('round-trip');
    expect(parsed.data['maxTurns']).toBe(5);
    expect(parsed.body.trim()).toBe('Prompt body.');
  });
});

describe('validateFrontmatterObject', () => {
  it('accepts valid objects', () => {
    expect(validateFrontmatterObject({name: 'foo', count: 3, active: true, tags: ['a', 'b']})).toBe(true);
  });

  it('rejects null', () => {
    expect(validateFrontmatterObject(null)).toBe(false);
  });

  it('rejects arrays', () => {
    expect(validateFrontmatterObject([])).toBe(false);
  });

  it('rejects nested objects', () => {
    expect(validateFrontmatterObject({nested: {deep: 'value'}})).toBe(false);
  });
});
