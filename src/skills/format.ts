import {starterSkillNames} from './generator.js';
import type {LoadedSkill, SkillRunPlan} from './types.js';

export const formatSkillList = (skills: LoadedSkill[]): string => {
  if (skills.length === 0) {
    return 'No local skills found. Run `apeironcode skill create fix-tests` or `apeironcode skill generate "..."`.';
  }

  return skills
    .map((skill) => `${skill.metadata.name} | ${skill.metadata.safetyLevel} | ${skill.metadata.description}`)
    .join('\n');
};

export const formatSkillTemplates = (): string => [
  'Skill Templates',
  ...starterSkillNames.map((name) => `- ${name} | apeironcode skill create ${name}`),
].join('\n');

export interface SkillBrowserFormatOptions {
  filter?: string;
  search?: string;
}

const isDisabled = (skill: LoadedSkill): boolean => skill.metadata.tags.includes('disabled');
const isTrusted = (skill: LoadedSkill): boolean => skill.metadata.tags.includes('trusted');
const trustLabel = (skill: LoadedSkill): string => {
  if (isDisabled(skill)) {
    return 'disabled';
  }
  if (isTrusted(skill)) {
    return 'trusted';
  }
  return skill.metadata.requiredPermissions.length > 0 ? 'approval-gated' : 'scoped';
};

const matchesSkillSearch = (skill: LoadedSkill, search: string): boolean => {
  const haystack = [
    skill.metadata.name,
    skill.metadata.description,
    ...skill.metadata.tags,
    ...skill.metadata.allowedTools,
    ...skill.metadata.examples,
    ...skill.metadata.triggers,
  ].join(' ').toLowerCase();
  return haystack.includes(search.toLowerCase());
};

export const formatSkillBrowser = (skills: LoadedSkill[], options: SkillBrowserFormatOptions = {}): string => {
  const filter = options.filter?.trim().toLowerCase();
  const search = options.search?.trim();
  const filtered = skills
    .filter((skill) => {
      if (filter === 'enabled') {
        return !isDisabled(skill);
      }
      if (filter === 'disabled') {
        return isDisabled(skill);
      }
      if (filter === 'trusted') {
        return isTrusted(skill);
      }
      if (filter === 'risky') {
        return skill.metadata.requiredPermissions.length > 0 || skill.metadata.safetyLevel === 'high';
      }
      return true;
    })
    .filter((skill) => search ? matchesSkillSearch(skill, search) : true);

  if (skills.length === 0) {
    return [
      'Skill Browser',
      'No installed skills yet.',
      '',
      'Start with:',
      '- apeironcode skill create explain-repo',
      '- apeironcode skill create fix-tests',
      '- /skill templates',
    ].join('\n');
  }

  if (filtered.length === 0) {
    return [
      'Skill Browser',
      `No skills matched${filter ? ` filter=${filter}` : ''}${search ? ` search="${search}"` : ''}.`,
      'Try `apeironcode skill templates` or clear the filter.',
    ].join('\n');
  }

  return [
    'Skill Browser',
    filter || search ? `Filters: ${[filter ? `filter=${filter}` : '', search ? `search="${search}"` : ''].filter(Boolean).join(' | ')}` : 'Filters: none',
    ...filtered.map((skill) => [
      '',
      `${skill.metadata.name} | safety=${skill.metadata.safetyLevel} | version=${skill.metadata.version}`,
      `Status: ${isDisabled(skill) ? 'disabled' : 'enabled'} | Trust: ${trustLabel(skill)}`,
      `Description: ${skill.metadata.description}`,
      `Allowed tools: ${skill.metadata.allowedTools.join(', ') || 'none'}`,
      `Required permissions: ${skill.metadata.requiredPermissions.join(', ') || 'none'}`,
      `Tags: ${skill.metadata.tags.join(', ') || 'none'}`,
      `Example: ${skill.metadata.examples[0] ?? `apeironcode skill run ${skill.metadata.name} --input "..."`}`,
    ].join('\n')),
  ].join('\n');
};

export const formatSkillDetail = (skill: LoadedSkill): string => [
  `Skill: ${skill.metadata.name}`,
  `Description: ${skill.metadata.description}`,
  `Version: ${skill.metadata.version}`,
  `Safety: ${skill.metadata.safetyLevel}`,
  `Allowed tools: ${skill.metadata.allowedTools.join(', ') || 'none'}`,
  `Required permissions: ${skill.metadata.requiredPermissions.join(', ') || 'none'}`,
  `Triggers: ${skill.metadata.triggers.join(', ') || 'none'}`,
  '',
  skill.markdown,
].join('\n');

export const formatSkillRunPlan = (plan: SkillRunPlan): string => [
  `Skill run plan: ${plan.skillName}`,
  `Safety: ${plan.safetyLevel}`,
  `Allowed tools: ${plan.allowedTools.join(', ') || 'none'}`,
  `Required permissions: ${plan.requiredPermissions.join(', ') || 'none'}`,
  '',
  plan.prompt,
].join('\n');
