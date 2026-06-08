import type {LoadedSkill} from './types.js';

export const findMatchingSkills = (skills: LoadedSkill[], prompt: string): LoadedSkill[] => {
  const normalized = prompt.toLowerCase();
  return skills.filter((skill) =>
    [skill.metadata.name, ...skill.metadata.triggers, ...skill.metadata.tags]
      .some((trigger) => normalized.includes(trigger.toLowerCase())),
  );
};
