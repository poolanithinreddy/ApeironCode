/**
 * Selects relevant skills for a given prompt using keyword matching
 * against name, description, and whenToUse fields.
 * Only metadata is used — no body/references loaded at this stage.
 */

import type {SkillDefinition} from '../types.js';

export interface SelectSkillsOptions {
  /** Maximum number of skills to select. Default: 3 */
  maxSkills?: number;
}

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[\s,;|]+/u).filter((t) => t.length > 2);

const scoreSkill = (skill: SkillDefinition, promptTokens: string[]): number => {
  const skillTokens = tokenize(
    [skill.name, skill.description, skill.whenToUse].join(' '),
  );
  const skillSet = new Set(skillTokens);
  let score = 0;
  for (const pt of promptTokens) {
    if (skillSet.has(pt)) score++;
  }
  return score;
};

export const selectRelevantSkills = (
  prompt: string,
  skills: SkillDefinition[],
  options: SelectSkillsOptions = {},
): SkillDefinition[] => {
  if (skills.length === 0 || !prompt.trim()) return [];
  const maxSkills = options.maxSkills ?? 3;
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return [];

  const scored = skills
    .map((skill) => ({skill, score: scoreSkill(skill, promptTokens)}))
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills);

  return scored.map(({skill}) => skill);
};
