import {describe, expect, it} from 'vitest';
import {
  createSkillDraftFromWorkflow,
  formatSkillDraftAsMarkdown,
  suggestSkillName,
} from '../../src/workflows/skillify.js';
import {parseMarkdownFrontmatter} from '../../src/workflows/markdown/frontmatter.js';

describe('suggestSkillName', () => {
  it('creates a slug from description', () => {
    const name = suggestSkillName('React performance optimization');
    expect(name).toMatch(/^[a-z0-9-]+$/u);
    expect(name).not.toMatch(/^-|-$/u);
  });

  it('handles empty input', () => {
    const name = suggestSkillName('');
    expect(name).toBe('custom-skill');
  });

  it('handles special characters', () => {
    const name = suggestSkillName('Fix!!!  TypeScript   errors....');
    expect(name).toMatch(/^[a-z0-9-]+$/u);
  });
});

describe('createSkillDraftFromWorkflow', () => {
  it('creates a valid SKILL.md draft', () => {
    const draft = createSkillDraftFromWorkflow({
      name: 'react-perf',
      description: 'Optimize React rendering performance.',
      whenToUse: 'React, memoization, slow renders',
      allowedTools: ['read_file', 'grep_search'],
      tokenBudget: 800,
      body: 'When asked about React performance:\n1. Check for unnecessary re-renders.\n2. Use React.memo.',
    });

    expect(draft.name).toBe('react-perf');
    expect(draft.slug).toBe('react-perf');
    expect(draft.frontmatter['name']).toBe('react-perf');
    expect(draft.frontmatter['description']).toBe('Optimize React rendering performance.');
    expect(draft.frontmatter['progressiveDisclosure']).toBe(true);
    expect(draft.frontmatter['tokenBudget']).toBe(800);
    expect(draft.body).toContain('Check for unnecessary re-renders');
  });

  it('suggests name from description when no name given', () => {
    const draft = createSkillDraftFromWorkflow({
      description: 'Security audit checklist',
      body: 'Checklist content.',
    });
    expect(draft.name).toMatch(/^[a-z0-9-]+$/u);
    expect(draft.frontmatter['name']).toBe(draft.name);
  });

  it('produces valid markdown with parseable frontmatter', () => {
    const draft = createSkillDraftFromWorkflow({
      name: 'test-skill',
      description: 'Test description.',
      body: 'Skill body content.',
    });
    const parsed = parseMarkdownFrontmatter(draft.markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data['name']).toBe('test-skill');
    expect(parsed.body).toContain('Skill body content.');
  });

  it('redacts secrets matching API key patterns from description and body', () => {
    const draft = createSkillDraftFromWorkflow({
      description: 'Use api_key=supersecretvalue123',
      body: 'Call with token=mysecrettoken to authenticate. BEARER supersecrettoken123',
    });
    // Redaction patterns should have cleaned up the patterns
    // The draft markdown should not expose raw secret-like key=value patterns
    expect(draft.markdown).not.toContain('supersecretvalue123');
  });
});

describe('formatSkillDraftAsMarkdown', () => {
  it('returns the markdown string', () => {
    const draft = createSkillDraftFromWorkflow({
      name: 'fmt-test',
      description: 'Format test.',
      body: 'Body here.',
    });
    const md = formatSkillDraftAsMarkdown(draft);
    expect(md).toContain('---');
    expect(md).toContain('fmt-test');
    expect(md).toContain('Body here.');
  });
});
