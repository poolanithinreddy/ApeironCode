/**
 * Formats skill definitions for injection into system prompts.
 * Respects token budget. Redacts secrets. References not auto-loaded.
 */

import type {SkillDefinition} from '../types.js';
import {redactSecrets} from '../../share/redactor.js';

export type SkillFormatMode = 'compact' | 'full';

const DEFAULT_TOKEN_BUDGET = 800;
const CHARS_PER_TOKEN = 4;

const truncateToTokenBudget = (text: string, tokenBudget: number): string => {
  const charLimit = tokenBudget * CHARS_PER_TOKEN;
  if (text.length <= charLimit) return text;
  return text.slice(0, charLimit) + '\n[...truncated for token budget]';
};

export const formatSkillForPrompt = (
  skill: SkillDefinition,
  mode: SkillFormatMode = 'compact',
): string => {
  const budget = skill.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const lines: string[] = [`## Skill: ${skill.name}`];

  lines.push(`Description: ${skill.description}`);
  if (skill.whenToUse) lines.push(`When to use: ${skill.whenToUse}`);
  if (skill.allowedTools.length > 0) {
    lines.push(`Allowed tools: ${skill.allowedTools.join(', ')}`);
  }

  if (mode === 'full' && skill.body) {
    const safeBody = redactSecrets(skill.body);
    lines.push('');
    lines.push(safeBody);
  }

  if (skill.references.length > 0) {
    lines.push(`References (not auto-loaded): ${skill.references.join(', ')}`);
  }

  const combined = lines.join('\n');
  return truncateToTokenBudget(redactSecrets(combined), budget);
};

export const formatSkillsForPrompt = (
  skills: SkillDefinition[],
  mode: SkillFormatMode = 'compact',
  totalTokenBudget = 2400,
): string => {
  if (skills.length === 0) return '';

  const perSkillBudget = Math.floor(totalTokenBudget / skills.length);
  const parts = skills.map((skill) => {
    const adjusted: SkillDefinition = {
      ...skill,
      tokenBudget: Math.min(skill.tokenBudget ?? DEFAULT_TOKEN_BUDGET, perSkillBudget),
    };
    return formatSkillForPrompt(adjusted, mode);
  });

  return `Active Skills:\n${parts.join('\n\n')}`;
};
