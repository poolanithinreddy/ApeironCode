import type {LoadedSkill, SkillRunPlan} from './types.js';

export const buildSkillRunPlan = (skill: LoadedSkill, input = ''): SkillRunPlan => ({
  allowedTools: skill.metadata.allowedTools,
  prompt: [
    skill.metadata.promptInstructions,
    '',
    'Skill reference:',
    skill.markdown,
    '',
    input ? `User input:\n${input}` : 'User input: (none)',
  ].join('\n'),
  requiredPermissions: skill.metadata.requiredPermissions,
  safetyLevel: skill.metadata.safetyLevel,
  skillName: skill.metadata.name,
});
