import {describe, expect, it} from 'vitest';
import {selectRelevantSkills} from '../../src/workflows/skills/selector.js';
import type {SkillDefinition} from '../../src/workflows/types.js';

const makeSkill = (name: string, description: string, whenToUse: string): SkillDefinition => ({
  kind: 'skill',
  source: 'project',
  filePath: `/fake/${name}/SKILL.md`,
  name,
  description,
  whenToUse,
  allowedTools: [],
  disallowedTools: [],
  references: [],
  scripts: [],
  progressiveDisclosure: true,
  body: '',
});

const SKILLS: SkillDefinition[] = [
  makeSkill('react-performance', 'Optimize React rendering and bundle size', 'React performance, memoization, slow components'),
  makeSkill('security-review', 'Audit code for security vulnerabilities', 'security, vulnerabilities, OWASP, injection'),
  makeSkill('test-coverage', 'Improve test coverage and quality', 'tests, coverage, unit tests, integration tests'),
];

describe('selectRelevantSkills', () => {
  it('selects relevant skill by whenToUse keyword', () => {
    const selected = selectRelevantSkills('fix memoization issues in React components', SKILLS);
    expect(selected.some((s) => s.name === 'react-performance')).toBe(true);
  });

  it('selects relevant skill by description keyword', () => {
    const selected = selectRelevantSkills('improve security and check for injection vulnerabilities', SKILLS);
    expect(selected.some((s) => s.name === 'security-review')).toBe(true);
  });

  it('does not select irrelevant skills', () => {
    const selected = selectRelevantSkills('fix memoization issues in React components', SKILLS);
    // test-coverage should not be selected for a React performance query
    expect(selected.some((s) => s.name === 'test-coverage')).toBe(false);
  });

  it('returns empty array for empty skills', () => {
    const selected = selectRelevantSkills('any query', []);
    expect(selected).toHaveLength(0);
  });

  it('returns empty array for empty prompt', () => {
    const selected = selectRelevantSkills('', SKILLS);
    expect(selected).toHaveLength(0);
  });

  it('respects maxSkills limit', () => {
    const selected = selectRelevantSkills('security vulnerabilities tests coverage React', SKILLS, {maxSkills: 2});
    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('returns skills in score order (highest first)', () => {
    // 'security vulnerabilities injection OWASP' should match security-review more
    const selected = selectRelevantSkills('security vulnerabilities injection OWASP', SKILLS);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0]?.name).toBe('security-review');
  });
});
